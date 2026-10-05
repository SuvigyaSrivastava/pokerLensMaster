import random
from typing import List

from treys import Card, Evaluator

_ALL = [Card.new(r + s) for r in "23456789TJQKA" for s in "shdc"]
_evaluator = Evaluator()


def calculate_equity(
    hero_cards: List[int],
    board_cards: List[int],
    simulations: int = 3000,
    opponents: int = 1,
) -> float:
    """
    Monte Carlo equity (percent) of `hero_cards` against `opponents` random hands.
    Ties split the pot (hero gets 1/(n_tied)). Returns 50.0 on invalid input.
    hero_cards: 2 treys ints; board_cards: 0-5 treys ints.
    """
    try:
        opponents = max(1, min(8, int(opponents)))
        if len(hero_cards) != 2 or len(board_cards) > 5 or simulations <= 0:
            return 50.0

        known = set(hero_cards) | set(board_cards)
        if len(known) != len(hero_cards) + len(board_cards):
            return 50.0  # duplicate card -> impossible state

        deck = [c for c in _ALL if c not in known]
        need_board = 5 - len(board_cards)
        need = need_board + 2 * opponents
        if need > len(deck):
            return 50.0

        score = 0.0
        valid = 0
        for _ in range(simulations):
            draw = random.sample(deck, need)
            full_board = board_cards + draw[:need_board]
            hero_score = _evaluator.evaluate(full_board, hero_cards)

            best_opp = None
            tied = 1
            lost = False
            rest = draw[need_board:]
            for i in range(opponents):
                opp = rest[2 * i: 2 * i + 2]
                s = _evaluator.evaluate(full_board, opp)
                if s < hero_score:  # lower is better in treys
                    lost = True
                    break
                if s == hero_score:
                    tied += 1
            valid += 1
            if not lost:
                score += 1.0 / tied

        if valid == 0:
            return 50.0
        return round(score / valid * 100, 1)
    except Exception:
        return 50.0
