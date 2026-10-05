import base64
import binascii
import json
import re

from cards import normalize_detection
from gemini_client import get_model

CARD_DETECTION_PROMPT = """
You are a poker card reader. Analyze this poker table image carefully.

Return ONLY a valid JSON object — no markdown, no explanation, no code fences.

Format:
{
  "hero_cards": ["Qh", "Qd"],
  "board_cards": ["Kc", "7s", "2d"],
  "street": "flop",
  "confidence": "high",
  "detection_notes": ""
}

Card notation rules:
- Rank: 2 3 4 5 6 7 8 9 T J Q K A
- Suit: h (hearts) d (diamonds) s (spades) c (clubs)
- Example: Ace of spades = "As", Ten of hearts = "Th"

Street rules:
- "preflop" if board is empty
- "flop" if 3 board cards
- "turn" if 4 board cards
- "river" if 5 board cards

If you cannot clearly read a card, use "??" for that card.
If hero cards are not visible, return hero_cards as [].
If board is empty (preflop), return board_cards as [].
Confidence: "high" | "medium" | "low"

Return raw JSON only. Nothing else.
"""


def _parse_json(raw: str) -> dict:
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
    raw = re.sub(r"```\s*$", "", raw, flags=re.MULTILINE).strip()
    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        # Last resort: grab the first {...} block
        m = re.search(r"\{.*\}", raw, flags=re.DOTALL)
        if not m:
            raise ValueError(f"Could not parse Gemini response as JSON: {raw[:200]}")
        try:
            result = json.loads(m.group(0))
        except json.JSONDecodeError as e:
            raise ValueError(f"Could not parse Gemini response as JSON: {raw[:200]}") from e
    if not isinstance(result, dict):
        raise ValueError("Gemini response was not a JSON object")
    return result


def detect_cards(image_b64: str) -> dict:
    """
    Takes a base64-encoded JPEG (optionally a data URL) and returns a normalized
    detection dict. Raises ValueError for bad input / unparseable output and
    GeminiConfigError if Gemini isn't configured.
    """
    if "," in image_b64[:100]:
        image_b64 = image_b64.split(",", 1)[1]

    try:
        image_bytes = base64.b64decode(image_b64, validate=False)
    except (binascii.Error, ValueError) as e:
        raise ValueError("image_b64 is not valid base64") from e
    if not image_bytes:
        raise ValueError("image_b64 decoded to empty data")

    model = get_model(json_output=True)
    response = model.generate_content(
        [CARD_DETECTION_PROMPT, {"mime_type": "image/jpeg", "data": image_bytes}]
    )
    return normalize_detection(_parse_json(response.text))
