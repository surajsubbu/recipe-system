"""
Extractor agent — turns raw or partially structured data into a clean
RecipeData object.

Two entry points:
  from_structured(data, source_url)
    Used when recipe-scrapers returned structured data.
    Avoids a smart-model call — only uses the FAST model to parse
    ingredient strings like "2 cups all-purpose flour, sifted".

  from_text(text, source_url, title_hint)
    Used for YouTube transcripts or pages that recipe-scrapers couldn't
    parse. Sends up to 8 000 chars to the SMART model (claude-3.5-sonnet)
    with a strict JSON schema prompt.
"""
import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Optional

from app.agents.openrouter import FAST_MODEL, SMART_MODEL, chat_complete

logger = logging.getLogger(__name__)

# ─── Data classes ─────────────────────────────────────────────────────────────

@dataclass
class IngredientData:
    name: str
    amount: Optional[float] = None
    unit: Optional[str] = None


@dataclass
class StepData:
    order: int
    instruction: str
    timer_seconds: Optional[int] = None


@dataclass
class RecipeData:
    title: str
    description: Optional[str] = None
    source_url: Optional[str] = None
    image_url: Optional[str] = None
    cook_time: Optional[int] = None   # minutes
    prep_time: Optional[int] = None   # minutes
    servings: Optional[int] = None
    ingredients: list[IngredientData] = field(default_factory=list)
    steps: list[StepData] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _parse_servings(raw: Any) -> Optional[int]:
    """Extract an integer from strings like '4 servings', '4–6', 'makes 8'."""
    if raw is None:
        return None
    nums = re.findall(r"\d+", str(raw))
    return int(nums[0]) if nums else None


def _split_instructions(raw_instructions: str) -> list[str]:
    """Split a wall of instruction text into individual steps."""
    # Try numbered list first: "1. ...", "Step 1:", "1)"
    numbered = re.split(r"\n\s*(?:\d+[\.\)]\s*|Step\s+\d+\s*[:\-]\s*)", raw_instructions, flags=re.IGNORECASE)
    steps = [s.strip() for s in numbered if s.strip()]
    if len(steps) > 1:
        return steps
    # Fallback: split on double-newline
    paras = [p.strip() for p in raw_instructions.split("\n\n") if p.strip()]
    return paras if len(paras) > 1 else [raw_instructions.strip()]


def _extract_json(raw: str) -> Any:
    """Extract and parse the first JSON object or array from a string.

    Handles:
      - Markdown code fences
      - Truncated JSON (finish_reason=length) by appending missing brackets
    """
    # Strip markdown code fences if present
    cleaned = re.sub(r"^```(?:json)?\s*\n?", "", raw.strip(), flags=re.MULTILINE)
    cleaned = re.sub(r"\n?```\s*$", "", cleaned.strip(), flags=re.MULTILINE)

    # Try direct parse first
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Pull out first {...} or [...] using rfind for the closing bracket
    for open_ch, close_ch in (("{", "}"), ("[", "]")):
        start = cleaned.find(open_ch)
        end = cleaned.rfind(close_ch)
        if start != -1 and end > start:
            try:
                return json.loads(cleaned[start : end + 1])
            except json.JSONDecodeError:
                continue

    # ── Truncated JSON repair ────────────────────────────────────────────────
    # If the response was cut off (finish_reason=length), try to close
    # open brackets/braces so we can parse a partial result.
    start = cleaned.find("{")
    if start == -1:
        start = cleaned.find("[")
    if start != -1:
        fragment = cleaned[start:]
        repaired = _repair_truncated_json(fragment)
        if repaired is not None:
            logger.warning("Parsed truncated JSON via repair (%d chars)", len(fragment))
            return repaired

    raise ValueError(f"No JSON found in response: {raw[:300]!r}")


def _repair_truncated_json(fragment: str) -> Any:
    """Attempt to close unclosed brackets/braces in truncated JSON."""
    # Remove trailing incomplete key/value (after last comma or opening bracket)
    trimmed = re.sub(r',\s*"[^"]*"?\s*:?\s*"?[^"]*$', "", fragment, flags=re.DOTALL)
    if not trimmed:
        trimmed = fragment

    # Count unclosed brackets and braces
    opens = {"[": 0, "{": 0}
    closes = {"]": "[", "}": "{"}
    for ch in trimmed:
        if ch in opens:
            opens[ch] += 1
        elif ch in closes:
            opens[closes[ch]] = max(0, opens[closes[ch]] - 1)

    # Append closing characters
    suffix = "}" * opens["{"] + "]" * opens["["]
    try:
        return json.loads(trimmed + suffix)
    except json.JSONDecodeError:
        return None


# ─── from_structured ──────────────────────────────────────────────────────────

def from_structured(data: dict[str, Any], source_url: str = "") -> RecipeData:
    """
    Convert a recipe-scrapers result dict to RecipeData.
    Ingredient strings are parsed with the fast model.
    """
    raw_ingredients: list[str] = data.get("ingredients") or []
    parsed_ingredients = _parse_ingredient_strings(raw_ingredients)

    # Steps: prefer instructions_list, fall back to splitting instructions text
    steps_raw: list[str] = data.get("instructions_list") or []
    if not steps_raw and data.get("instructions"):
        steps_raw = _split_instructions(data["instructions"])

    steps = [
        StepData(order=i + 1, instruction=inst)
        for i, inst in enumerate(steps_raw)
        if inst
    ]

    return RecipeData(
        title=data.get("title") or "Untitled Recipe",
        description=data.get("description"),
        source_url=source_url,
        image_url=data.get("image"),
        cook_time=data.get("cook_time"),
        prep_time=data.get("prep_time"),
        servings=_parse_servings(data.get("yields")),
        ingredients=parsed_ingredients,
        steps=steps,
        tags=[t.lower().strip() for t in (data.get("tags") or []) if t],
    )


# ─── from_text ────────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are a recipe extraction assistant. Given raw text (a cooking video \
transcript or webpage text), extract a complete structured recipe.

Return ONLY a valid JSON object with this exact schema:
{
  "title": "Recipe Title",
  "description": "One or two sentence description",
  "cook_time": 30,
  "prep_time": 15,
  "servings": 4,
  "ingredients": [
    { "name": "all-purpose flour", "amount": 2.0, "unit": "cups" },
    { "name": "salt",              "amount": 1.0, "unit": "tsp"  },
    { "name": "vanilla extract",   "amount": null, "unit": null  }
  ],
  "steps": [
    { "order": 1, "instruction": "Preheat oven to 175°C (350°F).", "timer_seconds": null },
    { "order": 2, "instruction": "Mix flour and salt together.",   "timer_seconds": null },
    { "order": 3, "instruction": "Bake for 25 minutes.",           "timer_seconds": 1500 }
  ],
  "tags": ["baking", "dessert", "vegetarian"]
}

Rules:
- amount must be a number (float) or null — never a string like "to taste"
- timer_seconds: set ONLY when the step mentions an explicit duration \
  (e.g. "bake 25 min" → 1500, "simmer for 10 minutes" → 600), otherwise null
- tags: 1–5 lowercase culinary descriptors
- If the text contains no clear recipe, still return your best attempt \
  with whatever information is available
- Return ONLY the JSON — no prose, no markdown fences
"""


def from_text(
    text: str,
    source_url: str = "",
    title_hint: str = "",
) -> RecipeData:
    """
    Extract a structured recipe from unstructured text using the smart model.
    Suitable for YouTube transcripts or pages that recipe-scrapers couldn't parse.
    """
    user_content = "Extract the recipe from this text"
    if title_hint:
        user_content += f" (page/video title: '{title_hint}')"
    # Limit input to ~5000 chars to leave room for output tokens
    user_content += f":\n\n{text[:5000]}"

    raw = chat_complete(
        model=SMART_MODEL,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user",   "content": user_content},
        ],
        temperature=0.1,
        max_tokens=8192,
        json_mode=True,
    )

    try:
        data = _extract_json(raw)
    except ValueError as exc:
        logger.error("Extractor JSON parse failed: %s", exc)
        # Return a minimal recipe so the pipeline doesn't crash
        return RecipeData(title=title_hint or "Imported Recipe", source_url=source_url)

    return _dict_to_recipe_data(data, source_url)


# ─── Ingredient string parser ─────────────────────────────────────────────────

_ING_PARSE_PROMPT = """\
Parse each recipe ingredient string into structured JSON.
Return a JSON array — one element per ingredient in the same order.
Each element: { "name": string, "amount": number|null, "unit": string|null }

Rules:
- Strip preparation notes from name (e.g. "sifted", "finely chopped", "room temperature")
- Keep the core ingredient name in lowercase (e.g. "all-purpose flour", "unsalted butter")
- amount must be a number or null — convert fractions (½ → 0.5, ¼ → 0.25)
- unit should be abbreviated standard form or null (cups, tbsp, tsp, g, kg, oz, lb, ml, l)
- Return ONLY the JSON array — no prose
"""


def _parse_ingredient_strings(ingredient_strings: list[str]) -> list[IngredientData]:
    """
    Use the fast model to parse strings like "2¼ cups all-purpose flour, sifted"
    into structured IngredientData. All ingredients are sent in one API call.
    """
    if not ingredient_strings:
        return []

    lines = "\n".join(f"- {s}" for s in ingredient_strings)
    prompt = f"{_ING_PARSE_PROMPT}\n\nIngredients:\n{lines}"

    try:
        raw = chat_complete(
            model=FAST_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=2048,
        )
        parsed: list[dict] = _extract_json(raw)
    except Exception as exc:
        logger.warning("Ingredient parse failed (%s) — using raw strings", exc)
        return [IngredientData(name=s.strip()) for s in ingredient_strings]

    results: list[IngredientData] = []
    for item, raw_str in zip(parsed, ingredient_strings):
        if not isinstance(item, dict):
            results.append(IngredientData(name=raw_str.strip()))
            continue
        name = (item.get("name") or raw_str).strip()
        amount_raw = item.get("amount")
        results.append(
            IngredientData(
                name=name,
                amount=float(amount_raw) if amount_raw is not None else None,
                unit=item.get("unit"),
            )
        )

    # Pad if the AI returned fewer items than expected
    for raw_str in ingredient_strings[len(results):]:
        results.append(IngredientData(name=raw_str.strip()))

    return results


# ─── Dict → RecipeData conversion ────────────────────────────────────────────

def _dict_to_recipe_data(data: dict[str, Any], source_url: str) -> RecipeData:
    """Convert an AI-extracted dict (from from_text) to a RecipeData object."""
    ingredients: list[IngredientData] = []
    for item in data.get("ingredients") or []:
        if not isinstance(item, dict):
            continue
        name = (item.get("name") or "").strip()
        if not name:
            continue
        amount_raw = item.get("amount")
        ingredients.append(
            IngredientData(
                name=name,
                amount=float(amount_raw) if amount_raw is not None else None,
                unit=item.get("unit"),
            )
        )

    steps: list[StepData] = []
    for item in data.get("steps") or []:
        if not isinstance(item, dict):
            continue
        instruction = (item.get("instruction") or "").strip()
        if not instruction:
            continue
        timer_raw = item.get("timer_seconds")
        steps.append(
            StepData(
                order=item.get("order") or len(steps) + 1,
                instruction=instruction,
                timer_seconds=int(timer_raw) if timer_raw else None,
            )
        )

    return RecipeData(
        title=(data.get("title") or "Imported Recipe").strip(),
        description=data.get("description"),
        source_url=source_url,
        image_url=data.get("image_url"),
        cook_time=data.get("cook_time"),
        prep_time=data.get("prep_time"),
        servings=_parse_servings(data.get("servings")),
        ingredients=ingredients,
        steps=steps,
        tags=[t.lower().strip() for t in (data.get("tags") or []) if t],
    )
