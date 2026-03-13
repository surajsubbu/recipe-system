"""
OpenRouter client — thin wrapper around the OpenAI SDK that re-routes
requests to openrouter.ai, which provides access to many model providers
under a single API key.

Model aliases (set in .env):
  OPENROUTER_FAST_MODEL     — gemini-flash  (quick, cheap tasks)
  OPENROUTER_SMART_MODEL    — claude-3.5-sonnet (complex extraction)
  OPENROUTER_BALANCED_MODEL — mistral-7b (ingredient normalisation)
"""
import logging
import os
from typing import Any, Optional

from openai import OpenAI

logger = logging.getLogger(__name__)

# ─── Configuration ────────────────────────────────────────────────────────────

OPENROUTER_BASE_URL: str = os.getenv(
    "OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"
)
OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")

# Convenience aliases referenced throughout the agent layer
FAST_MODEL: str = os.getenv(
    "OPENROUTER_FAST_MODEL", "google/gemini-flash-1.5"
)
SMART_MODEL: str = os.getenv(
    "OPENROUTER_SMART_MODEL", "anthropic/claude-3.5-sonnet"
)
BALANCED_MODEL: str = os.getenv(
    "OPENROUTER_BALANCED_MODEL", "mistralai/mistral-7b-instruct"
)

# ─── Client factory ───────────────────────────────────────────────────────────

def get_client() -> OpenAI:
    """Return a configured OpenAI-compatible client pointed at OpenRouter."""
    return OpenAI(
        api_key=OPENROUTER_API_KEY,
        base_url=OPENROUTER_BASE_URL,
        # OpenRouter requires these headers for rate-limit tracking
        default_headers={
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "Recipe Management System",
        },
    )


# ─── Core completion helper ───────────────────────────────────────────────────

def chat_complete(
    model: str,
    messages: list[dict],
    temperature: float = 0.1,
    max_tokens: int = 4096,
    json_mode: bool = False,
) -> str:
    """
    Synchronous chat completion via OpenRouter.

    Args:
        model:       OpenRouter model string (e.g. "anthropic/claude-3.5-sonnet")
        messages:    OpenAI-format message list
        temperature: Sampling temperature (0 = deterministic)
        max_tokens:  Maximum tokens in the completion
        json_mode:   Force JSON object output (not all models support this)

    Returns:
        The assistant message content as a plain string.

    Raises:
        openai.APIError on network / upstream failure.
    """
    client = get_client()

    kwargs: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    logger.debug("OpenRouter request model=%s messages=%d", model, len(messages))

    response = client.chat.completions.create(**kwargs)
    choice = response.choices[0]
    content: Optional[str] = choice.message.content

    tokens = response.usage.total_tokens if response.usage else "?"
    finish = choice.finish_reason
    logger.info(
        "OpenRouter response model=%s tokens=%s finish_reason=%s content_len=%s",
        response.model, tokens, finish, len(content) if content else 0,
    )

    if finish == "length":
        logger.warning(
            "OpenRouter response truncated (finish_reason=length). "
            "Content may be incomplete (%d chars).",
            len(content) if content else 0,
        )

    return content or ""
