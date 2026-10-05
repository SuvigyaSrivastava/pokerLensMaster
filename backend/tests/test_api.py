import pytest
from fastapi.testclient import TestClient

import main

IMG = "aGVsbG8="  # any non-empty base64


def det(hero, board=()):
    return {"hero_cards": hero, "board_cards": list(board), "street": "x", "confidence": "high", "detection_notes": ""}


@pytest.fixture(autouse=True)
def fresh(monkeypatch):
    main.store = main.SessionStore()
    main._hits.clear()
    monkeypatch.setattr(main, "get_coaching", lambda **kw: "Raise it up.")
    yield


def client():
    return TestClient(main.app)


def test_live_stays_silent_until_stable_then_speaks_once(monkeypatch):
    monkeypatch.setattr(main, "detect_cards", lambda b: det(["As", "Ah"]))
    body = {"image_b64": IMG, "session_id": "session-abcd1234", "is_live": True}
    c = client()
    assert c.post("/analyze", json=body).json()["advice"] is None          # frame 1
    r2 = c.post("/analyze", json=body).json()                               # frame 2 confirms
    assert r2["advice"] == "Raise it up." and r2["transition"] == "hero_dealt" and r2["hand_number"] == 1
    assert c.post("/analyze", json=body).json()["advice"] is None          # stable: silent


def test_manual_snap_and_question_always_answer(monkeypatch):
    monkeypatch.setattr(main, "detect_cards", lambda b: det(["As", "Ah"]))
    r = client().post("/analyze", json={"image_b64": IMG, "session_id": "session-abcd1234"}).json()
    assert r["advice"] and 80 <= r["equity"] <= 90


def test_missing_key_is_503_and_bad_session_400(monkeypatch):
    def boom(b):
        raise main.GeminiConfigError("GEMINI_API_KEY is not set")
    monkeypatch.setattr(main, "detect_cards", boom)
    c = client()
    assert c.post("/analyze", json={"image_b64": IMG}).status_code == 503
    assert c.post("/analyze", json={"image_b64": IMG, "session_id": "bad id!"}).status_code == 400


def test_tts_limits():
    c = client()
    assert c.post("/tts", json={"text": "x" * 700}).status_code == 422
    for _ in range(20):
        c.post("/tts", json={"text": "hi"})
    assert c.post("/tts", json={"text": "hi"}).status_code == 429


def test_reset_clears_history(monkeypatch):
    monkeypatch.setattr(main, "detect_cards", lambda b: det(["As", "Ah"]))
    c = client()
    sid = "session-abcd1234"
    c.post("/analyze", json={"image_b64": IMG, "session_id": sid})
    assert len(c.get(f"/history/{sid}").json()["history"]) == 1
    c.post("/reset", json={"session_id": sid})
    assert c.get(f"/history/{sid}").json()["history"] == []
