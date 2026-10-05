import google.generativeai as genai
import base64
import json
import re
import os
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)

MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
model = genai.GenerativeModel(MODEL_NAME)

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

def detect_cards(image_b64: str) -> dict:
    """
    Takes base64-encoded JPEG image, returns card detection result dict.
    Raises ValueError if response cannot be parsed.
    """
    # Strip data URL prefix if present
    if "," in image_b64:
        image_b64 = image_b64.split(",", 1)[1]

    image_bytes = base64.b64decode(image_b64)

    response = model.generate_content([
        CARD_DETECTION_PROMPT,
        {
            "mime_type": "image/jpeg",
            "data": base64.b64encode(image_bytes).decode("utf-8")
        }
    ])

    raw = response.text.strip()

    # Strip markdown fences if model adds them despite instructions
    raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
    raw = re.sub(r"```\s*$", "", raw, flags=re.MULTILINE)
    raw = raw.strip()

    try:
        result = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"Could not parse Gemini response as JSON: {raw[:200]}") from e

    # Validate required fields exist with defaults
    if "hero_cards" not in result or not isinstance(result["hero_cards"], list):
        result["hero_cards"] = []
    if "board_cards" not in result or not isinstance(result["board_cards"], list):
        result["board_cards"] = []
    if "street" not in result:
        result["street"] = "unknown"
    if "confidence" not in result:
        result["confidence"] = "low"
    if "detection_notes" not in result:
        result["detection_notes"] = ""

    return result
