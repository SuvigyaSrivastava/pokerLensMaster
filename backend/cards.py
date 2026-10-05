"""Card parsing / validation helpers shared by the vision + equity pipeline."""
import re
from typing import Any, List

UNKNOWN = "??"
_CARD_RE = re.compile(r"^(10|[2-9TJQKA])([shdc])$", re.IGNORECASE)
_STREETS = {0: "preflop", 3: "flop", 4: "turn", 5: "river"}


def normalize_card(raw: Any) -> str:
    """Canonical 'As' / 'Th' string, or UNKNOWN for anything unreadable."""
    if not isinstance(raw, str):
        return UNKNOWN
    s = raw.strip()
    m = _CARD_RE.match(s)
    if not m:
        return UNKNOWN
    rank = m.group(1).upper()
    rank = "T" if rank == "10" else rank
    return rank + m.group(2).lower()


def is_known(card: str) -> bool:
    return card != UNKNOWN


def known(cards: List[str]) -> List[str]:
    return [c for c in cards if is_known(c)]


def has_unknown(cards: dict) -> bool:
    return any(
        not is_known(c)
        for c in cards.get("hero_cards", []) + cards.get("board_cards", [])
    )


def normalize_detection(result: dict) -> dict:
    """
    Clean the raw vision-model output: canonical card strings, max 2 hero / 5 board,
    a card seen twice is demoted to UNKNOWN (physically impossible), street derived
    from the board length instead of trusting the model, confidence downgraded
    when any card is unreadable.
    """
    hero_raw = result.get("hero_cards") if isinstance(result.get("hero_cards"), list) else []
    board_raw = result.get("board_cards") if isinstance(result.get("board_cards"), list) else []

    seen = set()

    def clean(raw, limit):
        out = []
        for c in raw[:limit]:
            n = normalize_card(c)
            if is_known(n):
                if n in seen:
                    n = UNKNOWN
                else:
                    seen.add(n)
            out.append(n)
        return out

    hero = clean(hero_raw, 2)
    board = clean(board_raw, 5)

    confidence = str(result.get("confidence", "low")).lower()
    if confidence not in ("high", "medium", "low"):
        confidence = "low"
    out = {
        "hero_cards": hero,
        "board_cards": board,
        "street": _STREETS.get(len(board), "unknown"),
        "confidence": confidence,
        "detection_notes": str(result.get("detection_notes", "") or ""),
    }
    if has_unknown(out) and confidence == "high":
        out["confidence"] = "medium"
    return out
