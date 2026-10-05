"""
End-to-end check of the Live coach against the REAL Gemini Live API.

  python scripts/live_e2e.py [--vision] [--audio] [--proactive]

Uses the production config/tools from live_relay.py. Scenarios:
  text   : greeting latency + tool calls + spoken advice
  vision : synthetic camera frame of two cards -> set_hero_cards
  audio  : real SPOKEN audio (ElevenLabs PCM): table chatter must stay silent,
           a bet announcement must be recorded silently, "Coach, ..." must get an answer.
"""
import asyncio
import io
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

import requests  # noqa: E402
from google.genai import types  # noqa: E402

from game_state import GameState  # noqa: E402
from gemini_client import get_live_client, live_model_name  # noqa: E402
from live_relay import SCAN_NUDGE, SCHEDULING_OK, build_config, run_tool  # noqa: E402


class Probe:
    def __init__(self, session, state):
        self.session, self.state = session, state
        self.events = []  # (t, kind, data)
        self.t0 = time.monotonic()
        self.task = asyncio.create_task(self._reader())

    def now(self):
        return round(time.monotonic() - self.t0, 2)

    async def _reader(self):
        try:
            while True:
                async for m in self.session.receive():
                    if m.tool_call:
                        rs = []
                        for fc in m.tool_call.function_calls:
                            res = run_tool(self.state, fc.name, dict(fc.args or {}))
                            self.events.append((self.now(), "tool", (fc.name, dict(fc.args or {}), res.get("ok"))))
                            kw = {}
                            if fc.name != "get_decision_facts":
                                kw["scheduling"] = types.FunctionResponseScheduling[SCHEDULING_OK.get(fc.name, "SILENT")]
                            rs.append(types.FunctionResponse(id=fc.id, name=fc.name, response={"result": res}, **kw))
                        await self.session.send_tool_response(function_responses=rs)
                    sc = m.server_content
                    if sc:
                        for p in (sc.model_turn.parts if sc.model_turn else []) or []:
                            if p.inline_data and p.inline_data.data:
                                self.events.append((self.now(), "audio", len(p.inline_data.data)))
                        if sc.input_transcription and sc.input_transcription.text:
                            self.events.append((self.now(), "heard", sc.input_transcription.text))
                        if sc.output_transcription and sc.output_transcription.text:
                            self.events.append((self.now(), "said", sc.output_transcription.text))
                await asyncio.sleep(0)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            self.events.append((self.now(), "error", repr(e)[:200]))

    def mark(self):
        return len(self.events)

    def since(self, mark):
        return self.events[mark:]

    async def settle(self, seconds, mark):
        """Wait up to `seconds`, but stop early once the model has gone quiet after speaking."""
        end = time.monotonic() + seconds
        last = None
        while time.monotonic() < end:
            await asyncio.sleep(0.4)
            ev = self.since(mark)
            if ev:
                last = ev[-1][0]
            if last is not None and any(k == "audio" for _, k, _ in ev) and self.now() - last > 2.0:
                break

    def summary(self, mark):
        ev = self.since(mark)
        audio = [t for t, k, _ in ev if k == "audio"]
        return {
            "first_audio_at": audio[0] if audio else None,
            "audio_chunks": len(audio),
            "tools": [(t, n, a, ok) for t, k, (n, a, ok) in [(e[0], e[1], e[2]) for e in ev if e[1] == "tool"]],
            "heard": "".join(d for _, k, d in ev if k == "heard").strip(),
            "said": "".join(d for _, k, d in ev if k == "said").strip(),
            "errors": [d for _, k, d in ev if k == "error"],
        }


def card_image(cards, w=520, h=220):
    from PIL import Image, ImageDraw, ImageFont

    img = Image.new("RGB", (w, h), (20, 90, 40))
    d = ImageDraw.Draw(img)
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 58)
    sym = {"h": "♥", "d": "♦", "s": "♠", "c": "♣"}
    for i, c in enumerate(cards):
        x = 20 + i * 100
        d.rounded_rectangle([x, 20, x + 90, 200], 10, fill="white", outline="black", width=2)
        col = (200, 0, 0) if c[1] in "hd" else (0, 0, 0)
        d.text((x + 12, 40), c[0].replace("T", "10"), fill=col, font=font)
        d.text((x + 12, 110), sym[c[1]], fill=col, font=font)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=85)
    return buf.getvalue()


def tts_pcm16k(text, voice=None):
    key = os.getenv("ELEVENLABS_API_KEY")
    voice = voice or os.getenv("ELEVENLABS_VOICE_ID", "JBFqnCBsd6RMkjVDRZzb")
    r = requests.post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=pcm_16000",
        headers={"xi-api-key": key, "Content-Type": "application/json"},
        json={"text": text, "model_id": "eleven_multilingual_v2"},
        timeout=30,
    )
    r.raise_for_status()
    return r.content


async def stream_pcm(session, pcm, tail_silence=1.6):
    """Send audio in real time (100 ms chunks), followed by silence so VAD ends the turn."""
    chunk = 3200
    for i in range(0, len(pcm), chunk):
        await session.send_realtime_input(audio=types.Blob(data=pcm[i:i + chunk], mime_type="audio/pcm;rate=16000"))
        await asyncio.sleep(0.1)
    for _ in range(int(tail_silence * 10)):
        await session.send_realtime_input(audio=types.Blob(data=b"\x00" * chunk, mime_type="audio/pcm;rate=16000"))
        await asyncio.sleep(0.1)


def show(label, s):
    print(f"\n[{label}]")
    for k, v in s.items():
        print(f"   {k}: {v}")


async def main():
    do_vision, do_audio = "--vision" in sys.argv, any(a.startswith("--audio") for a in sys.argv)
    only = [a for a in sys.argv if a.startswith("--audio=")]
    only_idx = int(only[0].split("=")[1]) if only else None
    skip_text = only_idx is not None
    proactive = "--proactive" in sys.argv
    client = get_live_client()
    print(f"model={live_model_name()} api={os.getenv('LIVE_API_VERSION', 'v1beta')} proactive={proactive}")
    state = GameState()
    async with client.aio.live.connect(model=live_model_name(), config=build_config(proactive=proactive)) as session:
        p = Probe(session, state)

        m = p.mark()
        if not skip_text:
            await session.send_realtime_input(text="Say exactly: Coach online.")
            await p.settle(10, m)
            show("greeting (text)", p.summary(m))

        m = p.mark()
        if not skip_text:
          await session.send_realtime_input(text="Coach, I'm holding the queen of hearts and king of diamonds. The pot is 100, 50 to call, two opponents. Record that and tell me what to do.")
          await p.settle(25, m)
          show("tools + spoken advice (text)", p.summary(m))

        if do_vision:
            for label, nudge in [("vision, frames ONLY (no text)", None),
                                 ("vision, frames + scene-changed nudge", SCAN_NUDGE)]:
                state.new_hand()
                m = p.mark()
                for i in range(5):
                    await session.send_realtime_input(video=types.Blob(data=card_image(["As", "Td"]), mime_type="image/jpeg"))
                    await asyncio.sleep(1)
                if nudge:
                    await session.send_realtime_input(text=nudge)
                await p.settle(12, m)
                show(label + " -> expect hero ['As','Td']", p.summary(m))
                print("   state hero:", state.hero)

        if "--vision2" in sys.argv:
            from PIL import Image
            nudge = SCAN_NUDGE
            buf = io.BytesIO(); Image.new("RGB", (520, 220), (20, 90, 40)).save(buf, "JPEG"); empty = buf.getvalue()
            for label, frame in [("EMPTY table + nudge -> expect SILENCE, no tools", empty),
                                 ("FLOP only + nudge -> expect set_board ['Kc','7s','2d']", card_image(["Kc", "7s", "2d"]))]:
                state.new_hand(); m = p.mark()
                for _ in range(3):
                    await session.send_realtime_input(video=types.Blob(data=frame, mime_type="image/jpeg")); await asyncio.sleep(1)
                await session.send_realtime_input(text=nudge)
                await p.settle(12, m)
                show(label, p.summary(m)); print("   state board/hero:", state.board, state.hero)

        if do_audio:
            state.new_hand()
            state.set_hero_cards(["Qh", "Kd"])
            state.set_board(["7c", "2d", "9s"])
            state.set_pot(100)
            scenarios = [
                ("audio: chatter (expect SILENCE)", "Hey did you guys watch the cricket match last night? That final over was unbelievable, I could not even sit down.", "silent"),
                ("audio: opponent bet (expect record_action, SILENCE)", "I bet fifty.", "tool-silent"),
                ("audio: question (expect tools + spoken answer)", "Coach, what should I do here?", "answer"),
            ]
            for idx, (label, text, expect) in enumerate(scenarios, 1):
                if only_idx and idx != only_idx:
                    continue
                pcm = await asyncio.to_thread(tts_pcm16k, text)
                m = p.mark()
                t_end = None
                await stream_pcm(session, pcm)
                await p.settle(14, m)
                s = p.summary(m)
                s["expect"] = expect
                show(label, s)
            print("   final state:", state.snapshot())
        p.task.cancel()


asyncio.run(main())
