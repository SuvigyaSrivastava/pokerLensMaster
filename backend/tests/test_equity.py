import random

from treys import Card

from equity import calculate_equity


def c(*s):
    return [Card.new(x) for x in s]


def test_aces_preflop_heads_up_is_about_85():
    random.seed(1)
    eq = calculate_equity(c("As", "Ah"), [], simulations=4000)
    assert 80 <= eq <= 90


def test_more_opponents_lowers_equity():
    random.seed(1)
    one = calculate_equity(c("As", "Ah"), [], simulations=3000, opponents=1)
    five = calculate_equity(c("As", "Ah"), [], simulations=3000, opponents=5)
    assert five < one - 15


def test_made_nuts_on_river_is_100():
    # royal flush on board+hand can't lose; ties impossible vs random hands except board play
    eq = calculate_equity(c("As", "Ks"), c("Qs", "Js", "Ts", "2d", "3c"), simulations=500)
    assert eq == 100.0


def test_invalid_inputs_return_50():
    assert calculate_equity(c("As"), []) == 50.0
    assert calculate_equity(c("As", "As"), []) == 50.0  # duplicate
    assert calculate_equity(c("As", "Kd"), c("As", "2c", "3d")) == 50.0
