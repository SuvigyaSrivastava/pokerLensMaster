"""
Authoritative poker hand state.

The live model *reports* what it sees/hears through tool calls; this module
validates every report and owns the truth (pot, bets, cards, street). Equity,
pot odds and outs are computed here, never "guessed" by the LLM.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from treys import Card, Evaluator

from cards import UNKNOWN, is_known, normalize_card
from equity import calculate_equity

_EVAL = Evaluator()
_STREETS = {0: "preflop", 3: "flop", 4: "turn", 5: "river"}
_ALL = [r + s for r in "23456789TJQKA" for s in "shdc"]
_HERO_ALIASES = {"hero", "me", "i", "player", "myself", "my", "user", "you"}
_ACTIONS = {"fold", "check", "call", "bet", "raise", "allin"}
MAX_ACTIONS = 60


def _err(msg: str) -> Dict[str, Any]:
    return {"ok": False, "error": msg}


def _norm_actor(actor: Any) -> str:
    a = str(actor or "").strip().lower()
    if a in _HERO_ALIASES or a.startswith("hero"):
        return "hero"
    return "opp:" + (a[:24] or "unknown")


@dataclass
class GameState:
    hand_number: int = 1
    hero: List[str] = field(default_factory=list)
    board: List[str] = field(default_factory=list)
    pot: float = 0.0
    opponents: int = 1  # opponents still in the hand
    current_bet: float = 0.0  # highest total commitment on this street
    commits: Dict[str, float] = field(default_factory=dict)  # actor -> chips on this street
    actions: List[Dict[str, Any]] = field(default_factory=list)
    folded: bool = False
    small_blind: float = 0.0
    big_blind: float = 0.0
    updated_at: float = field(default_factory=time.time)

    # ---------- derived ----------
    @property
    def street(self) -> str:
        return _STREETS.get(len(self.board), "unknown")

    @property
    def to_call(self) -> float:
        return max(0.0, self.current_bet - self.commits.get("hero", 0.0))

    def snapshot(self) -> Dict[str, Any]:
        return {
            "hand_number": self.hand_number,
            "hero_cards": list(self.hero),
            "board_cards": list(self.board),
            "street": self.street,
            "pot": _num(self.pot),
            "to_call": _num(self.to_call),
            "opponents": self.opponents,
            "hero_folded": self.folded,
            "small_blind": _num(self.small_blind),
            "big_blind": _num(self.big_blind),
            "recent_actions": self.actions[-8:],
        }

    def _touch(self) -> None:
        self.updated_at = time.time()

    def _ok(self, **extra: Any) -> Dict[str, Any]:
        self._touch()
        return {"ok": True, **extra, "state": self.snapshot()}

    # ---------- operations (each returns {"ok": bool, ...}) ----------
    def new_hand(self) -> Dict[str, Any]:
        self.hand_number += 1
        self.hero, self.board = [], []
        self.commits, self.actions = {}, []
        self.folded = False
        self.current_bet = self.big_blind if self.big_blind else 0.0
        self.pot = self.small_blind + self.big_blind
        return self._ok(note="New hand started. Waiting for hero's hole cards.")

    def set_blinds(self, small: Any, big: Any) -> Dict[str, Any]:
        try:
            s, b = float(small), float(big)
        except (TypeError, ValueError):
            return _err("small and big blind must be numbers")
        if s < 0 or b < 0 or (b and s > b):
            return _err("invalid blinds")
        self.small_blind, self.big_blind = s, b
        if not self.board and not self.actions and self.pot == 0:
            self.pot, self.current_bet = s + b, b
        return self._ok()

    def set_hero_cards(self, cards: Any) -> Dict[str, Any]:
        norm = [normalize_card(c) for c in (cards or [])] if isinstance(cards, (list, tuple)) else []
        if len(norm) != 2 or not all(is_known(c) for c in norm):
            return _err("Need exactly two readable hole cards like ['Qh','Kd']. Ask the player to show them again.")
        if norm[0] == norm[1]:
            return _err("The two hole cards are identical, which is impossible. Re-read them.")
        clash = [c for c in norm if c in self.board]
        if clash:
            return _err(f"{', '.join(clash)} is already on the board. Re-read the hole cards.")
        replaced = bool(self.hero) and set(self.hero) != set(norm)
        self.hero = norm
        note = "Hole cards replaced." if replaced else "Hole cards set."
        return self._ok(note=note)

    def set_board(self, cards: Any) -> Dict[str, Any]:
        if not isinstance(cards, (list, tuple)):
            return _err("cards must be a list")
        norm = [normalize_card(c) for c in cards]
        if len(norm) not in (0, 3, 4, 5):
            return _err("Board must have 0, 3, 4 or 5 cards (flop/turn/river).")
        if not all(is_known(c) for c in norm):
            return _err("Some board cards are unreadable. Wait for a clearer view.")
        if len(set(norm)) != len(norm):
            return _err("Duplicate cards on the board. Re-read.")
        clash = [c for c in norm if c in self.hero]
        if clash:
            return _err(f"{', '.join(clash)} is in the hero's hand. One of the readings is wrong.")
        if self.board and norm and not set(self.board).issubset(norm):
            return _err(
                "New board contradicts the previous one. If a new hand started, call new_hand first; "
                "otherwise re-read the board."
            )
        advanced = len(norm) > len(self.board)
        self.board = norm
        if advanced and norm:
            self.commits, self.current_bet = {}, 0.0  # fresh betting round
        return self._ok(note=f"Board set: {self.street}." if norm else "Board cleared.")

    def set_pot(self, amount: Any) -> Dict[str, Any]:
        try:
            a = float(amount)
        except (TypeError, ValueError):
            return _err("pot must be a number")
        if a < 0 or a > 1e9:
            return _err("pot out of range")
        self.pot = a
        return self._ok()

    def set_to_call(self, amount: Any) -> Dict[str, Any]:
        try:
            a = float(amount)
        except (TypeError, ValueError):
            return _err("amount must be a number")
        if a < 0 or a > 1e9:
            return _err("amount out of range")
        self.current_bet = self.commits.get("hero", 0.0) + a
        return self._ok()

    def set_opponents(self, count: Any) -> Dict[str, Any]:
        try:
            n = int(count)
        except (TypeError, ValueError):
            return _err("count must be an integer")
        if not 1 <= n <= 8:
            return _err("opponents must be between 1 and 8")
        self.opponents = n
        return self._ok()

    def record_action(self, actor: Any, action: Any, amount: Any = None) -> Dict[str, Any]:
        """
        `amount` for bet/raise/allin is the player's TOTAL bet on this street after
        acting ("raise to 40"). For call/check/fold it is ignored.
        """
        act = str(action or "").strip().lower().replace("-", "").replace("_", "").replace(" ", "")
        act = {"allin": "allin", "shove": "allin", "limp": "call", "muck": "fold"}.get(act, act)
        if act not in _ACTIONS:
            return _err(f"Unknown action '{action}'. Use fold/check/call/bet/raise/allin.")
        who = _norm_actor(actor)
        paid = 0.0

        if act in ("bet", "raise", "allin"):
            try:
                total = float(amount)
            except (TypeError, ValueError):
                return _err("bet/raise needs a numeric total amount")
            if total <= 0 or total > 1e9:
                return _err("bet amount out of range")
            total = max(total, self.current_bet) if act == "allin" else total
            if total < self.commits.get(who, 0.0):
                return _err("Amount is lower than what that player already put in this street.")
            paid = total - self.commits.get(who, 0.0)
            self.commits[who] = total
            self.current_bet = max(self.current_bet, total)
            self.pot += paid
        elif act == "call":
            paid = max(0.0, self.current_bet - self.commits.get(who, 0.0))
            self.commits[who] = self.current_bet
            self.pot += paid
        elif act == "fold":
            if who == "hero":
                self.folded = True
            else:
                self.opponents = max(1, self.opponents - 1)

        self.actions.append(
            {"street": self.street, "actor": who, "action": act, "amount": _num(amount) if amount is not None else None, "paid": _num(paid)}
        )
        self.actions = self.actions[-MAX_ACTIONS:]
        return self._ok()

    # ---------- analysis ----------
    def decision_facts(self, simulations: int = 2500) -> Dict[str, Any]:
        if len(self.hero) != 2:
            return _err("Hero cards are not known yet.")
        hero_t = [Card.new(c) for c in self.hero]
        board_t = [Card.new(c) for c in self.board]
        eq = calculate_equity(hero_t, board_t, simulations=simulations, opponents=self.opponents)

        to_call, pot = self.to_call, self.pot
        required = round(to_call / (pot + to_call) * 100, 1) if to_call > 0 and (pot + to_call) > 0 else 0.0
        out = {
            "ok": True,
            "hero_cards": list(self.hero),
            "board_cards": list(self.board),
            "street": self.street,
            "opponents": self.opponents,
            "pot": _num(pot),
            "to_call": _num(to_call),
            "equity_pct": eq,
            "required_equity_pct": required,
            "made_hand": made_hand_label(self.hero, self.board),
            "verdict_hint": verdict(eq, to_call, required),
            "equity_note": "Equity is vs random hands, not the opponents' actual ranges; treat as a baseline.",
        }
        if len(self.board) in (3, 4):
            out["outs"] = count_outs(self.hero, self.board)
        return out


def _num(v: Any) -> Any:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return v
    return int(f) if f == int(f) else round(f, 2)


def made_hand_label(hero: List[str], board: List[str]) -> str:
    if len(board) < 3:
        r1, r2 = hero[0][0], hero[1][0]
        suited = hero[0][1] == hero[1][1]
        if r1 == r2:
            return f"pocket pair of {r1}s"
        return f"{''.join(sorted([r1, r2], key=lambda r: '23456789TJQKA'.index(r), reverse=True))}{' suited' if suited else ' offsuit'}"
    score = _EVAL.evaluate([Card.new(c) for c in board], [Card.new(c) for c in hero])
    return _EVAL.class_to_string(_EVAL.get_rank_class(score))


def count_outs(hero: List[str], board: List[str]) -> Dict[str, Any]:
    """Cards that would improve hero's hand category (ignores improvements that only help via the board)."""
    hero_t = [Card.new(c) for c in hero]
    board_t = [Card.new(c) for c in board]
    base_class = _EVAL.get_rank_class(_EVAL.evaluate(board_t, hero_t))
    known = set(hero) | set(board)
    outs = []
    for c in _ALL:
        if c in known:
            continue
        ct = Card.new(c)
        new_class = _EVAL.get_rank_class(_EVAL.evaluate(board_t + [ct], hero_t))
        if new_class < base_class:  # lower class = stronger hand
            outs.append(c)
    n = len(outs)
    mult = 4 if len(board) == 3 else 2
    return {"count": n, "cards": outs[:20], "approx_hit_pct": min(100, n * mult), "rule": "rule of 4 (flop) / rule of 2 (turn)"}


def verdict(equity: float, to_call: float, required: float) -> str:
    if to_call <= 0:
        if equity >= 65:
            return "Strong: bet for value (about 2/3 pot)."
        if equity >= 45:
            return "Medium: check, or a small bet for protection."
        return "Weak: check and give up cheaply; don't bluff into many players."
    if equity >= max(60.0, required + 15):
        return "Strong: raise for value, or at least call."
    if equity >= required + 3:
        return "Profitable call on pot odds."
    if equity >= required - 3:
        return "Marginal: close to break-even; call only with good implied odds or a draw."
    return "Fold: equity is below the price you're being laid."
