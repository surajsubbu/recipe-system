"""
Ollama service — local model inference via the Ollama REST API.

Used as a fallback when OpenRouter is unavailable, or directly for
tasks where keeping data fully on-premise is preferred (e.g. private
recipe notes).

The default model (OLLAMA_MODEL) is llama3.2:7b as specified in .env.
"""
import logging
import os
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434")
OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "llama3.2:7b")

_TIMEOUT = 120  # seconds — Ollama can be slow on first token


# ─── Public API ───────────────────────────────────────────────────────────────

def chat(
    prompt: str,
    model: Optional[str] = None,
    system: Optional[str] = None,
    temperature: float = 0.1,
) -> str:
    """
    Synchronous Ollama chat completion.

    Returns an empty string on connection failure so the pipeline can
    degrade gracefully when Ollama isn't running / model not loaded.
    """
    target_model = model or OLLAMA_MODEL
    messages: list[dict] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    try:
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json={
                    "model":   target_model,
                    "messages": messages,
                    "stream":  False,
                    "options": {"temperature": temperature},
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("message", {}).get("content", "")

    except httpx.ConnectError:
        logger.warning("[ollama] Ollama not reachable at %s", OLLAMA_BASE_URL)
        return ""
    except Exception as exc:
        logger.warning("[ollama] Request failed: %s", exc)
        return ""


def pull_model(model: Optional[str] = None) -> bool:
    """
    Pull (download) a model if it isn't already present.
    Returns True on success, False on failure.
    Blocks until the pull completes — suitable for startup scripts.
    """
    target = model or OLLAMA_MODEL
    try:
        with httpx.Client(timeout=600) as client:  # pulls can take minutes
            resp = client.post(
                f"{OLLAMA_BASE_URL}/api/pull",
                json={"name": target, "stream": False},
            )
            resp.raise_for_status()
            logger.info("[ollama] Model '%s' pulled successfully", target)
            return True
    except Exception as exc:
        logger.error("[ollama] Pull failed for '%s': %s", target, exc)
        return False


def is_available() -> bool:
    """Quick health check — returns True if the Ollama API is reachable."""
    try:
        with httpx.Client(timeout=5) as client:
            resp = client.get(f"{OLLAMA_BASE_URL}/api/tags")
            return resp.status_code == 200
    except Exception:
        return False


def list_models() -> list[str]:
    """Return the names of models currently available in Ollama."""
    try:
        with httpx.Client(timeout=10) as client:
            resp = client.get(f"{OLLAMA_BASE_URL}/api/tags")
            resp.raise_for_status()
            return [m["name"] for m in resp.json().get("models", [])]
    except Exception:
        return []
