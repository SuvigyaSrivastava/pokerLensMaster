"""Relay tests with a scripted fake Gemini Live session (no network)."""
import asyncio
import base64
import time
from contextlib import asynccontextmanager
from types import SimpleNamespace as NS

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

import live_relay
import main
from gemini_client import GeminiConfigError
from live_relay import SCAN_NUDGE, ADVISE_PROMPT


def sc(audio=None, in_text=None, out_text=None, turn_complete=False, interrupted=False):
    parts = [NS(inline_data=NS(data=audio))] if audio else []
    return NS(
        session_resumption_update=None, go_away=None, tool_call=None,
        server_content=NS(
            model_turn=NS(parts=parts) if parts else None,
            input_transcription=NS(text=in_text) if in_text else None,
            output_transcription=NS(text=out_text) if out_text else None,
            interrupted=interrupted, turn_complete=turn_complete,
        ),
    )


def tool(name, args, id="t1"):
    return NS(session_resumption_update=None, go_away=None, server_content=None,
              tool_call=NS(function_calls=[NS(id=id, name=name, args=args)]))


def handle_msg(h):
    return NS(session_resumption_update=NS(resumable=True, new_handle=h), go_away=None,
              tool_call=None, server_content=None)


class FakeSession:
    def __init__(self, on_send=None, fail_after_handle=None):
        self.q = asyncio.Queue()
        self.loop = None
        self.sent, self.tool_responses = [], []
        self.on_send = on_send
        self.fail_after_handle = fail_after_handle

    def push(self, *msgs):
        for m in msgs:  # may be called from the test thread: hop onto the relay's loop
            if self.loop:
                self.loop.call_soon_threadsafe(self.q.put_nowait, m)
            else:
                self.q.put_nowait(m)

    async def send_realtime_input(self, **kw):
        self.sent.append(kw)
        if self.on_send:
            self.on_send(self, kw)

    async def send_tool_response(self, function_responses):
        self.tool_responses.extend(function_responses)

    async def receive(self):
        self.loop = asyncio.get_running_loop()
        while True:
            m = await self.q.get()
            if isinstance(m, Exception):
                raise m
            yield m
            if getattr(m, "server_content", None) and m.server_content.turn_complete:
                return


class FakeClient:
    def __init__(self, sessions):
        self.sessions, self.configs = list(sessions), []
        self.aio = NS(live=NS(connect=self._connect))

    @asynccontextmanager
    async def _connect(self, model, config):
        self.configs.append(config)
        yield self.sessions.pop(0)


@pytest.fixture(autouse=True)
def fast(monkeypatch):
    monkeypatch.setattr(live_relay, "IDLE_TIMEOUT", 6.0)  # fail-safe so a broken test can't hang
    monkeypatch.setattr(main, "_live_active", 0)
    monkeypatch.delenv("DEMO_PASSCODE", raising=False)


def use(monkeypatch, *sessions):
    fc = FakeClient(sessions)
    monkeypatch.setattr(live_relay, "get_live_client", lambda: fc)
    return fc


def collect_until(ws, pred, limit=60):
    seen = []
    for _ in range(limit):
        m = ws.receive_json()
        seen.append(m)
        if pred(m):
            return seen
    raise AssertionError(f"condition not met; saw {[m['type'] for m in seen]}")


def drain(ws):
    """Everything the server sent before our ping was answered."""
    time.sleep(0.4)
    ws.send_json({"type": "ping"})
    return collect_until(ws, lambda m: m["type"] == "pong")[:-1]


def test_tool_calls_update_state_and_speech_is_forwarded(monkeypatch):
    s = FakeSession()
    fc = use(monkeypatch, s)
    c = TestClient(main.app)
    with c.websocket_connect("/ws/live") as ws:
        collect_until(ws, lambda m: m["type"] == "status" and m["status"] == "live")
        s.push(tool("set_hero_cards", {"cards": ["Qh", "Kd"]}), sc(audio=b"\x01\x02", out_text="Queen of hearts.", turn_complete=True))
        msgs = collect_until(ws, lambda m: m["type"] == "turn_complete")
        types_ = [m["type"] for m in msgs]
        assert "tool" in types_ and "audio" in types_
        state = [m for m in msgs if m["type"] == "state"][-1]["state"]
        assert state["hero_cards"] == ["Qh", "Kd"]
        audio = next(m for m in msgs if m["type"] == "audio")
        assert base64.b64decode(audio["data"]) == b"\x01\x02" and audio["rate"] == 24000
        assert any(m["type"] == "transcript" and m["role"] == "coach" for m in msgs)
    assert s.tool_responses and s.tool_responses[0].scheduling.name == "WHEN_IDLE"
    cfg = fc.configs[0]
    assert cfg.context_window_compression is not None and cfg.session_resumption is not None


def test_scan_turn_is_muted_unless_hole_cards_recorded(monkeypatch):
    def reply(sess, kw):
        if kw.get("text") == SCAN_NUDGE:
            sess.push(sc(audio=b"\x09", out_text="I see the table", turn_complete=True))
    s = FakeSession(on_send=reply)
    use(monkeypatch, s)
    with TestClient(main.app).websocket_connect("/ws/live") as ws:
        collect_until(ws, lambda m: m["type"] == "status" and m["status"] == "live")
        ws.send_json({"type": "scan"})
        out = drain(ws)
        assert not [m for m in out if m["type"] in ("audio", "transcript")], out


def test_scan_turn_allows_hole_card_readback(monkeypatch):
    def reply(sess, kw):
        if kw.get("text") == SCAN_NUDGE:
            sess.push(tool("set_hero_cards", {"cards": ["As", "Td"]}), sc(audio=b"\x07", out_text="Ace of spades, ten of diamonds.", turn_complete=True))
    s = FakeSession(on_send=reply)
    use(monkeypatch, s)
    with TestClient(main.app).websocket_connect("/ws/live") as ws:
        collect_until(ws, lambda m: m["type"] == "status" and m["status"] == "live")
        ws.send_json({"type": "scan"})
        out = drain(ws)
        assert any(m["type"] == "audio" for m in out)
        assert any(m["type"] == "transcript" and "Ace" in m["text"] for m in out)


def test_scan_rate_limited_but_manual_scan_forced(monkeypatch):
    s = FakeSession()
    use(monkeypatch, s)
    with TestClient(main.app).websocket_connect("/ws/live") as ws:
        collect_until(ws, lambda m: m["type"] == "status" and m["status"] == "live")
        for _ in range(5):
            ws.send_json({"type": "scene"})
        drain(ws)
        assert sum(1 for k in s.sent if k.get("text") == SCAN_NUDGE) == 1
        ws.send_json({"type": "scan"}); drain(ws)
        assert sum(1 for k in s.sent if k.get("text") == SCAN_NUDGE) == 2


def test_media_and_advise_are_forwarded(monkeypatch):
    s = FakeSession()
    use(monkeypatch, s)
    with TestClient(main.app).websocket_connect("/ws/live") as ws:
        collect_until(ws, lambda m: m["type"] == "status" and m["status"] == "live")
        ws.send_json({"type": "audio", "data": base64.b64encode(b"\x00" * 640).decode()})
        ws.send_json({"type": "video", "data": base64.b64encode(b"jpegbytes").decode()})
        ws.send_json({"type": "advise"})
        ws.send_json({"type": "audio", "data": "!!!notbase64"})  # ignored, must not crash
        drain(ws)
    kinds = [list(k)[0] for k in s.sent]
    assert "audio" in kinds and "video" in kinds
    assert any(k.get("text") == ADVISE_PROMPT for k in s.sent)
    assert s.sent[kinds.index("audio")]["audio"].mime_type == "audio/pcm;rate=16000"


def test_tap_to_fix_overrides_and_validates(monkeypatch):
    s = FakeSession()
    use(monkeypatch, s)
    with TestClient(main.app).websocket_connect("/ws/live") as ws:
        collect_until(ws, lambda m: m["type"] == "status" and m["status"] == "live")
        ws.send_json({"type": "set", "field": "hero_cards", "value": ["Qh", "Kd"]})
        ws.send_json({"type": "set", "field": "pot", "value": 80})
        ws.send_json({"type": "set", "field": "board_cards", "value": ["Qh", "7c", "2d"]})  # clashes with hero
        out = drain(ws)
        assert any(m["type"] == "notice" for m in out)
        last = [m for m in out if m["type"] == "state"][-1]["state"]
        assert last["pot"] == 80 and last["hero_cards"] == ["Qh", "Kd"] and last["board_cards"] == []
        ws.send_json({"type": "new_hand"})
        st = collect_until(ws, lambda m: m["type"] == "state")[-1]["state"]
        assert st["hero_cards"] == [] and st["hand_number"] == 2


def test_get_decision_facts_returns_math_to_model(monkeypatch):
    s = FakeSession()
    use(monkeypatch, s)
    with TestClient(main.app).websocket_connect("/ws/live") as ws:
        collect_until(ws, lambda m: m["type"] == "status" and m["status"] == "live")
        ws.send_json({"type": "set", "field": "hero_cards", "value": ["As", "Ah"]})
        ws.send_json({"type": "set", "field": "pot", "value": 100})
        ws.send_json({"type": "set", "field": "to_call", "value": 50})
        drain(ws)
        s.push(tool("get_decision_facts", {}), sc(turn_complete=True))
        drain(ws)
    res = s.tool_responses[0].response["result"]
    assert res["ok"] and res["required_equity_pct"] == 33.3 and res["equity_pct"] > 75
    assert s.tool_responses[0].scheduling is None  # blocking tool: no scheduling hint


def test_reconnect_resumes_with_handle(monkeypatch):
    s1 = FakeSession()
    s1.push(handle_msg("handle-123"), ConnectionError("socket dropped"))
    s2 = FakeSession()
    fc = use(monkeypatch, s1, s2)
    with TestClient(main.app).websocket_connect("/ws/live") as ws:
        collect_until(ws, lambda m: m["type"] == "status" and m["status"] == "reconnecting")
        collect_until(ws, lambda m: m["type"] == "status" and m["status"] == "live")
    assert len(fc.configs) == 2
    assert fc.configs[0].session_resumption.handle is None
    assert fc.configs[1].session_resumption.handle == "handle-123"


def test_missing_gemini_key_reports_fatal_error(monkeypatch):
    def boom():
        raise GeminiConfigError("GEMINI_API_KEY is not set")
    monkeypatch.setattr(live_relay, "get_live_client", boom)
    with TestClient(main.app).websocket_connect("/ws/live") as ws:
        m = collect_until(ws, lambda m: m["type"] == "error")[-1]
        assert m["fatal"] and "GEMINI_API_KEY" in m["message"]


def refused(client, url, **kw):
    """Connection is accepted then closed with a code the browser can read."""
    with client.websocket_connect(url, **kw) as ws:
        with pytest.raises(WebSocketDisconnect) as e:
            ws.receive_json()
    return e.value.code


def test_passcode_origin_and_capacity(monkeypatch):
    use(monkeypatch, FakeSession(), FakeSession())
    monkeypatch.setenv("DEMO_PASSCODE", "letmein")
    c = TestClient(main.app)
    assert refused(c, "/ws/live") == 1008
    assert refused(c, "/ws/live?code=wrong") == 1008
    with c.websocket_connect("/ws/live?code=letmein") as ws:
        collect_until(ws, lambda m: m["type"] == "status")
    monkeypatch.delenv("DEMO_PASSCODE")
    assert refused(c, "/ws/live", headers={"origin": "https://evil.example"}) == 1008
    monkeypatch.setattr(main, "_live_active", main.MAX_LIVE_SESSIONS)
    assert refused(c, "/ws/live") == 1013


def test_config_builds_for_all_modes():
    for ptt in (False, True):
        for pro in (False, True):
            cfg = live_relay.build_config("h", ptt=ptt, proactive=pro)
            assert cfg.response_modalities and cfg.tools
            assert (cfg.realtime_input_config.automatic_activity_detection.disabled is True) == ptt
