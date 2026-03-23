"""
Router agent — decides what kind of URL was submitted so the pipeline
dispatches to the right extractor.

Strategy:
  1. URL pattern matching (free, instant) — handles 99% of cases.
  2. Fast-model fallback for ambiguous URLs (rarely used).

Supported types:
  youtube     — youtube.com/watch, youtu.be, youtube.com/shorts
  web_recipe  — any other http/https URL
  unknown     — empty, malformed, or unsupported
"""
import logging
import re
from enum import Enum
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# ─── URL type vocabulary ──────────────────────────────────────────────────────

class URLType(str, Enum):
    youtube    = "youtube"
    instagram  = "instagram"
    web_recipe = "web_recipe"
    unknown    = "unknown"


# ─── Known YouTube domains ────────────────────────────────────────────────────

_YOUTUBE_DOMAINS = frozenset({
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtu.be",
    "music.youtube.com",
})

# YouTube URL path patterns (for added robustness)
_YOUTUBE_PATHS = re.compile(
    r"^/(watch|shorts|embed|live|clip|v)/|^/@.+/",
    re.IGNORECASE,
)


# ─── Known Instagram domains ──────────────────────────────────────────────────

_INSTAGRAM_DOMAINS = frozenset({
    "instagram.com", "www.instagram.com", "m.instagram.com", "instagr.am",
})

_INSTAGRAM_PATHS = re.compile(r"^/(p|reel|reels|tv|stories)/", re.IGNORECASE)


# ─── Main classifier ──────────────────────────────────────────────────────────

def classify_url(url: str) -> URLType:
    """
    Classify a URL into one of: youtube | web_recipe | unknown.

    The classification is deterministic (no AI call) — it relies on
    domain and path pattern matching which is fast, free, and reliable.
    """
    url = url.strip()
    if not url:
        return URLType.unknown

    # Prepend scheme if missing so urlparse works correctly
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    try:
        parsed = urlparse(url)
    except Exception as exc:
        logger.warning("URL parse failed: %s — %s", url, exc)
        return URLType.unknown

    domain = parsed.netloc.lower().lstrip("www.")

    # ── YouTube ──────────────────────────────────────────────────────────────
    if parsed.netloc.lower() in _YOUTUBE_DOMAINS:
        logger.info("[router] YouTube URL detected: %s", url)
        return URLType.youtube

    # ── Instagram ─────────────────────────────────────────────────────────────
    if parsed.netloc.lower() in _INSTAGRAM_DOMAINS:
        if _INSTAGRAM_PATHS.match(parsed.path):
            logger.info("[router] Instagram URL detected: %s", url)
            return URLType.instagram
        # Profile/explore pages fall through to web_recipe (will fail gracefully)

    # ── Any other valid http(s) URL ───────────────────────────────────────────
    if parsed.scheme in ("http", "https") and parsed.netloc:
        logger.info("[router] Web recipe URL detected: %s", url)
        return URLType.web_recipe

    logger.warning("[router] Unknown URL type: %s", url)
    return URLType.unknown
