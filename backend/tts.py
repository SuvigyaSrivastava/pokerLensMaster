import os
import requests
import base64
from typing import Optional, Tuple

ELEVENLABS_DEFAULT_VOICE = "JBFqnCBsd6RMkjVDRZzb"  # George / Sharp coach voice

def synthesize_speech(
    text: str,
    engine: str = "browser",
    api_key: Optional[str] = None,
    voice_id: Optional[str] = None
) -> Tuple[Optional[bytes], str, Optional[str]]:
    """
    Synthesize speech using ElevenLabs or Sarvam AI, with browser fallback.
    Returns: (audio_bytes, mime_type, error_message)
    If engine == 'browser', returns (None, 'browser', None).
    """
    if not text or not text.strip():
        return None, "empty", "No text provided"

    clean_engine = (engine or "browser").lower()

    if clean_engine == "elevenlabs":
        key = api_key or os.getenv("ELEVENLABS_API_KEY")
        if not key:
            return None, "fallback_browser", "No ElevenLabs API key provided"

        v_id = voice_id or os.getenv("ELEVENLABS_VOICE_ID", ELEVENLABS_DEFAULT_VOICE)
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{v_id}"

        headers = {
            "xi-api-key": key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg"
        }
        payload = {
            "text": text,
            "model_id": "eleven_multilingual_v2",
            "voice_settings": {
                "stability": 0.6,
                "similarity_boost": 0.8
            }
        }

        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=12)
            if resp.status_code == 200:
                return resp.content, "audio/mpeg", None
            else:
                return None, "fallback_browser", f"ElevenLabs error {resp.status_code}: {resp.text[:120]}"
        except Exception as e:
            return None, "fallback_browser", f"ElevenLabs request error: {str(e)}"

    elif clean_engine == "sarvam":
        key = api_key or os.getenv("SARVAM_API_KEY")
        if not key:
            return None, "fallback_browser", "No Sarvam API key provided"

        url = "https://api.sarvam.ai/text-to-speech"
        headers = {
            "api-subscription-key": key,
            "Content-Type": "application/json"
        }
        payload = {
            "inputs": [text],
            "target_language_code": "en-IN",
            "speaker": voice_id or "meera",
            "pitch": 0,
            "pace": 1.05,
            "loudness": 1.5,
            "speech_sample_rate": 16000,
            "enable_preprocessing": True,
            "model": "bulbul:v1"
        }

        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=12)
            if resp.status_code == 200:
                data = resp.json()
                audios = data.get("audios", [])
                if audios:
                    audio_bytes = base64.b64decode(audios[0])
                    return audio_bytes, "audio/wav", None
                return None, "fallback_browser", "No audio returned by Sarvam"
            else:
                return None, "fallback_browser", f"Sarvam error {resp.status_code}: {resp.text[:120]}"
        except Exception as e:
            return None, "fallback_browser", f"Sarvam request error: {str(e)}"

    # Default: Browser Web Speech API
    return None, "browser", None
