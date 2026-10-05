"""Shared, lazily-configured Gemini client so imports never crash without a key."""
import os
from typing import Optional

from dotenv import load_dotenv

load_dotenv()

DEFAULT_MODEL = "gemini-3.8-flash"


class GeminiConfigError(RuntimeError):
    """Raised when Gemini isn't configured (e.g. missing GEMINI_API_KEY)."""


_models = {}


def get_model(json_output: bool = False):
    """Return a cached GenerativeModel. json_output forces JSON + temperature 0."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise GeminiConfigError(
            "GEMINI_API_KEY is not set. Add it to backend/.env (see .env.example)."
        )

    name = os.getenv("GEMINI_MODEL", DEFAULT_MODEL)
    key = (name, json_output)
    if key not in _models:
        import google.generativeai as genai

        genai.configure(api_key=api_key)
        cfg: Optional[dict] = (
            {"response_mime_type": "application/json", "temperature": 0}
            if json_output
            else {"temperature": 0.7, "max_output_tokens": 200}
        )
        _models[key] = genai.GenerativeModel(name, generation_config=cfg)
    return _models[key]
