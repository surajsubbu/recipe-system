"""
YouTube ingestion service — yt-dlp + Whisper with subtitle fast-path.

Strategy (latency-optimised):
  1. Fetch video metadata without downloading (yt-dlp info extraction).
  2. Try to pull existing subtitles or auto-generated captions (VTT).
     → Instant if captions exist; no audio download needed.
  3. Fallback: download audio (MP3) → Whisper small model transcription.
     → Used for videos without captions (~30-90 seconds per 10-min video).

Whisper model is loaded once per Celery worker process (module-level cache).

Supported URL formats:
  youtube.com/watch?v=...
  youtu.be/...
  youtube.com/shorts/...
  youtube.com/live/...
"""
import logging
import os
import re
import tempfile
from dataclasses import dataclass
from typing import Optional

import yt_dlp

logger = logging.getLogger(__name__)

_WHISPER_MODEL_SIZE: str = os.getenv("WHISPER_MODEL_SIZE", "small")

# Process-level Whisper model cache (loaded on first YouTube job)
_whisper_model = None

# Preferred subtitle languages (order matters)
_SUBTITLE_LANGS = ["en", "en-US", "en-GB", "en-orig", "en-IN"]


# ─── Result dataclass ─────────────────────────────────────────────────────────

@dataclass
class YoutubeResult:
    title: str
    transcript: str
    description: str = ""
    thumbnail_url: Optional[str] = None
    duration_seconds: Optional[int] = None
    channel: Optional[str] = None
    transcript_source: str = "unknown"   # "subtitles" | "whisper"


# ─── Public API ───────────────────────────────────────────────────────────────

def get_metadata_only(url: str) -> dict:
    """
    Fetch video metadata (title, description, thumbnail, duration, channel).
    Fast path — no subtitle/audio download required.
    Raises RuntimeError if video is unreachable.
    """
    logger.info("[youtube] Fetching metadata: %s", url)
    meta = _get_metadata(url)
    _assert_supported(meta)
    return meta


def get_transcript(url: str) -> YoutubeResult:
    """
    Extract transcript from any YouTube URL.

    Tries subtitles first (fast), then Whisper transcription (slow).
    Raises RuntimeError if the video is unreachable / unsupported.
    """
    # Step 1: Fetch metadata (no download — just HTTP info extraction)
    logger.info("[youtube] Fetching metadata: %s", url)
    meta = _get_metadata(url)
    _assert_supported(meta)

    # Step 2: Try caption fast-path
    logger.info("[youtube] Trying subtitle extraction for: %r", meta.get("title"))
    transcript = _extract_subtitles(url)

    if transcript:
        logger.info("[youtube] Subtitles found (%d chars)", len(transcript))
        return YoutubeResult(
            title=meta.get("title") or "",
            transcript=transcript,
            description=_trim(meta.get("description"), 2000),
            thumbnail_url=meta.get("thumbnail"),
            duration_seconds=meta.get("duration"),
            channel=meta.get("uploader"),
            transcript_source="subtitles",
        )

    # Step 3: Whisper fallback
    logger.info("[youtube] No subtitles — falling back to Whisper")
    transcript = _whisper_transcribe(url)

    return YoutubeResult(
        title=meta.get("title") or "",
        transcript=transcript,
        description=_trim(meta.get("description"), 2000),
        thumbnail_url=meta.get("thumbnail"),
        duration_seconds=meta.get("duration"),
        channel=meta.get("uploader"),
        transcript_source="whisper",
    )


# ─── Metadata fetch ───────────────────────────────────────────────────────────

def _get_metadata(url: str) -> dict:
    """Fetch video metadata without downloading any media."""
    # Try with full format resolution first, fall back to flat extraction
    for attempt, opts in enumerate([
        {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "extract_flat": False,
        },
        {
            # Fallback: skip format resolution entirely — still gets title,
            # description, thumbnail, duration, uploader, etc.
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "extract_flat": "in_playlist",
            "format": "best",          # avoids format resolution errors
            "ignore_no_formats_error": True,
        },
    ]):
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=False)
                return info or {}
        except yt_dlp.utils.DownloadError as exc:
            if attempt == 0:
                logger.warning("[youtube] Metadata fetch failed (attempt 1), retrying with fallback opts: %s", exc)
                continue
            raise RuntimeError(f"Cannot access video '{url}': {exc}") from exc
    return {}


def _assert_supported(meta: dict) -> None:
    """Raise if the video is a live stream, playlist, or otherwise unsupported."""
    if meta.get("is_live"):
        raise ValueError("Live streams are not supported for recipe extraction.")
    # yt-dlp sets _type == "playlist" for playlists
    if meta.get("_type") == "playlist":
        raise ValueError(
            "Playlist URLs are not supported. Please submit a single video URL."
        )


# ─── Subtitle extraction (fast path) ─────────────────────────────────────────

def _extract_subtitles(url: str) -> Optional[str]:
    """
    Download subtitle/auto-caption files with yt-dlp (no audio download).
    Returns parsed plain text, or None if no usable subtitles found.
    """
    with tempfile.TemporaryDirectory(prefix="recipe_yt_subs_") as tmpdir:
        ydl_opts = {
            "writesubtitles": True,
            "writeautomaticsub": True,
            "subtitleslangs": _SUBTITLE_LANGS,
            "subtitlesformat": "vtt",
            "skip_download": True,
            "quiet": True,
            "no_warnings": True,
            "ignore_no_formats_error": True,  # don't abort if format resolution fails
            "outtmpl": os.path.join(tmpdir, "%(id)s.%(ext)s"),
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])
        except Exception as exc:
            logger.debug("[youtube] Subtitle download error: %s", exc)
            return None

        # Scan for any .vtt file produced
        for fname in os.listdir(tmpdir):
            if fname.endswith(".vtt"):
                fpath = os.path.join(tmpdir, fname)
                try:
                    text = open(fpath, encoding="utf-8").read()
                    transcript = _parse_vtt(text)
                    if len(transcript) > 150:   # sanity-check minimum length
                        return transcript
                except Exception as exc:
                    logger.debug("[youtube] VTT parse error (%s): %s", fname, exc)

    return None


def _parse_vtt(vtt_text: str) -> str:
    """
    Convert WebVTT to plain text.

    YouTube auto-captions use a rolling/overlapping format:
      "Hello"  → "Hello world"  → "Hello world today"
    We collapse these by replacing each line with the longest suffix
    that extends the previous one, yielding a clean linear transcript.
    """
    raw: list[str] = []

    for line in vtt_text.splitlines():
        line = line.strip()
        if not line:
            continue
        # Skip header / metadata lines
        if re.match(r"^(WEBVTT|NOTE|Kind:|Language:|align:|position:)", line):
            continue
        # Skip timestamp lines (e.g. "00:00:01.000 --> 00:00:03.000")
        if re.match(r"^\d{2}:\d{2}", line):
            continue
        # Skip bare cue numbers
        if re.match(r"^\d+$", line):
            continue
        # Strip inline tags (<c>, <00:00:01.000>, </c>, etc.)
        clean = re.sub(r"<[^>]+>", "", line).strip()
        if clean:
            raw.append(clean)

    if not raw:
        return ""

    # Collapse rolling captions
    result: list[str] = [raw[0]]
    for line in raw[1:]:
        prev = result[-1]
        if line == prev:
            continue                     # exact duplicate
        elif line.startswith(prev):
            result[-1] = line            # extend in place
        elif prev.endswith(line):
            continue                     # already included
        else:
            result.append(line)          # genuinely new segment

    return " ".join(result)


# ─── Whisper transcription (slow path) ───────────────────────────────────────

def _whisper_transcribe(url: str) -> str:
    """
    Download audio with yt-dlp and transcribe with Whisper.
    Uses a temporary directory that is cleaned up automatically.
    """
    with tempfile.TemporaryDirectory(prefix="recipe_yt_audio_") as tmpdir:
        audio_path = _download_audio(url, tmpdir)
        size_mb = os.path.getsize(audio_path) / 1_048_576
        logger.info("[youtube] Transcribing %.1f MB with Whisper …", size_mb)

        model = _load_whisper()
        # faster-whisper returns (segments_generator, TranscriptionInfo)
        segments, _info = model.transcribe(audio_path, language=None, vad_filter=True)
        transcript = " ".join(seg.text for seg in segments).strip()

    logger.info("[youtube] Whisper done: %d chars", len(transcript))
    return transcript


def _download_audio(url: str, output_dir: str) -> str:
    """
    Download the best audio stream from `url` to `output_dir` as MP3.
    Returns the path to the produced audio file.
    Tries multiple format strings to handle YouTube format availability changes.
    """
    base_opts = {
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "128",
            }
        ],
        "outtmpl": os.path.join(output_dir, "%(id)s.%(ext)s"),
        "quiet": True,
        "no_warnings": True,
    }

    # Try multiple format strings — YouTube sometimes drops audio-only formats
    format_attempts = [
        "bestaudio/best",
        "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best",
        "best",
    ]

    info = None
    last_error = None
    for fmt in format_attempts:
        try:
            opts = {**base_opts, "format": fmt}
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=True)
            break
        except yt_dlp.utils.DownloadError as exc:
            last_error = exc
            logger.warning("[youtube] Format %r failed: %s — trying next", fmt, exc)
            continue
        except Exception as exc:
            last_error = exc
            logger.warning("[youtube] Format %r unexpected error: %s — trying next", fmt, exc)
            continue

    if info is None:
        error_msg = (
            f"Audio download failed for all format attempts: {url}\n"
            f"Last error: {last_error}\n"
            f"Video may be age-restricted, geo-blocked, or have no audio track."
        )
        raise RuntimeError(error_msg)

    video_id = info.get("id", "")
    # Primary expected path
    audio_path = os.path.join(output_dir, f"{video_id}.mp3")
    if os.path.exists(audio_path):
        return audio_path

    # Scan for any file with the video ID
    for fname in os.listdir(output_dir):
        if fname.startswith(video_id):
            return os.path.join(output_dir, fname)

    raise RuntimeError(
        f"Audio file not found after download. Dir: {os.listdir(output_dir)}"
    )


def _load_whisper():
    """Return (and cache) the faster-whisper model for this worker process."""
    global _whisper_model
    if _whisper_model is None:
        from faster_whisper import WhisperModel  # lazy import
        logger.info("[youtube] Loading faster-whisper model '%s' …", _WHISPER_MODEL_SIZE)
        _whisper_model = WhisperModel(
            _WHISPER_MODEL_SIZE,
            device="cpu",
            compute_type="int8",
        )
        logger.info("[youtube] Whisper ready")
    return _whisper_model


# ─── Utilities ────────────────────────────────────────────────────────────────

def _trim(text: Optional[str], max_len: int) -> str:
    if not text:
        return ""
    return text[:max_len]


def preload_whisper() -> None:
    """
    Pre-load the Whisper model into the worker process cache.
    Call this at worker startup to avoid a cold-start delay on the first
    YouTube ingestion job.
    """
    _load_whisper()
    logger.info("[youtube] Whisper model pre-loaded")
