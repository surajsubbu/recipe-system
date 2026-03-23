"""
Instagram ingestion service — yt-dlp audio download + Whisper transcription.

Supported URLs: instagram.com/p/<id>/, /reel/<id>/, /reels/<id>/, /tv/<id>/

Cookie support (required for most Instagram posts):
  Set INSTAGRAM_COOKIES_FILE env var to the path of a Netscape-format cookies.txt
  exported from a browser where you are logged into Instagram.
  Default path: /app/cookies/instagram.txt

Two-phase API (for lazy audio download):
  1. get_instagram_metadata(url) → InstagramMeta  — fast, no download
  2. transcribe_instagram(url)   → str             — slow, audio download + Whisper
"""
import logging
import os
import tempfile
from dataclasses import dataclass
from typing import Optional

import yt_dlp

from app.services import whisper_utils
from app.services.youtube import YoutubeResult

logger = logging.getLogger(__name__)

# Path to Instagram cookies file (Netscape format, exported from browser)
_COOKIES_FILE = os.getenv("INSTAGRAM_COOKIES_FILE", "/app/cookies/instagram.txt")


@dataclass
class InstagramMeta:
    """Lightweight metadata-only result — no audio downloaded."""
    title: str
    description: str        # caption text (up to 2000 chars)
    thumbnail_url: str
    duration_seconds: Optional[float]
    channel: str


def _base_ydl_opts() -> dict:
    """Base yt-dlp options, adding cookiefile if it exists."""
    opts: dict = {"quiet": True, "no_warnings": True}
    if os.path.isfile(_COOKIES_FILE):
        opts["cookiefile"] = _COOKIES_FILE
        logger.debug("[instagram] Using cookies file: %s", _COOKIES_FILE)
    else:
        logger.debug("[instagram] No cookies file found at %s — unauthenticated request", _COOKIES_FILE)
    return opts


def get_instagram_metadata(url: str) -> InstagramMeta:
    """
    Fetch Instagram post metadata (title, caption, thumbnail) without downloading audio.
    Fast — typically 1-3 seconds.
    Raises RuntimeError if the post is private or unreachable.
    """
    meta_opts = {**_base_ydl_opts(), "skip_download": True, "extract_flat": False}
    try:
        with yt_dlp.YoutubeDL(meta_opts) as ydl:
            info = ydl.extract_info(url, download=False)
    except yt_dlp.utils.DownloadError as exc:
        msg = str(exc).lower()
        if "login" in msg or "private" in msg or "not available" in msg:
            raise RuntimeError("Instagram post is private or requires login.") from exc
        raise RuntimeError(f"Could not fetch Instagram post: {exc}") from exc

    caption = (info.get("description") or "").strip()
    raw_title = (info.get("title") or "").strip()
    if not raw_title or (raw_title.isalnum() and len(raw_title) < 20):
        raw_title = caption.split("\n")[0][:80] if caption else "Instagram Recipe"
    title = raw_title or "Instagram Recipe"

    return InstagramMeta(
        title=title,
        description=caption[:2000],
        thumbnail_url=info.get("thumbnail") or "",
        duration_seconds=info.get("duration"),
        channel=info.get("uploader") or "",
    )


def transcribe_instagram(url: str) -> str:
    """
    Download audio from an Instagram post and transcribe it with Whisper.
    Slow — downloads audio (tens of seconds) + Whisper inference.
    Returns transcript string (may be empty on failure).
    """
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            audio_path = _download_instagram_audio(url, tmpdir)
            return whisper_utils.transcribe(audio_path)
    except Exception as exc:
        logger.warning("[instagram] Audio transcription failed: %s", exc)
        return ""


# ─── Legacy combined API (kept for compatibility) ─────────────────────────────

def get_instagram_data(url: str) -> YoutubeResult:
    """
    Download and transcribe an Instagram reel or post.
    Raises RuntimeError if the post is private or unreachable.

    Deprecated: prefer get_instagram_metadata() + transcribe_instagram() for
    lazy audio download. This function always downloads audio.
    """
    meta = get_instagram_metadata(url)
    transcript = transcribe_instagram(url)

    return YoutubeResult(
        title=meta.title,
        description=meta.description,
        thumbnail_url=meta.thumbnail_url,
        transcript=transcript,
        transcript_source="whisper" if transcript else "none",
        duration_seconds=meta.duration_seconds,
        channel=meta.channel,
        timestamped_transcript=None,  # Instagram has no VTT-equivalent
    )


# ─── Internal helpers ─────────────────────────────────────────────────────────

def _download_instagram_audio(url: str, output_dir: str) -> str:
    """Download audio from Instagram post. Returns path to MP3 file."""
    output_template = os.path.join(output_dir, "audio.%(ext)s")
    opts = {
        **_base_ydl_opts(),
        "format": "bestaudio/best",
        "outtmpl": output_template,
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "128",
        }],
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([url])
    return os.path.join(output_dir, "audio.mp3")
