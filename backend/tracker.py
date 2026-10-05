"""Per-session state: bounded hand history + debounced table-change detection."""
from collections import OrderedDict
from typing import Any, Dict, List, Optional, Tuple

from cards import has_unknown, known

MAX_SESSIONS = 500
MAX_HISTORY = 50
CONFIRM_FRAMES = 2  # identical clean live frames needed before a change is believed


def signature(cards: dict) -> Tuple[tuple, tuple]:
    return (
        tuple(sorted(cards.get("hero_cards", []))),
        tuple(sorted(cards.get("board_cards", []))),
    )


def detect_transition(current: dict, previous: Optional[dict]) -> Tuple[bool, Optional[str]]:
    """Classify the change between two (clean) table states."""
    hero = current.get("hero_cards", [])
    board = current.get("board_cards", [])

    if not previous:
        if not hero and not board:
            return False, None  # empty table, nothing to coach
        if len(board) >= 3:
            return True, {3: "flop_opened", 4: "turn_opened"}.get(len(board), "river_opened")
        if len(hero) == 2:
            return True, "hero_dealt"
        return True, "initial"

    prev_hero = sorted(previous.get("hero_cards", []))
    prev_board = sorted(previous.get("board_cards", []))
    curr_hero = sorted(hero)
    curr_board = sorted(board)

    if curr_hero and curr_hero != prev_hero:
        return True, "hero_dealt"
    if len(prev_board) < 3 <= len(curr_board):
        return True, "flop_opened"
    if len(prev_board) < 4 <= len(curr_board):
        return True, "turn_opened"
    if len(prev_board) < 5 <= len(curr_board):
        return True, "river_opened"
    if len(curr_board) > len(prev_board) or (
        len(curr_board) == len(prev_board) and curr_board != prev_board
    ):
        return True, "board_updated"
    return False, None  # includes the board being cleared between hands


class Session:
    def __init__(self) -> None:
        self.history: List[Dict[str, Any]] = []
        self.confirmed: Optional[dict] = None
        self._pending_sig = None
        self._pending_count = 0

    def add_hand(self, summary: Dict[str, Any]) -> int:
        self.history.append(summary)
        if len(self.history) > MAX_HISTORY:
            self.history = self.history[-MAX_HISTORY:]
        return summary["hand"]

    def next_hand_number(self) -> int:
        return (self.history[-1]["hand"] + 1) if self.history else 1

    def clear(self) -> None:
        self.history = []
        self.confirmed = None
        self._pending_sig = None
        self._pending_count = 0

    def _reset_pending(self) -> None:
        self._pending_sig = None
        self._pending_count = 0

    def update(self, cards: dict, live: bool) -> Tuple[bool, Optional[str]]:
        """
        Returns (state_changed, transition).
        Live frames: a change must be seen on CONFIRM_FRAMES consecutive clean
        frames, and frames with unreadable cards are ignored, so a single
        misread can't fake a new hand.
        Manual snaps: always "changed" (user asked), transition vs last confirmed.
        """
        unstable = has_unknown(cards)

        if not live:
            _, transition = detect_transition(cards, self.confirmed)
            if not unstable:
                self.confirmed = cards
                self._reset_pending()
            return True, transition

        if unstable:
            return False, None

        sig = signature(cards)
        if self.confirmed is not None and sig == signature(self.confirmed):
            self._reset_pending()
            return False, None

        if sig == self._pending_sig:
            self._pending_count += 1
        else:
            self._pending_sig, self._pending_count = sig, 1

        if self._pending_count < CONFIRM_FRAMES:
            return False, None

        changed, transition = detect_transition(cards, self.confirmed)
        self.confirmed = cards
        self._reset_pending()
        return changed, transition

    def hero_ready(self, cards: dict) -> bool:
        return len(known(cards.get("hero_cards", []))) == 2


class SessionStore:
    """LRU-bounded session map so memory can't grow forever."""

    def __init__(self, max_sessions: int = MAX_SESSIONS) -> None:
        self._max = max_sessions
        self._data: "OrderedDict[str, Session]" = OrderedDict()

    def get(self, sid: str) -> Session:
        if sid in self._data:
            self._data.move_to_end(sid)
        else:
            self._data[sid] = Session()
            while len(self._data) > self._max:
                self._data.popitem(last=False)
        return self._data[sid]

    def peek(self, sid: str) -> Optional[Session]:
        return self._data.get(sid)
