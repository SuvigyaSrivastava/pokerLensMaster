import google.generativeai as genai
import os
from dotenv import load_dotenv
from typing import Optional

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)

MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
model = genai.GenerativeModel(MODEL_NAME)

POKER_CONTEXT = """
You are PokerLens — a sharp, real-time poker coach sitting alongside the player during a live game.
You speak aloud via voice to the player as each action unfolds.

Rules for your responses:
- Maximum 2 to 3 punchy sentences. Never use bullet points or lists.
- Speak in present tense, decisive tone — like a seasoned Las Vegas pro whispering in their ear.
- Always name the cards, board cards, and equity percentage clearly.
- If equity is above 65%: aggressively recommend value betting or raising.
- If equity is 45-65%: recommend pot control, checking, or calculated small bets.
- If equity is below 45%: warn of danger, recommend folding to aggression or checking.
- When a new street opens (Flop, Turn, River), immediately call out the texture and what the player should do right now.
- Never use filler words like "I think", "maybe", or "as an AI". Be 100% decisive.
"""

def get_coaching(
    cards: dict,
    equity: float,
    question: Optional[str] = "",
    history: Optional[list] = None,
    transition: Optional[str] = None
) -> str:
    """
    Returns a proactive coaching recommendation string.
    """
    hero = cards.get("hero_cards", [])
    board = cards.get("board_cards", [])
    street = cards.get("street", "unknown")
    confidence = cards.get("confidence", "medium")

    # Build history context (last 3 hands to save tokens)
    history_text = ""
    if history and len(history) > 1:
        recent = history[-3:-1]
        lines = [
            f"Hand {h.get('hand', '?')}: {h.get('hero', [])} on {h.get('board', [])} — equity {h.get('equity', 50)}%" 
            for h in recent
        ]
        history_text = "\nPrevious hands this session:\n" + "\n".join(lines)

    transition_context = ""
    if transition == "hero_dealt":
        transition_context = "\n[EVENT: Player was just dealt hole cards. Advise on preflop action.]"
    elif transition == "flop_opened":
        transition_context = "\n[EVENT: The FLOP was just opened on the table. Announce the 3 flop cards, player's current hand strength, and flop bet/check recommendation.]"
    elif transition == "turn_opened":
        transition_context = "\n[EVENT: The TURN card was just dealt. Announce turn card impact and what action to take.]"
    elif transition == "river_opened":
        transition_context = "\n[EVENT: The RIVER card completed the board. Announce showdown verdict or value bet.]"

    confidence_note = ""
    if confidence == "low":
        confidence_note = "\nNote: Card detection confidence is LOW — player may want to verify cards."

    player_ask = question.strip() if question and question.strip() else "What should I do right now?"

    prompt = f"""{POKER_CONTEXT}

Live Game State:
- Hero's Hole Cards: {hero if hero else "not detected"}
- Community Board: {board if board else "none (preflop)"}
- Current Street: {street}
- Hero's Equity: {equity}%
- Card Reader Confidence: {confidence}
{transition_context}
{confidence_note}
{history_text}

Player Query / Situation: "{player_ask}"

Speak as the live voice coach in 2-3 decisive sentences:"""

    response = model.generate_content(prompt)
    return response.text.strip()
