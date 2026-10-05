import random

from game_state import GameState, verdict


def test_hero_and_board_validation():
    g = GameState()
    assert g.set_hero_cards(["Qh", "Kd"])["ok"]
    assert not g.set_hero_cards(["Qh", "Qh"])["ok"]
    assert not g.set_hero_cards(["Qh"])["ok"]
    assert not g.set_hero_cards(["??", "Kd"])["ok"]
    assert not g.set_board(["Qh", "7c", "2d"])["ok"]       # clashes with hero card
    assert not g.set_board(["7c", "2d"])["ok"]             # not a legal board size
    r = g.set_board(["7c", "2d", "9s"])
    assert r["ok"] and r["state"]["street"] == "flop"
    assert not g.set_board(["Ac", "3d", "8s"])["ok"]       # contradicts previous flop
    assert g.set_board(["7c", "2d", "9s", "Jc"])["state"]["street"] == "turn"


def test_betting_math_and_to_call():
    g = GameState()
    g.set_hero_cards(["As", "Kd"])
    g.set_board(["7c", "2d", "9s"])
    g.set_pot(100)
    g.record_action("villain", "bet", 50)
    assert g.pot == 150 and g.to_call == 50
    g.record_action("hero", "call")
    assert g.pot == 200 and g.to_call == 0
    g.record_action("villain", "raise", 120)   # raise to 120 total (had 50 in)
    assert g.pot == 270 and g.to_call == 70
    g.record_action("hero", "fold")
    assert g.snapshot()["hero_folded"] is True


def test_new_street_resets_betting_round():
    g = GameState()
    g.set_hero_cards(["As", "Kd"]); g.set_board(["7c", "2d", "9s"])
    g.record_action("v", "bet", 30)
    assert g.to_call == 30
    g.set_board(["7c", "2d", "9s", "Jc"])
    assert g.to_call == 0


def test_manual_overrides_and_opponents():
    g = GameState()
    g.set_hero_cards(["As", "Kd"])
    g.set_pot(80); g.set_to_call(20)
    assert g.to_call == 20 and g.snapshot()["pot"] == 80
    assert not g.set_opponents(0)["ok"] and g.set_opponents(3)["ok"]
    g.record_action("v2", "fold")
    assert g.opponents == 2
    assert not g.record_action("v", "dance")["ok"]
    assert not g.record_action("v", "bet", "lots")["ok"]


def test_blinds_and_new_hand():
    g = GameState()
    g.set_blinds(5, 10)
    assert g.pot == 15
    g.set_hero_cards(["As", "Kd"]); g.set_board(["7c", "2d", "9s"])
    g.new_hand()
    assert g.hero == [] and g.board == [] and g.pot == 15 and g.hand_number == 2


def test_decision_facts_math():
    random.seed(3)
    g = GameState()
    g.set_hero_cards(["As", "Ah"])
    g.set_pot(100); g.set_to_call(50)
    f = g.decision_facts(simulations=1500)
    assert f["ok"] and f["required_equity_pct"] == 33.3
    assert f["equity_pct"] > 75 and f["made_hand"] == "pocket pair of As"
    assert "raise" in f["verdict_hint"].lower() or "call" in f["verdict_hint"].lower()


def test_outs_flush_draw():
    g = GameState()
    g.set_hero_cards(["As", "Ks"]); g.set_board(["2s", "7s", "Jd"])
    f = g.decision_facts(simulations=500)
    assert f["outs"]["count"] >= 9          # nine spades left for the flush (plus pair outs)
    assert f["outs"]["approx_hit_pct"] == min(100, f["outs"]["count"] * 4)


def test_verdict_thresholds():
    assert verdict(80, 0, 0).startswith("Strong")
    assert verdict(30, 50, 25).startswith("Profitable")
    assert verdict(20, 50, 33).startswith("Fold")


def test_facts_without_hero_cards():
    assert GameState().decision_facts()["ok"] is False
