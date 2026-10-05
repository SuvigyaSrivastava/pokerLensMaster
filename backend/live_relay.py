"""
Browser <-> Gemini Live relay.

The browser streams mic audio (16 kHz PCM) and camera frames (JPEG) over a WebSocket.
We forward them to Gemini Live, execute the model's tool calls against the
authoritative GameState, and stream the coach's voice, transcripts and the table
state back to the browser. Handles session resumption / GoAway reconnects so a
demo never dies at the 2-/10-minute limits.
"""
from __future__ import annotations

import asyncio
import base64
import binascii
import json
import logging
import os
import time
from typing import Any, Dict, Optional

from fastapi import WebSocket
from google.genai import types

from game_state import GameState
from gemini_client import GeminiConfigError, get_live_client, live_model_name

log = logging.getLogger("pokerlens.live")

MAX_AUDIO_CHUNK = 64 * 1024
MAX_VIDEO_FRAME = 1_500_000
IDLE_TIMEOUT = 90.0  # browser sends audio/video/ping every second; silence = dead tab
MAX_SESSION_SECONDS = int(os.getenv("LIVE_MAX_SECONDS", "1800"))

GREETING_PROMPT = "Say exactly this and nothing else: 'Coach online. Show me your cards.'"
SCAN_NUDGE = (
    "[TABLE CHANGED] Check the camera now. If new hole cards or board cards are clearly visible and differ "
    "from what you have recorded, record them with the tools. If nothing new is visible, do nothing."
)
SCAN_MIN_INTERVAL = 3.0
ADVISE_PROMPT = (
    "[PLAYER PRESSED ADVISE] It is my turn to act. Call get_decision_facts, then give your "
    "recommendation in at most two short sentences."
)

SYSTEM_PROMPT = """You are PokerLens, a hands-free poker coach at a PHYSICAL Texas Hold'em table. You receive live video from the player's camera and live audio of the whole table (the player and other people). You speak to the player through an earbud.

YOUR JOB: keep an accurate record of the hand by calling tools, and give short, decisive advice ONLY when the player asks or presses Advise.

SILENT BY DEFAULT
- Table chatter, banter, other people talking, chips, shuffling: stay completely silent. Never respond to conversation that is not addressed to you.
- You speak only when: (a) the player says "coach" or asks you a poker question, (b) a message says [PLAYER PRESSED ADVISE], (c) you confirm hole cards or ask the player to show them again, (d) hole-card tool errors need the player's help.
- Never narrate what you see unless asked. Never describe your tools. Never say what you just recorded, except the hole-card read-back.
- Messages starting with [TABLE CHANGED] are background checks: just call the tools if there is something new to record. Keep any spoken reply to them minimal.
- Always speak and respond in English.
- After set_board, record_action, set_pot, set_to_call, set_opponents or new_hand: produce NO speech.

SEEING CARDS
- Hole cards: the player holds two cards up to the camera for a moment. When you can read BOTH clearly, call set_hero_cards, then confirm in one short sentence ("Queen of hearts, king of diamonds."). If you cannot read them clearly, say "Show me again." Never guess a card.
- Board: when community cards appear (3 flop, then 1 turn, then 1 river), call set_board with ALL board cards so far. Stay silent after a board update unless asked. Only report cards you can clearly read; a partly hidden card means wait.
- Notation: rank 2-9, T, J, Q, K, A + suit h, d, s, c. Example: "Th".
- When a new hand starts (new hole cards shown, board cleared), call new_hand first.

HEARING BETS
- Whenever you clearly hear a bet, raise, call, check or fold, call record_action(actor, action, amount). actor is "hero" for the player; for others use the seat/name if said, otherwise "opponent".
- For bet, raise and allin, amount is the TOTAL bet size on this street ("raises to 40" -> 40, "bets 40" -> 40). Ignore amount for call, check and fold.
- If someone states the pot or the amount to call, call set_pot / set_to_call. The pot includes bets already made this street. If you hear how many opponents are still in, call set_opponents.
- Never invent amounts. If unsure, do not record it.

GIVING ADVICE
- Before ANY recommendation, ALWAYS call get_decision_facts and base your answer only on its result (equity, pot odds, required equity, outs, verdict_hint). Its state is the truth; your memory may be stale.
- Reply in at most two short, decisive sentences: first the action (fold / call / raise / bet / check, with a size if betting), then the one number that matters. Example: "Call. Thirty-six percent equity, you need twenty-five."
- Equity is against random hands; only mention that if asked why.
- If hero cards are unknown, say so and ask the player to show them.
- If the numbers look off, ask the player to confirm the pot and the amount to call.

MEMORY
- If the player asks about an earlier hand this session ("what did I have last hand?", "how did the last one go?"), call get_hand_history and answer from its result in one or two short sentences. Never guess past hands from memory.

STYLE: calm, quick, confident, plain English. Never say you are an AI. Never read the whole state aloud unless asked."""


def _obj(props: Dict[str, Any], required=None) -> Dict[str, Any]:
    d: Dict[str, Any] = {"type": "OBJECT", "properties": props}
    if required:
        d["required"] = required
    return d


_STR, _NUM, _INT = {"type": "STRING"}, {"type": "NUMBER"}, {"type": "INTEGER"}
_CARDS = {"type": "ARRAY", "items": {"type": "STRING"}}

TOOL_DECLARATIONS = [
    {"name": "set_hero_cards", "behavior": "NON_BLOCKING",
     "description": "Record the player's two hole cards once both are clearly readable, e.g. ['Qh','Kd'].",
     "parameters": _obj({"cards": {**_CARDS, "description": "Exactly two cards"}}, ["cards"])},
    {"name": "set_board", "behavior": "NON_BLOCKING",
     "description": "Record ALL community cards currently on the table (3, 4 or 5 cards), e.g. ['7c','2d','9s'].",
     "parameters": _obj({"cards": {**_CARDS, "description": "All board cards so far"}}, ["cards"])},
    {"name": "record_action", "behavior": "NON_BLOCKING",
     "description": "Record a betting action you clearly heard. amount = TOTAL bet size on this street for bet/raise/allin.",
     "parameters": _obj({
         "actor": {**_STR, "description": "'hero' for the player, else seat/name or 'opponent'"},
         "action": {**_STR, "description": "fold | check | call | bet | raise | allin"},
         "amount": {**_NUM, "description": "Total bet size on this street (bet/raise/allin only)"},
     }, ["actor", "action"])},
    {"name": "set_pot", "behavior": "NON_BLOCKING",
     "description": "Set the current pot size when someone states it. The pot is the TOTAL chips in the middle, INCLUDING bets already made this street.",
     "parameters": _obj({"amount": _NUM}, ["amount"])},
    {"name": "set_to_call", "behavior": "NON_BLOCKING",
     "description": "Set how many chips the player must put in to call, when stated.",
     "parameters": _obj({"amount": _NUM}, ["amount"])},
    {"name": "set_opponents", "behavior": "NON_BLOCKING",
     "description": "Set how many opponents are still in the hand.",
     "parameters": _obj({"count": _INT}, ["count"])},
    {"name": "new_hand", "behavior": "NON_BLOCKING",
     "description": "Reset for a new hand (new hole cards will be shown, board cleared).",
     "parameters": _obj({})},
    {"name": "get_decision_facts",
     "description": "Get authoritative equity, pot odds, outs and a verdict hint. Call before any advice.",
     "parameters": _obj({})},
    {"name": "get_hand_history",
     "description": "Get the earlier hands of this session (hole cards, board, pot, actions). Call only when the player asks about a past hand.",
     "parameters": _obj({})},
]

TOOL_DISPATCH = {
    "set_hero_cards": lambda s, a: s.set_hero_cards(a.get("cards")),
    "set_board": lambda s, a: s.set_board(a.get("cards")),
    "record_action": lambda s, a: s.record_action(a.get("actor"), a.get("action"), a.get("amount")),
    "set_pot": lambda s, a: s.set_pot(a.get("amount")),
    "set_to_call": lambda s, a: s.set_to_call(a.get("amount")),
    "set_opponents": lambda s, a: s.set_opponents(a.get("count")),
    "new_hand": lambda s, a: s.new_hand(),
    "get_decision_facts": lambda s, a: s.decision_facts(),
    "get_hand_history": lambda s, a: s.recall(),
}
BLOCKING = {"get_decision_facts", "get_hand_history"}  # the model waits for these before it speaks
STATE_CHANGING = set(TOOL_DISPATCH) - BLOCKING
# how the model should react once a non-blocking tool finishes
SCHEDULING_OK = {"set_hero_cards": "WHEN_IDLE"}  # speak the read-back; everything else stays silent
SCHEDULING_ERR = {"set_hero_cards": "WHEN_IDLE"}


def run_tool(state: GameState, name: str, args: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    fn = TOOL_DISPATCH.get(name)
    if not fn:
        return {"ok": False, "error": f"unknown tool {name}"}
    try:
        return fn(state, args or {})
    except Exception as e:  # never let a malformed tool call kill the session
        log.exception("tool %s failed", name)
        return {"ok": False, "error": f"tool failed: {e}"}


def build_config(handle: Optional[str] = None, ptt: bool = False, proactive: bool = True) -> types.LiveConnectConfig:
    aad = (
        types.AutomaticActivityDetection(disabled=True)
        if ptt
        else types.AutomaticActivityDetection(silence_duration_ms=600, prefix_padding_ms=120)
    )
    kwargs: Dict[str, Any] = dict(
        response_modalities=["AUDIO"],
        system_instruction=SYSTEM_PROMPT,
        tools=[{"function_declarations": TOOL_DECLARATIONS}],
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
        realtime_input_config=types.RealtimeInputConfig(automatic_activity_detection=aad),
        context_window_compression=types.ContextWindowCompressionConfig(
            trigger_tokens=int(os.getenv("LIVE_COMPRESS_TRIGGER", "32000")),
            sliding_window=types.SlidingWindow(target_tokens=int(os.getenv("LIVE_COMPRESS_TARGET", "16000"))),
        ),
        session_resumption=types.SessionResumptionConfig(handle=handle),
    )
    if proactive and not ptt:
        kwargs["proactivity"] = types.ProactivityConfig(proactive_audio=True)
    # gemini-3.8-live rejects thinking_level; LIVE_THINKING_BUDGET (int) is optional and off by default.
    budget = os.getenv("LIVE_THINKING_BUDGET")
    if budget not in (None, ""):
        kwargs["thinking_config"] = types.ThinkingConfig(thinking_budget=int(budget))
    voice = os.getenv("LIVE_VOICE")
    if voice:
        kwargs["speech_config"] = types.SpeechConfig(
            voice_config=types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice))
        )
    return types.LiveConnectConfig(**kwargs)


_FATAL_HINTS = ("api key", "api_key", "permission_denied", "unauthenticated", "not found", "is not supported", "401", "403")


class LiveRelay:
    def __init__(self, ws: WebSocket, ptt: bool = False, resume: bool = False) -> None:
        self.ws = ws
        self.ptt = ptt
        self.resume = resume  # the browser is reconnecting mid-game: no greeting, it will send its snapshot
        self.state = GameState()
        self.handle: Optional[str] = None
        self.session = None
        self.proactive = os.getenv("LIVE_PROACTIVE", "0") == "1"  # needs LIVE_API_VERSION=v1alpha
        self.closed = False
        self.inbound: "asyncio.Queue[tuple]" = asyncio.Queue(maxsize=96)
        self._send_lock = asyncio.Lock()
        self._facts_task: Optional[asyncio.Task] = None
        self._last_client_msg = time.monotonic()
        self._last_scan = 0.0
        self._coach_buf = ""  # coach transcript held back until audio proves the model actually spoke
        self._turn_spoke = False
        self._scan_gate = False      # True while answering a background scan: its speech is muted
        self._allow_speech = False   # ...unless hole cards were just recorded (read-back)
        self._started = time.monotonic()
        self.stats = {"audio_in": 0, "video_in": 0, "audio_out": 0, "tool_calls": 0, "reconnects": 0}

    # ---------------- to browser ----------------
    async def send(self, obj: Dict[str, Any]) -> None:
        if self.closed:
            return
        try:
            async with self._send_lock:
                await self.ws.send_json(obj)
        except Exception:
            self.closed = True

    async def send_state(self) -> None:
        await self.send({"type": "state", "state": self.state.snapshot()})
        self.schedule_facts()

    def schedule_facts(self) -> None:
        """Debounced background equity computation so the UI meter is always live."""
        if self._facts_task and not self._facts_task.done():
            self._facts_task.cancel()
        self._facts_task = asyncio.create_task(self._facts())

    async def _facts(self) -> None:
        try:
            await asyncio.sleep(0.2)
            if len(self.state.hero) != 2:
                await self.send({"type": "facts", "facts": None})
                return
            facts = await asyncio.to_thread(self.state.decision_facts, 1500)
            await self.send({"type": "facts", "facts": facts if facts.get("ok") else None})
        except asyncio.CancelledError:
            pass
        except Exception:
            log.exception("facts task failed")

    # ---------------- from browser ----------------
    def _enqueue(self, kind: str, payload: Any) -> None:
        try:
            self.inbound.put_nowait((kind, payload))
        except asyncio.QueueFull:
            if kind == "video":
                return  # drop the frame, keep the audio flowing
            try:
                self.inbound.get_nowait()
                self.inbound.put_nowait((kind, payload))
            except Exception:
                pass

    def _drain_inbound(self) -> None:
        while not self.inbound.empty():
            try:
                self.inbound.get_nowait()
            except Exception:
                break

    async def handle_client(self, msg: Dict[str, Any]) -> None:
        t = msg.get("type")
        if t in ("audio", "video"):
            try:
                raw = base64.b64decode(msg.get("data", ""), validate=False)
            except (binascii.Error, ValueError):
                return
            if not raw or len(raw) > (MAX_AUDIO_CHUNK if t == "audio" else MAX_VIDEO_FRAME):
                return
            self.stats[f"{t}_in"] += 1
            self._enqueue(t, raw)
        elif t == "text":
            text = str(msg.get("text", ""))[:500].strip()
            if text:
                self._enqueue("text", text)
        elif t in ("scene", "scan"):
            now = time.monotonic()
            if t == "scan" or now - self._last_scan >= SCAN_MIN_INTERVAL:
                self._last_scan = now
                self._enqueue("text", SCAN_NUDGE)
        elif t == "advise":
            self._enqueue("text", ADVISE_PROMPT)
        elif t == "activity":
            if msg.get("state") in ("start", "end"):
                self._enqueue("activity", msg["state"])
        elif t == "set":
            await self.apply_manual(msg.get("field"), msg.get("value"))
        elif t == "new_hand":
            self.state.new_hand()
            await self.send_state()
        elif t == "restore":
            res = self.state.restore(msg.get("state"))
            if not res.get("ok"):
                await self.send({"type": "notice", "message": res.get("error", "Could not restore the hand.")})
            await self.send_state()
        elif t == "set_blinds":
            res = self.state.set_blinds(msg.get("small"), msg.get("big"))
            if not res["ok"]:
                await self.send({"type": "notice", "message": res["error"]})
            await self.send_state()
        elif t == "ping":
            await self.send({"type": "pong"})

    async def apply_manual(self, field: Any, value: Any) -> None:
        """Tap-to-fix from the UI: the human always wins over the model."""
        ops = {
            "hero_cards": self.state.set_hero_cards,
            "board_cards": self.state.set_board,
            "pot": self.state.set_pot,
            "to_call": self.state.set_to_call,
            "opponents": self.state.set_opponents,
        }
        fn = ops.get(field)
        if not fn:
            return
        res = fn(value)
        if not res.get("ok"):
            await self.send({"type": "notice", "message": res.get("error", "Invalid value")})
        await self.send_state()

    async def browser_loop(self) -> None:
        try:
            while not self.closed:
                raw = await self.ws.receive_text()
                self._last_client_msg = time.monotonic()
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if isinstance(msg, dict):
                    await self.handle_client(msg)
        except Exception:
            pass  # disconnect / bad frame -> shut down
        finally:
            self.closed = True
            self._enqueue("_close", None)

    # ---------------- to Gemini ----------------
    async def forward_loop(self, session) -> None:
        while True:
            kind, payload = await self.inbound.get()
            if kind == "_close":
                return
            if kind == "audio":
                await session.send_realtime_input(audio=types.Blob(data=payload, mime_type="audio/pcm;rate=16000"))
            elif kind == "video":
                await session.send_realtime_input(video=types.Blob(data=payload, mime_type="image/jpeg"))
            elif kind == "text":
                if payload == SCAN_NUDGE:
                    self._scan_gate, self._allow_speech = True, False
                await session.send_realtime_input(text=payload)
            elif kind == "activity":
                if payload == "start":
                    await session.send_realtime_input(activity_start=types.ActivityStart())
                else:
                    await session.send_realtime_input(activity_end=types.ActivityEnd())

    async def gemini_loop(self, session) -> None:
        idle_turns = 0
        while True:
            got = False
            async for msg in session.receive():
                got = True
                await self.on_server_message(session, msg)
            idle_turns = 0 if got else idle_turns + 1
            if idle_turns > 50:
                raise ConnectionError("Gemini stream ended")
            await asyncio.sleep(0)

    async def on_server_message(self, session, msg) -> None:
        upd = getattr(msg, "session_resumption_update", None)
        if upd and upd.resumable and upd.new_handle:
            self.handle = upd.new_handle

        if getattr(msg, "go_away", None):
            log.info("GoAway received (time_left=%s)", msg.go_away.time_left)
            await self.send({"type": "status", "status": "reconnecting"})

        tc = getattr(msg, "tool_call", None)
        if tc and tc.function_calls:
            await self.handle_tool_calls(session, tc.function_calls)

        sc = getattr(msg, "server_content", None)
        if not sc:
            return
        if sc.model_turn and sc.model_turn.parts:
            for part in sc.model_turn.parts:
                inline = getattr(part, "inline_data", None)
                if inline and inline.data:
                    if self._scan_gate and not self._allow_speech:
                        continue  # background scan: never speak unless reading back hole cards
                    self.stats["audio_out"] += 1
                    if not self._turn_spoke:
                        self._turn_spoke = True
                        if self._coach_buf:
                            await self.send({"type": "transcript", "role": "coach", "text": self._coach_buf})
                            self._coach_buf = ""
                    await self.send({"type": "audio", "data": base64.b64encode(inline.data).decode("ascii"), "rate": 24000})
        if sc.input_transcription and sc.input_transcription.text:
            self._scan_gate = False  # the player is talking: this is a real conversation turn
            await self.send({"type": "transcript", "role": "user", "text": sc.input_transcription.text})
        if sc.output_transcription and sc.output_transcription.text:
            if self._turn_spoke:
                await self.send({"type": "transcript", "role": "coach", "text": sc.output_transcription.text})
            else:
                self._coach_buf += sc.output_transcription.text
        if sc.interrupted:
            await self.send({"type": "interrupted"})
        if sc.turn_complete:
            self._turn_spoke, self._coach_buf = False, ""
            self._scan_gate = self._allow_speech = False
            await self.send({"type": "turn_complete"})

    async def handle_tool_calls(self, session, calls) -> None:
        responses = []
        changed = False
        for fc in calls:
            self.stats["tool_calls"] += 1
            name, args = fc.name, dict(fc.args or {})
            t0 = time.perf_counter()
            if name in BLOCKING:
                result = await asyncio.to_thread(run_tool, self.state, name, args)
                payload: Dict[str, Any] = {"result": result}
                resp = types.FunctionResponse(id=fc.id, name=name, response=payload)
            else:
                result = run_tool(self.state, name, args)
                changed = changed or (name in STATE_CHANGING and result.get("ok", False))
                if name == "set_hero_cards" and result.get("ok"):
                    self._allow_speech = True
                sched = (SCHEDULING_OK if result.get("ok") else SCHEDULING_ERR).get(name, "SILENT")
                resp = types.FunctionResponse(
                    id=fc.id, name=name, response={"result": result},
                    scheduling=types.FunctionResponseScheduling[sched],
                )
            log.info("tool %s(%s) -> ok=%s", name, args, result.get("ok"))
            await self.send({"type": "tool", "name": name, "args": args, "ok": bool(result.get("ok")),
                             "error": result.get("error"), "ms": round((time.perf_counter() - t0) * 1000, 1)})
            responses.append(resp)
        await session.send_tool_response(function_responses=responses)
        if changed:
            await self.send_state()

    # ---------------- lifecycle ----------------
    async def watchdog(self) -> None:
        while not self.closed:
            await asyncio.sleep(5)
            now = time.monotonic()
            if now - self._last_client_msg > IDLE_TIMEOUT:
                await self.send({"type": "error", "message": "Connection idle, closing."})
                break
            if now - self._started > MAX_SESSION_SECONDS:
                await self.send({"type": "error", "message": "Session time limit reached.", "retry": False})
                break
        self.closed = True
        self._enqueue("_close", None)

    async def run(self) -> None:
        try:
            client = get_live_client()
        except GeminiConfigError as e:
            await self.send({"type": "error", "message": str(e), "fatal": True})
            return

        reader = asyncio.create_task(self.browser_loop())
        dog = asyncio.create_task(self.watchdog())
        failures, first = 0, True
        try:
            while not self.closed:
                await self.send({"type": "status", "status": "connecting" if first else "reconnecting"})
                try:
                    async with client.aio.live.connect(
                        model=live_model_name(), config=build_config(self.handle, self.ptt, self.proactive)
                    ) as session:
                        failures = 0
                        self.session = session
                        self._drain_inbound()
                        await self.send({"type": "status", "status": "live"})
                        await self.send_state()
                        if first and not self.resume:
                            await session.send_realtime_input(text=GREETING_PROMPT)
                        first = False
                        tasks = {
                            asyncio.create_task(self.forward_loop(session)),
                            asyncio.create_task(self.gemini_loop(session)),
                        }
                        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                        for p in pending:
                            p.cancel()
                        await asyncio.gather(*pending, return_exceptions=True)
                        for d in done:
                            if not d.cancelled() and d.exception():
                                raise d.exception()
                except asyncio.CancelledError:
                    raise
                except Exception as e:
                    if self.closed:
                        break
                    msg = str(e)
                    failures += 1
                    self.stats["reconnects"] += 1
                    log.warning("live session error (%d): %s", failures, msg[:300])
                    low = msg.lower()
                    if self.proactive and failures == 1 and ("proactiv" in low or "invalid argument" in low or "1007" in low):
                        self.proactive = False  # model/API doesn't accept proactive audio: retry plain
                        continue
                    if any(h in low for h in _FATAL_HINTS) and self.handle is None:
                        await self.send({"type": "error", "message": f"Gemini rejected the connection: {msg[:200]}", "fatal": True})
                        break
                    if failures >= 4:
                        await self.send({"type": "error", "message": "Lost connection to Gemini. Please restart.", "fatal": True})
                        break
                    await asyncio.sleep(min(2 * failures, 6))
        finally:
            self.closed = True
            for t in (reader, dog, self._facts_task):
                if t and not t.done():
                    t.cancel()
            await self.send({"type": "status", "status": "closed"})
            log.info("live session ended: %s", self.stats)
