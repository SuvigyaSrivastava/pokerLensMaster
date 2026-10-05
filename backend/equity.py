from treys import Card, Evaluator
import random

def calculate_equity(hero_cards: list, board_cards: list, simulations: int = 3000) -> float:
    """
    Monte Carlo equity calculation.
    hero_cards: list of treys Card integers (2 cards)
    board_cards: list of treys Card integers (0-5 cards)
    Returns: float between 0.0 and 100.0
    """
    try:
        if not hero_cards or len(hero_cards) != 2:
            return 50.0

        evaluator = Evaluator()

        # Build deck excluding known cards
        known = set(hero_cards + board_cards)
        all_ranks = '23456789TJQKA'
        all_suits = 'shdc'
        full_deck = []
        for r in all_ranks:
            for s in all_suits:
                try:
                    c = Card.new(r + s)
                    if c not in known:
                        full_deck.append(c)
                except Exception:
                    pass

        wins = 0
        ties = 0

        for _ in range(simulations):
            deck_copy = full_deck.copy()
            random.shuffle(deck_copy)

            # Fill board to 5 cards if needed
            needed = max(0, 5 - len(board_cards))
            sim_board = board_cards + deck_copy[:needed]
            remaining = deck_copy[needed:]

            # Opponent gets 2 random cards
            if len(remaining) < 2:
                continue
            opp_hand = remaining[:2]

            try:
                hero_score = evaluator.evaluate(sim_board, hero_cards)
                opp_score = evaluator.evaluate(sim_board, opp_hand)

                # Lower score is better in treys (1 is royal flush)
                if hero_score < opp_score:
                    wins += 1
                elif hero_score == opp_score:
                    ties += 0.5
            except Exception:
                continue

        if simulations == 0:
            return 50.0

        total = wins + ties
        equity = round((total / simulations) * 100, 1)
        return max(0.0, min(100.0, equity))
    except Exception:
        return 50.0
