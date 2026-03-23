"""
Web recipe scraper service.

Tries recipe-scrapers first (structured data for 500+ supported sites).
Falls back in order:
  1.5. JSON-LD <script type="application/ld+json"> Recipe extraction
  2.   Requests + BeautifulSoup raw-text extraction for AI parsing
        (also captures og:image for the hero photo)
"""
import json as _json
import logging
from dataclasses import dataclass, field
from typing import Any, Optional

import requests
from bs4 import BeautifulSoup
from recipe_scrapers import scrape_me

logger = logging.getLogger(__name__)

_REQUEST_TIMEOUT = 20  # seconds
_MAX_RAW_TEXT = 14_000  # characters sent to the AI extractor

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# HTML tags to strip before extracting text
_NOISE_TAGS = ["script", "style", "nav", "footer", "header", "aside",
               "noscript", "svg", "iframe", "form", "button"]


# ─── Result type ──────────────────────────────────────────────────────────────

@dataclass
class ScrapeResult:
    """
    structured=True  → data contains recipe-scrapers fields (title, ingredients, etc.)
    structured=False → data contains {"raw_text": ..., "title": ..., "image": ...} for AI extraction
    """
    structured: bool
    data: dict[str, Any] = field(default_factory=dict)


# ─── Public API ───────────────────────────────────────────────────────────────

def scrape_url(url: str) -> ScrapeResult:
    """
    Scrape a recipe page.  Returns a ScrapeResult; raises RuntimeError if
    the page is completely unreachable.

    Tier 1: recipe-scrapers (structured)
    Tier 1.5: JSON-LD extraction from raw HTML (structured)
    Tier 2: plain text + og:image extraction (unstructured, for AI)
    """
    # ── Attempt 1: structured scrape ────────────────────────────────────────
    try:
        scraper = scrape_me(url, wild_mode=True)
        data = {
            "title":             _safe(scraper.title),
            "description":       _safe(scraper.description),
            "ingredients":       _safe(scraper.ingredients) or [],
            "instructions":      _safe(scraper.instructions),
            "instructions_list": _safe(scraper.instructions_list) or [],
            "image":             _safe(scraper.image),
            "cook_time":         _safe(scraper.cook_time),
            "prep_time":         _safe(scraper.prep_time),
            "total_time":        _safe(scraper.total_time),
            "yields":            _safe(scraper.yields),
            "tags":              _safe(scraper.tags) or [],
        }

        # Require at least a title + some ingredients to count as structured
        if data["title"] and data["ingredients"]:
            if not data["instructions_list"] and not data.get("instructions"):
                try:
                    resp2 = requests.get(url, headers=_HEADERS, timeout=_REQUEST_TIMEOUT)
                    resp2.raise_for_status()
                    raw = _raw_scrape_from_soup(BeautifulSoup(resp2.text, "lxml"))
                    data["raw_text"] = raw.data.get("raw_text", "")
                    logger.debug("[scraper] Supplemental raw fetch for missing instructions")
                except Exception as exc:
                    logger.debug("[scraper] Supplemental raw fetch failed: %s", exc)
            logger.info(
                "[scraper] recipe-scrapers OK: %r — %d ingredients, %d steps",
                data["title"],
                len(data["ingredients"]),
                len(data["instructions_list"]),
            )
            return ScrapeResult(structured=True, data=data)

        logger.info("[scraper] recipe-scrapers returned sparse data, trying raw fetch")

    except Exception as exc:
        logger.info("[scraper] recipe-scrapers failed (%s), falling back to raw HTML", exc)

    # ── Fetch raw HTML (used for both Tier 1.5 and Tier 2) ──────────────────
    try:
        resp = requests.get(url, headers=_HEADERS, timeout=_REQUEST_TIMEOUT)
        resp.raise_for_status()
    except requests.RequestException as exc:
        raise RuntimeError(f"Failed to fetch '{url}': {exc}") from exc

    soup = BeautifulSoup(resp.text, "lxml")

    # ── Attempt 1.5: JSON-LD Recipe extraction ───────────────────────────────
    jsonld_result = _extract_jsonld(soup)
    if jsonld_result is not None:
        # _extract_jsonld only reads; safe to mutate soup now for raw text
        raw = _raw_scrape_from_soup(soup)
        jsonld_result.data["raw_text"] = raw.data.get("raw_text", "")
        if not jsonld_result.data.get("image"):
            jsonld_result.data["image"] = raw.data.get("image")
        logger.info("[scraper] JSON-LD OK: %r — raw_text captured", jsonld_result.data.get("title"))
        return jsonld_result

    # ── Attempt 2: raw HTML → text + og:image ────────────────────────────────
    return _raw_scrape_from_soup(soup)


# ─── Internal helpers ─────────────────────────────────────────────────────────

def _extract_jsonld(soup: BeautifulSoup) -> Optional[ScrapeResult]:
    """Try to parse schema.org Recipe from JSON-LD <script> tags."""
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            data = _json.loads(tag.string or "")
            # Handle @graph arrays and bare dicts
            items = data if isinstance(data, list) else [data]
            if isinstance(data, dict) and "@graph" in data:
                items = data["@graph"]
            for item in items:
                if isinstance(item, dict) and item.get("@type") in ("Recipe", ["Recipe"]):
                    result = _jsonld_to_scrape_result(item)
                    if result is not None:
                        return result
        except Exception:
            continue
    return None


def _jsonld_to_scrape_result(item: dict) -> Optional[ScrapeResult]:
    """Convert a schema.org Recipe dict to ScrapeResult."""
    title = item.get("name", "")
    ingredients = item.get("recipeIngredient") or []
    if not title or not ingredients:
        return None

    instructions_raw = item.get("recipeInstructions") or []
    instructions_list = []
    for inst in instructions_raw:
        if isinstance(inst, str):
            instructions_list.append(inst)
        elif isinstance(inst, dict):
            instructions_list.append(inst.get("text", ""))

    image_raw = item.get("image")
    if isinstance(image_raw, list):
        image = image_raw[0] if image_raw else None
        if isinstance(image, dict):
            image = image.get("url")
    elif isinstance(image_raw, dict):
        image = image_raw.get("url")
    else:
        image = image_raw

    keywords = item.get("keywords", "")
    tags = keywords.split(",") if isinstance(keywords, str) and keywords else []

    return ScrapeResult(structured=True, data={
        "title":             title,
        "description":       item.get("description", ""),
        "ingredients":       ingredients,
        "instructions":      "\n".join(instructions_list),
        "instructions_list": instructions_list,
        "image":             image,
        "cook_time":         None,
        "prep_time":         None,
        "total_time":        None,
        "yields":            item.get("recipeYield"),
        "tags":              tags,
    })


def _raw_scrape_from_soup(soup: BeautifulSoup) -> ScrapeResult:
    """Extract og:image + plain text from an already-parsed soup object."""
    # Extract og:image before stripping tags
    og_image: Optional[str] = None
    og_tag = soup.find("meta", property="og:image") or soup.find("meta", attrs={"name": "og:image"})
    if og_tag:
        og_image = og_tag.get("content") or og_tag.get("value")  # type: ignore[assignment]

    title: str = soup.title.string.strip() if soup.title and soup.title.string else ""

    # Strip noise elements
    for tag in soup(_NOISE_TAGS):
        tag.decompose()

    # Prefer <article> or <main> content if present
    content_el = soup.find("article") or soup.find("main") or soup.body or soup
    text = content_el.get_text(separator="\n", strip=True)

    # Collapse excessive blank lines
    text = "\n".join(line for line in text.splitlines() if line.strip())
    text = text[:_MAX_RAW_TEXT]

    logger.info("[scraper] raw fetch OK: %r — %d chars of text, og:image=%s",
                title, len(text), bool(og_image))
    return ScrapeResult(
        structured=False,
        data={"raw_text": text, "title": title, "image": og_image},
    )


def _safe(attr: Any) -> Any:
    """
    Call a recipe-scrapers attribute (callable or plain value) and return
    None if it raises any exception.
    """
    try:
        return attr() if callable(attr) else attr
    except Exception:
        return None
