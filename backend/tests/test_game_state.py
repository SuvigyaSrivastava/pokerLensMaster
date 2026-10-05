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


def test_history_remembers_finished_hands():
    g = GameState()
    g.new_hand()                       # no cards were seen: nothing to remember
    assert g.history == []
    g.set_hero_cards(["As", "Kd"]); g.set_board(["7c", "2d", "9s"]); g.set_pot(120)
    g.record_action("ravi", "bet", 60)
    g.new_hand()
    h = g.recall()["previous_hands"]
    assert len(h) == 1 and h[0]["hero_cards"] == ["As", "Kd"] and h[0]["reached"] == "flop"
    assert h[0]["pot"] == 180 and h[0]["actions"] == ["ravi bet 60"]
    assert g.snapshot()["history"][0]["hand"] == 1 and g.hand_number == 2 and g.hero == []


def test_restore_rebuilds_state_and_rejects_bad_fields():
    g = GameState()
    g.set_hero_cards(["Ah", "Kh"]); g.set_board(["Qh", "7h", "2c"]); g.set_pot(1050); g.set_to_call(400); g.set_opponents(2)
    snap = g.snapshot()
    f = GameState()
    r = f.restore(snap)
    assert r["ok"] and r["skipped"] == []
    for k in ("hero_cards", "board_cards", "street", "pot", "to_call", "opponents", "hand_number"):
        assert f.snapshot()[k] == snap[k], k
    bad = GameState()
    r = bad.restore({"hero_cards": ["Ah", "Ah"], "board_cards": ["Qh", "7h"], "pot": 50, "opponents": 99})
    assert r["ok"] and len(r["skipped"]) == 3
    assert bad.hero == [] and bad.board == [] and bad.pot == 50 and bad.opponents == 1
    assert not GameState().restore("nope")["ok"]


def test_outs_ignore_cards_that_only_pair_the_board():
    from game_state import count_outs
    # nut flush draw + two overcards: 9 hearts + 3 aces + 3 kings = 15 (2h pairs the board but makes the flush)
    o = count_outs(["Ah", "Kh"], ["Qh", "7h", "2c"])
    assert o["count"] == 15 and "2h" in o["cards"] + ["2h"] and "Qs" not in o["cards"]
    # pocket pair: two set outs, and board-pairing cards are not outs
    assert count_outs(["8s", "8d"], ["Kc", "7h", "2d"])["count"] == 2
    # set on the flop: any board pair makes a full house, and the case 8 makes quads -> 3 + 3 + 1 = 7
    assert count_outs(["8s", "8d"], ["8c", "Kh", "2d"])["count"] == 7
