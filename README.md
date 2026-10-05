# 🃏 PokerLens — Hands-Free AI Poker Coach for a Physical Table

Put your phone on a stand pointing at the table. PokerLens **watches the cards, hears the bets, and talks to you through an earbud** — in about a second, with no buttons required.

- **Live mode (new):** one streaming connection to **Gemini Live** carries your mic + camera in and the coach's voice out.
- **Snapshot mode (classic):** take a photo, get advice. Kept as a fallback.

## How it works

```
 phone browser ── mic 16 kHz PCM + camera JPEG (~1 fps) ──▶ FastAPI /ws/live ──▶ Gemini Live (gemini-3.8-live)
      ▲                                                          │   ▲
      └─── coach voice (24 kHz PCM) + transcript + table state ──┘   └─ tool calls: set_hero_cards, set_board,
                                                                       record_action, set_pot, get_decision_facts…
```

The design rule that makes it robust: **the LLM never owns the truth.** It *reports* what it sees and hears through tool calls; `game_state.py` validates each report (no duplicate cards, legal board sizes, pot math) and computes equity, pot odds and outs with a real Monte Carlo engine. If the model or the microphone gets something wrong, you tap the value on screen and the human wins.

Behaviours we tested against the real Live API:

| Situation | Result |
|---|---|
| Table chatter (spoken) | transcribed, coach stays silent |
| "I bet fifty." | recorded silently, pot updated |
| "Coach, what should I do?" | `get_decision_facts` → "Check. Forty-six percent equity." ≈1.2 s after you stop talking |
| Cards held to camera + scene-change check | read correctly, read back aloud |

Things worth knowing:

- **Video alone never makes the model speak or act**, so the browser detects when the scene changes and settles (~2 s) and sends a "scene" event; the backend turns that into a background check. Speech from those background checks is muted in code, except the hole-card read-back.
- Live sessions are capped at 2 min (audio+video) unless context compression + session resumption are on — both are enabled, and the relay reconnects transparently.
- Equity is vs **random hands** (1–8 opponents), a baseline rather than a read on real ranges.
- Many casinos/card rooms ban electronic assistance in real-money games. Use it for practice, demos and home games everyone agrees to.

## Tech stack

Python 3.11+, FastAPI + WebSockets, `google-genai` (Live API + vision), `treys`, React 18 + Vite + Tailwind, Web Audio (AudioWorklet), ElevenLabs / Sarvam / browser voice for Snapshot mode.

## Project structure

```
backend/
  main.py             FastAPI app: /ws/live, /analyze, /tts, CORS, rate limits
  live_relay.py       Browser <-> Gemini Live relay, tools, prompt, resumption
  game_state.py       Authoritative hand state + equity / pot odds / outs
  gemini_client.py    Lazy google-genai clients
  cards.py, equity.py, tracker.py, vision.py, coach.py, tts.py   (snapshot mode + helpers)
  scripts/live_e2e.py Real-API smoke test (text, vision, spoken audio)
  tests/              pytest suite (offline)
frontend/src/
  Root.jsx            Live / Snapshot tabs
  components/LiveTable.jsx   Live UI (camera, state panel, tap-to-fix, transcript)
  live/audio.js       Mic worklet (16 kHz PCM) + gapless player
  live/useLiveSession.js     WebSocket, frame sampling, scene-change detection
```

## Run locally

```bash
# backend
cd backend
python -m venv venv && . venv/bin/activate          # Windows: .\venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                  # add GEMINI_API_KEY (never commit it)
uvicorn main:app --reload --port 8000

# frontend (new terminal)
cd frontend && npm install && npm run dev            # http://localhost:5173
```

Allow camera + mic, press **Start Live Coach**, hold two cards up to the camera. **Earbuds are strongly recommended** (otherwise the mic pauses while the coach talks so it can't hear itself).

Tests (no API key needed): `pip install -r requirements-dev.txt && pytest`
Real-API check (needs a key): `python scripts/live_e2e.py --vision --audio=1`

## Test on your phone (HTTPS required for camera/mic)

1. **Render (backend)** — Web Service, root `backend`, build `pip install -r requirements.txt`, start `uvicorn main:app --host 0.0.0.0 --port $PORT`. Env vars: `GEMINI_API_KEY`, `ALLOWED_ORIGINS=https://<your-app>.vercel.app`, and recommended `DEMO_PASSCODE=<something>` (stops strangers spending your Gemini quota).
2. **Vercel (frontend)** — root `frontend`, Vite preset, env `VITE_API_URL=https://<your-render-app>.onrender.com`.
3. Open the Vercel URL on the phone in Chrome, enter the access code, press Start. The free Render tier takes ~30 s to wake.

## Configuration (backend/.env)

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | required |
| `GEMINI_MODEL` / `LIVE_MODEL` | snapshot model (`gemini-3.8-flash`) / live model (`gemini-3.8-live`) |
| `ALLOWED_ORIGINS` | comma-separated frontend origins (CORS + WebSocket origin check) |
| `DEMO_PASSCODE` | optional access code required by `/ws/live` |
| `MAX_LIVE_SESSIONS`, `LIVE_MAX_SECONDS` | concurrency and per-session cap |
| `LIVE_VOICE`, `LIVE_API_VERSION`, `LIVE_PROACTIVE` | optional voice name; alpha API + proactive audio |
| `ELEVENLABS_API_KEY`, `SARVAM_API_KEY` | Snapshot-mode voices |
