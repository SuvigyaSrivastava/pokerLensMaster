"""Shared, lazily-created Gemini client (google-genai SDK) so imports never crash without a key."""
import os
from typing import Any, List, Optional

from dotenv import load_dotenv

load_dotenv()

DEFAULT_MODEL = "gemini-3.8-flash"
DEFAULT_LIVE_MODEL = "gemini-3.8-live"


class GeminiConfigError(RuntimeError):
    """Raised when Gemini isn't configured (e.g. missing GEMINI_API_KEY)."""


_client = None


def get_client():
    global _client
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise GeminiConfigError("GEMINI_API_KEY is not set. Add it to backend/.env (see .env.example).")
    if _client is None:
        from google import genai

        _client = genai.Client(api_key=api_key)
    return _client


_live_clients = {}


def get_live_client(api_version: str = None):
    """Client for the Live API. Alpha exposes extras (e.g. proactive audio)."""
    version = api_version or os.getenv("LIVE_API_VERSION", "v1beta")
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise GeminiConfigError("GEMINI_API_KEY is not set. Add it to backend/.env (see .env.example).")
    if version not in _live_clients:
        from google import genai
        from google.genai import types

        _live_clients[version] = genai.Client(api_key=api_key, http_options=types.HttpOptions(api_version=version))
    return _live_clients[version]


def model_name() -> str:
    return os.getenv("GEMINI_MODEL", DEFAULT_MODEL)


def live_model_name() -> str:
    return os.getenv("LIVE_MODEL", DEFAULT_LIVE_MODEL)


def generate(contents: List[Any], json_output: bool = False, max_output_tokens: Optional[int] = None) -> str:
    """One-shot text generation. Returns '' if the model produced no text."""
    from google.genai import types

    cfg = types.GenerateContentConfig(
        temperature=0 if json_output else 0.7,
        response_mime_type="application/json" if json_output else None,
        max_output_tokens=max_output_tokens,
    )
    resp = get_client().models.generate_content(model=model_name(), contents=contents, config=cfg)
    try:
        return (resp.text or "").strip()
    except Exception:
        return ""
