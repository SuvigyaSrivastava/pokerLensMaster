from typing import Optional

from gemini_client import generate

POKER_CONTEXT = """
You are PokerLens — a sharp, real-time poker coach sitting alongside the player during a live game.
You speak aloud via voice to the player as each action unfolds.

Rules for your responses:
- Maximum 2 to 3 punchy sentences. Never use bullet points or lists.
- Speak in present tense, decisive tone — like a seasoned Las Vegas pro whispering in their ear.
- Always name the cards, board cards, and equity percentage clearly.
- Equity is Monte Carlo win probability against random opponent hands, not against a read on their range — say "equity" and factor in how many opponents remain.
- If equity is above 65%: aggressively recommend value betting or raising.
- If equity is 45-65%: recommend pot control, checking, or calculated small bets.
- If equity is below 45%: warn of danger, recommend folding to aggression or checking.
- When a new street opens (Flop, Turn, River), immediately call out the texture and what the player should do right now.
- Never use filler words like "I think", "maybe", or "as an AI". Be 100% decisive.
"""

TRANSITIONS = {
    "hero_dealt": "[EVENT: Player was just dealt hole cards. Advise on preflop action.]",
    "flop_opened": "[EVENT: The FLOP was just opened on the table. Announce the 3 flop cards, player's current hand strength, and flop bet/check recommendation.]",
    "turn_opened": "[EVENT: The TURN card was just dealt. Announce turn card impact and what action to take.]",
    "river_opened": "[EVENT: The RIVER card completed the board. Announce showdown verdict or value bet.]",
}


def get_coaching(
    cards: dict,
    equity: float,
    question: Optional[str] = "",
    history: Optional[list] = None,
    transition: Optional[str] = None,
    opponents: int = 1,
) -> str:
    """Returns a proactive coaching recommendation string."""
    hero = cards.get("hero_cards", [])
    board = cards.get("board_cards", [])
    street = cards.get("street", "unknown")
    confidence = cards.get("confidence", "medium")

    # Previous hands only (the current hand is appended to history after coaching).
    history_text = ""
    if history:
        lines = [
            f"Hand {h.get('hand', '?')}: {h.get('hero', [])} on {h.get('board', [])} — equity {h.get('equity', 50)}%"
            for h in history[-3:]
        ]
        history_text = "\nPrevious hands this session:\n" + "\n".join(lines)

    transition_context = "\n" + TRANSITIONS[transition] if transition in TRANSITIONS else ""
    confidence_note = (
        "\nNote: Card detection confidence is LOW — player may want to verify cards."
        if confidence == "low"
        else ""
    )
    player_ask = question.strip() if question and question.strip() else "What should I do right now?"

    prompt = f"""{POKER_CONTEXT}

Live Game State:
- Hero's Hole Cards: {hero if hero else "not detected"}
- Community Board: {board if board else "none (preflop)"}
- Current Street: {street}
- Hero's Equity: {equity}% (vs {opponents} random opponent{'s' if opponents != 1 else ''})
- Card Reader Confidence: {confidence}
{transition_context}
{confidence_note}
{history_text}

Player Query / Situation: "{player_ask}"

Speak as the live voice coach in 2-3 decisive sentences:"""

    text = generate([prompt], max_output_tokens=300)
    if not text:
        raise RuntimeError("Gemini returned no coaching text")
    return text
