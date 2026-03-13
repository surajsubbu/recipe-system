"""
Whisper model management utilities (faster-whisper backend).

faster-whisper is a CTranslate2-based reimplementation of OpenAI Whisper that
is ~4× faster and uses ~50 % less memory than the original on CPU.

The model is stored as a module-level variable so it is shared across all
tasks in the same Celery worker process, avoiding redundant disk I/O and
model initialisation on every job.
"""
import logging
import os
import threading
from typing import Optional

logger = logging.getLogger(__name__)

_MODEL_SIZE: str = os.getenv("WHISPER_MODEL_SIZE", "small")
_model = None                   # faster_whisper.WhisperModel (type-erased to avoid import at module load)
_model_lock = threading.Lock()  # guard concurrent loading on multi-threaded starts


# ─── Public API ───────────────────────────────────────────────────────────────

def get_model():
    """
    Return the cached WhisperModel, loading it on first call.

    Thread-safe — safe to call from multiple Celery tasks simultaneously.
    Double-checked locking: the lock is released immediately after loading,
    so subsequent calls are lock-free.
    """
    global _model
    if _model is not None:
        return _model

    with _model_lock:
        if _model is not None:   # another thread may have loaded it while we waited
            return _model

        # Deferred import — avoids pulling in torch/ctranslate2 at worker startup
        from faster_whisper import WhisperModel  # noqa: PLC0415

        logger.info("[whisper] Loading faster-whisper model '%s' …", _MODEL_SIZE)
        _model = WhisperModel(
            _MODEL_SIZE,
            device="cpu",
            compute_type="int8",   # quantised int8 — fastest on CPU, minimal quality loss
        )
        logger.info("[whisper] Model loaded (size=%s)", _MODEL_SIZE)

    return _model


def warm_up() -> None:
    """
    Pre-load the Whisper model into the worker process cache.
    Should be called at Celery worker startup so the first YouTube job
    isn't slowed down by a cold model load (~5–15 s for 'small').
    """
    get_model()
    logger.info("[whisper] Warm-up complete")


def transcribe(audio_path: str, language: Optional[str] = None) -> str:
    """
    Transcribe an audio file and return the plain-text transcript.

    Args:
        audio_path:  Absolute path to an audio file (MP3, WAV, M4A, etc.)
        language:    ISO 639-1 language code, or None for auto-detection.

    Returns:
        Transcribed text joined from all segments.
    """
    model = get_model()
    logger.info("[whisper] Transcribing: %s", audio_path)

    # faster-whisper returns (segments_generator, TranscriptionInfo)
    segments, info = model.transcribe(
        audio_path,
        language=language,
        beam_size=5,
        vad_filter=True,           # skip silent sections — speeds up long videos
    )

    # Consume the lazy generator and join
    text = " ".join(seg.text for seg in segments).strip()
    logger.info(
        "[whisper] Transcription: %d chars (detected lang=%s)",
        len(text),
        getattr(info, "language", "?"),
    )
    return text


def model_size() -> str:
    """Return the configured model size string."""
    return _MODEL_SIZE


def is_loaded() -> bool:
    """Return True if the model is already in memory."""
    return _model is not None
