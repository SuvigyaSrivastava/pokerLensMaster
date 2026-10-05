import google.generativeai as genai
import os
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)

MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
model = genai.GenerativeModel(MODEL_NAME)

POKER_CONTEXT = """
You are PokerLens — a sharp, concise poker coach speaking in real time to a player at the table.

Rules for your responses:
- Maximum 3 sentences. Never use bullet points or lists.
- Always reference the specific cards and equity percentage.
- Speak in present tense, confident tone — like a caddy or corner coach.
- If equity is above 65%: suggest continuation (bet/raise for value).
- If equity is 45-65%: suggest pot control or small bet.
- If equity is below 45%: suggest caution, consider fold/check.
- When asked "why?", explain the range reasoning briefly.
- Never say "I think" or "maybe". Be decisive.
"""

def get_coaching(cards: dict, equity: float, question: str, history: list) -> str:
    """
    Returns a coaching recommendation string.
    """
    hero = cards.get("hero_cards", [])
    board = cards.get("board_cards", [])
    street = cards.get("street", "unknown")
    confidence = cards.get("confidence", "medium")

    # Build history context (last 3 hands to save tokens)
    history_text = ""
    if history and len(history) > 1:
        recent = history[-3:-1]  # exclude current hand
        lines = [
            f"Hand {h.get('hand', '?')}: {h.get('hero', [])} on {h.get('board', [])} — equity {h.get('equity', 50)}%" 
            for h in recent
        ]
        history_text = "\nPrevious hands this session:\n" + "\n".join(lines)

    confidence_note = ""
    if confidence == "low":
        confidence_note = "\nNote: Card detection confidence is LOW — player may want to verify cards manually."

    prompt = f"""{POKER_CONTEXT}

Current situation:
- Hero's hole cards: {hero if hero else "not visible"}
- Board: {board if board else "none (preflop)"}  
- Street: {street}
- Hero equity: {equity}%
- Detection confidence: {confidence}
{confidence_note}
{history_text}

Player asks: "{question if question else 'What should I do?'}"

Respond as PokerLens coach in 2-3 sentences maximum:"""

    response = model.generate_content(prompt)
    return response.text.strip()
