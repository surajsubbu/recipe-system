"""
Normalizer agent — takes raw ingredient names and returns:
  • normalized_name  — canonical, lowercase, singular form  (e.g. "garlic")
  • category         — grocery aisle category                (e.g. "produce")

Uses the BALANCED model (mistral-7b) for cost-efficiency; processes in
batches of 30 to keep prompts within token limits.
"""
import json
import logging
import re
from dataclasses import dataclass

from app.agents.openrouter import BALANCED_MODEL, chat_complete

logger = logging.getLogger(__name__)

# ─── Data classes ─────────────────────────────────────────────────────────────

@dataclass
class NormalizationResult:
    original_name: str
    normalized_name: str
    category: str


# ─── Grocery categories ───────────────────────────────────────────────────────

GROCERY_CATEGORIES = [
    "produce",       # fresh fruit & vegetables
    "dairy",         # milk, cheese, eggs, butter
    "meat",          # beef, pork, chicken, etc.
    "seafood",       # fish, shrimp, etc.
    "pantry",        # canned goods, pasta, rice, oils
    "spices",        # herbs, spices, extracts
    "bakery",        # flour, bread, sugar, yeast
    "frozen",        # frozen vegetables, ice cream
    "beverages",     # stock, wine, juice
    "condiments",    # sauces, vinegar, mustard
    "other",         # anything that doesn't fit
]

_CATEGORIES_STR = ", ".join(GROCERY_CATEGORIES)

_BATCH_SIZE = 30

# ─── Normalisation prompt ─────────────────────────────────────────────────────

_PROMPT_TEMPLATE = """\
Normalize these ingredient names for a grocery shopping list.

For each ingredient:
1. Normalize to singular, lowercase, no preparation notes or brand names
   Examples:
   - "2 large cloves garlic, minced"  → "garlic"
   - "unsalted Kerrygold butter"      → "butter"
   - "fresh flat-leaf parsley"        → "parsley"
   - "Heinz tomato ketchup"           → "ketchup"

2. Assign ONE grocery category from: {categories}

Return a JSON array — one object per ingredient in the SAME ORDER:
[
  {{"original": "<original name>", "normalized": "<cleaned name>", "category": "<category>"}},
  ...
]

Return ONLY the JSON array — no prose, no markdown fences.

Ingredients to normalize:
{ingredients}
"""


# ─── Public API ───────────────────────────────────────────────────────────────

def normalize_ingredients(ingredient_names: list[str]) -> list[NormalizationResult]:
    """
    Normalize ingredient names and assign grocery categories.

    Processes in batches of 30 to stay within prompt token limits.
    Falls back gracefully on any API or parsing failure.
    """
    if not ingredient_names:
        return []

    results: list[NormalizationResult] = []

    for i in range(0, len(ingredient_names), _BATCH_SIZE):
        batch = ingredient_names[i : i + _BATCH_SIZE]
        batch_results = _normalize_batch(batch)
        results.extend(batch_results)

    return results


# ─── Internal helpers ────────────────────────────────────────────────────────

def _normalize_batch(names: list[str]) -> list[NormalizationResult]:
    """Send one batch of names to the model and parse the response."""
    numbered = "\n".join(f"{i + 1}. {n}" for i, n in enumerate(names))
    prompt = _PROMPT_TEMPLATE.format(
        categories=_CATEGORIES_STR,
        ingredients=numbered,
    )

    try:
        raw = chat_complete(
            model=BALANCED_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=2048,
        )
        parsed = _extract_json_array(raw)
    except Exception as exc:
        logger.warning("Normalizer batch failed (%s) — using fallback", exc)
        return _fallback(names)

    results: list[NormalizationResult] = []
    for item, original in zip(parsed, names):
        if not isinstance(item, dict):
            results.append(NormalizationResult(
                original_name=original,
                normalized_name=original.lower().strip(),
                category="other",
            ))
            continue
        results.append(
            NormalizationResult(
                original_name=original,
                normalized_name=(item.get("normalized") or original).lower().strip(),
                category=_validate_category(item.get("category")),
            )
        )

    # Pad in case the model returned fewer items than sent
    for name in names[len(results):]:
        results.append(NormalizationResult(
            original_name=name,
            normalized_name=name.lower().strip(),
            category="other",
        ))

    return results


def _extract_json_array(raw: str) -> list:
    """Extract and parse the first JSON array from a string."""
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return data
    except json.JSONDecodeError:
        pass
    match = re.search(r"\[.*\]", raw, re.DOTALL)
    if match:
        return json.loads(match.group())
    raise ValueError("No JSON array found in response")


def _validate_category(cat: object) -> str:
    """Return cat if it's a valid category string, else 'other'."""
    if isinstance(cat, str) and cat.lower() in GROCERY_CATEGORIES:
        return cat.lower()
    return "other"


def _fallback(names: list[str]) -> list[NormalizationResult]:
    """Return minimal normalizations without AI when the API call fails."""
    return [
        NormalizationResult(
            original_name=n,
            normalized_name=n.lower().strip(),
            category="other",
        )
        for n in names
    ]
