"""
Web recipe scraper service.

Tries recipe-scrapers first (structured data for 500+ supported sites).
Falls back to requests + BeautifulSoup raw-text extraction for unsupported
sites — the raw text is then handed off to the extractor agent for AI parsing.
"""
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
    structured=False → data contains {"raw_text": ..., "title": ...} for AI extraction
    """
    structured: bool
    data: dict[str, Any] = field(default_factory=dict)


# ─── Public API ───────────────────────────────────────────────────────────────

def scrape_url(url: str) -> ScrapeResult:
    """
    Scrape a recipe page.  Returns a ScrapeResult; raises RuntimeError if
    the page is completely unreachable.
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

    # ── Attempt 2: raw HTML → text ───────────────────────────────────────────
    return _raw_scrape(url)


# ─── Internal helpers ─────────────────────────────────────────────────────────

def _raw_scrape(url: str) -> ScrapeResult:
    """Fetch the page, strip noise tags, return plain text for AI extraction."""
    try:
        resp = requests.get(url, headers=_HEADERS, timeout=_REQUEST_TIMEOUT)
        resp.raise_for_status()
    except requests.RequestException as exc:
        raise RuntimeError(f"Failed to fetch '{url}': {exc}") from exc

    soup = BeautifulSoup(resp.text, "lxml")

    # Strip noise elements
    for tag in soup(_NOISE_TAGS):
        tag.decompose()

    title: str = soup.title.string.strip() if soup.title and soup.title.string else ""

    # Prefer <article> or <main> content if present
    content_el = soup.find("article") or soup.find("main") or soup.body or soup
    text = content_el.get_text(separator="\n", strip=True)

    # Collapse excessive blank lines
    text = "\n".join(line for line in text.splitlines() if line.strip())
    text = text[:_MAX_RAW_TEXT]

    logger.info("[scraper] raw fetch OK: %r — %d chars of text", title, len(text))
    return ScrapeResult(
        structured=False,
        data={"raw_text": text, "title": title},
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
