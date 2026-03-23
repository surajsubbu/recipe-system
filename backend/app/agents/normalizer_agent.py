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
                category=_keyword_categorize(original),
            ))
            continue
        normalized_name = (item.get("normalized") or original).lower().strip()
        category = _validate_category(item.get("category"))
        # Second chance: if LLM returned "other", try keyword lookup
        if category == "other":
            category = _keyword_categorize(normalized_name)
        results.append(
            NormalizationResult(
                original_name=original,
                normalized_name=normalized_name,
                category=category,
            )
        )

    # Pad in case the model returned fewer items than sent
    for name in names[len(results):]:
        results.append(NormalizationResult(
            original_name=name,
            normalized_name=name.lower().strip(),
            category=_keyword_categorize(name),
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
            category=_keyword_categorize(n),
        )
        for n in names
    ]


# ─── Deterministic keyword-based categorization ────────────────────────────

_KEYWORD_CATEGORIES: dict[str, str] = {
    # Produce
    "onion": "produce", "garlic": "produce", "tomato": "produce", "carrot": "produce",
    "potato": "produce", "bell pepper": "produce", "pepper": "produce", "lettuce": "produce",
    "spinach": "produce", "mushroom": "produce", "corn": "produce", "broccoli": "produce",
    "cucumber": "produce", "avocado": "produce", "eggplant": "produce", "celery": "produce",
    "zucchini": "produce", "kale": "produce", "cabbage": "produce", "pea": "produce",
    "asparagus": "produce", "cauliflower": "produce", "sweet potato": "produce",
    "squash": "produce", "beet": "produce", "radish": "produce", "turnip": "produce",
    "green bean": "produce", "leek": "produce", "shallot": "produce", "scallion": "produce",
    "green onion": "produce", "arugula": "produce", "chard": "produce", "fennel": "produce",
    "artichoke": "produce", "okra": "produce", "jalape": "produce",
    # Produce - fruits
    "lemon": "produce", "lime": "produce", "orange": "produce", "apple": "produce",
    "banana": "produce", "strawberry": "produce", "blueberry": "produce", "mango": "produce",
    "pineapple": "produce", "grape": "produce", "cherry": "produce", "coconut": "produce",
    "peach": "produce", "pear": "produce", "plum": "produce", "raspberry": "produce",
    "cranberry": "produce", "fig": "produce", "pomegranate": "produce", "grapefruit": "produce",
    # Dairy
    "milk": "dairy", "cheese": "dairy", "butter": "dairy", "cream": "dairy",
    "yogurt": "dairy", "parmesan": "dairy", "mozzarella": "dairy", "cheddar": "dairy",
    "sour cream": "dairy", "cream cheese": "dairy", "ricotta": "dairy",
    "gouda": "dairy", "brie": "dairy", "feta": "dairy", "goat cheese": "dairy",
    "egg": "dairy", "eggs": "dairy", "whipping cream": "dairy", "half and half": "dairy",
    "heavy cream": "dairy", "buttermilk": "dairy", "ghee": "dairy",
    # Meat
    "chicken": "meat", "beef": "meat", "pork": "meat", "lamb": "meat",
    "turkey": "meat", "bacon": "meat", "sausage": "meat", "ham": "meat",
    "ground beef": "meat", "ground turkey": "meat", "steak": "meat",
    "veal": "meat", "duck": "meat", "brisket": "meat", "chorizo": "meat",
    "prosciutto": "meat", "salami": "meat", "pepperoni": "meat",
    # Seafood
    "salmon": "seafood", "tuna": "seafood", "shrimp": "seafood", "cod": "seafood",
    "tilapia": "seafood", "crab": "seafood", "lobster": "seafood", "scallop": "seafood",
    "mussel": "seafood", "clam": "seafood", "oyster": "seafood", "anchovy": "seafood",
    "sardine": "seafood", "halibut": "seafood", "trout": "seafood", "mahi": "seafood",
    "calamari": "seafood", "squid": "seafood", "octopus": "seafood", "prawn": "seafood",
    # Spices & Herbs
    "basil": "spices", "parsley": "spices", "cilantro": "spices", "thyme": "spices",
    "rosemary": "spices", "oregano": "spices", "ginger": "spices", "cinnamon": "spices",
    "cumin": "spices", "paprika": "spices", "chili powder": "spices", "turmeric": "spices",
    "nutmeg": "spices", "clove": "spices", "cardamom": "spices", "coriander": "spices",
    "dill": "spices", "sage": "spices", "bay leaf": "spices", "mint": "spices",
    "tarragon": "spices", "cayenne": "spices", "allspice": "spices",
    "black pepper": "spices", "white pepper": "spices", "red pepper flake": "spices",
    "chili flake": "spices", "vanilla": "spices", "saffron": "spices",
    "curry powder": "spices", "garam masala": "spices", "five spice": "spices",
    # Pantry & Dry Goods
    "flour": "pantry", "sugar": "pantry", "salt": "pantry", "rice": "pantry",
    "pasta": "pantry", "olive oil": "pantry", "oil": "pantry", "vegetable oil": "pantry",
    "canola oil": "pantry", "sesame oil": "pantry", "coconut oil": "pantry",
    "honey": "pantry", "maple syrup": "pantry", "molasses": "pantry",
    "brown sugar": "pantry", "powdered sugar": "pantry",
    "baking soda": "pantry", "baking powder": "pantry", "cornstarch": "pantry",
    "corn starch": "pantry", "cocoa": "pantry", "chocolate": "pantry",
    "chocolate chip": "pantry", "noodle": "pantry", "spaghetti": "pantry",
    "penne": "pantry", "macaroni": "pantry", "couscous": "pantry", "quinoa": "pantry",
    "oat": "pantry", "oatmeal": "pantry", "cereal": "pantry", "granola": "pantry",
    "bean": "pantry", "lentil": "pantry", "chickpea": "pantry",
    "canned tomato": "pantry", "tomato paste": "pantry", "tomato sauce": "pantry",
    "diced tomato": "pantry", "crushed tomato": "pantry",
    "almond": "pantry", "walnut": "pantry", "peanut": "pantry", "pecan": "pantry",
    "cashew": "pantry", "pistachio": "pantry", "pine nut": "pantry",
    "sesame seed": "pantry", "sunflower seed": "pantry", "flax": "pantry",
    "raisin": "pantry", "dried cranberry": "pantry",
    "breadcrumb": "pantry", "panko": "pantry", "cracker": "pantry",
    "tortilla": "pantry", "wrap": "pantry", "pita": "pantry",
    # Bakery
    "bread": "bakery", "yeast": "bakery", "baguette": "bakery", "roll": "bakery",
    "croissant": "bakery", "muffin": "bakery", "cake": "bakery",
    # Condiments & Sauces
    "ketchup": "condiments", "mustard": "condiments", "mayonnaise": "condiments",
    "mayo": "condiments", "soy sauce": "condiments", "vinegar": "condiments",
    "hot sauce": "condiments", "sriracha": "condiments", "bbq sauce": "condiments",
    "barbecue sauce": "condiments", "worcestershire": "condiments",
    "fish sauce": "condiments", "oyster sauce": "condiments", "hoisin": "condiments",
    "teriyaki": "condiments", "salsa": "condiments", "pesto": "condiments",
    "tahini": "condiments", "miso": "condiments", "ranch": "condiments",
    "relish": "condiments", "jam": "condiments", "jelly": "condiments",
    "peanut butter": "condiments", "almond butter": "condiments",
    # Beverages
    "water": "beverages", "wine": "beverages", "beer": "beverages",
    "broth": "beverages", "stock": "beverages", "chicken broth": "beverages",
    "beef broth": "beverages", "vegetable broth": "beverages",
    "juice": "beverages", "lemon juice": "beverages", "lime juice": "beverages",
    "orange juice": "beverages", "apple cider": "beverages",
    "coconut milk": "beverages", "almond milk": "beverages",
    "coffee": "beverages", "tea": "beverages", "espresso": "beverages",
    # Frozen
    "frozen pea": "frozen", "frozen corn": "frozen", "frozen spinach": "frozen",
    "frozen berry": "frozen", "ice cream": "frozen", "frozen vegetable": "frozen",
}


def _keyword_categorize(name: str) -> str:
    """Deterministic category lookup by keyword matching. Returns 'other' if no match."""
    lower = name.lower().strip()
    # Try exact match first
    if lower in _KEYWORD_CATEGORIES:
        return _KEYWORD_CATEGORIES[lower]
    # Try substring match (longest key first for specificity)
    for keyword, cat in sorted(_KEYWORD_CATEGORIES.items(), key=lambda x: -len(x[0])):
        if keyword in lower:
            return cat
    return "other"
