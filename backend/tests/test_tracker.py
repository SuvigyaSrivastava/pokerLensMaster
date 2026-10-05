from tracker import Session, SessionStore, detect_transition


def st(hero, board=()):
    return {"hero_cards": list(hero), "board_cards": list(board)}


def test_empty_table_is_not_an_event():
    assert detect_transition(st([]), None) == (False, None)


def test_transitions():
    prev = st(["As", "Kd"])
    assert detect_transition(st(["As", "Kd"], ["2c", "7d", "9h"]), prev) == (True, "flop_opened")
    assert detect_transition(st(["As", "Kd"], ["2c", "7d", "9h", "Jc"]), st(["As", "Kd"], ["2c", "7d", "9h"])) == (True, "turn_opened")
    assert detect_transition(st(["Qs", "Qd"]), prev) == (True, "hero_dealt")
    # board cleared between hands is not a coachable event
    assert detect_transition(st([], []), st(["As", "Kd"], ["2c", "7d", "9h"])) == (False, None)


def test_live_debounce_needs_two_identical_frames():
    s = Session()
    frame = st(["As", "Kd"])
    assert s.update(frame, live=True) == (False, None)      # first sighting: not believed yet
    assert s.update(frame, live=True) == (True, "hero_dealt")
    assert s.update(frame, live=True) == (False, None)       # stable afterwards


def test_single_misread_cannot_fake_a_new_hand():
    s = Session()
    good = st(["As", "Kd"])
    s.update(good, True); s.update(good, True)
    flicker = st(["As", "Kh"])
    assert s.update(flicker, True) == (False, None)
    assert s.update(good, True) == (False, None)             # back to the real hand: no event
    assert s.update(st(["As", "??"]), True) == (False, None)  # unreadable frames ignored


def test_manual_snap_always_counts():
    s = Session()
    changed, tr = s.update(st(["As", "Kd"]), live=False)
    assert changed and tr == "hero_dealt"


def test_store_is_bounded_and_history_capped():
    store = SessionStore(max_sessions=3)
    for i in range(10):
        store.get(f"session-{i}")
    assert store.peek("session-0") is None and store.peek("session-9") is not None
    s = Session()
    for n in range(1, 80):
        s.add_hand({"hand": n})
    assert len(s.history) == 50 and s.next_hand_number() == 80
