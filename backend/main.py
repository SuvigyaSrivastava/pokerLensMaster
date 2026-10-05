import base64
import os
import re
import time
import uuid
from collections import defaultdict, deque
from typing import Any, Deque, Dict, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

from cards import known  # noqa: E402
from coach import get_coaching  # noqa: E402
from equity import calculate_equity  # noqa: E402
from gemini_client import GeminiConfigError  # noqa: E402
from tracker import SessionStore  # noqa: E402
from tts import synthesize_speech  # noqa: E402
from vision import detect_cards  # noqa: E402

app = FastAPI(title="PokerLens API", version="1.1.0")

# Comma-separated list, e.g. "https://pokerlens.vercel.app,http://localhost:5173"
_origins = [
    o.strip()
    for o in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173",
    ).split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=False,  # no cookies/auth used; wildcard + credentials is invalid anyway
    allow_methods=["*"],
    allow_headers=["*"],
)

store = SessionStore()

MAX_IMAGE_CHARS = 8_000_000  # ~6 MB of base64
MAX_TTS_CHARS = 600
_SID_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")

# --- tiny in-memory sliding-window rate limiter (per client IP) ---
_hits: Dict[str, Deque[float]] = defaultdict(deque)


def rate_limit(request: Request, bucket: str, limit: int, window: float = 60.0) -> None:
    ip = request.client.host if request.client else "unknown"
    q = _hits[f"{bucket}:{ip}"]
    now = time.monotonic()
    while q and now - q[0] > window:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(status_code=429, detail="Too many requests, slow down.")
    q.append(now)


class AnalyzeRequest(BaseModel):
    image_b64: str
    question: Optional[str] = Field(default="", max_length=500)
    session_id: Optional[str] = ""
    is_live: Optional[bool] = False
    last_cards: Optional[Dict[str, Any]] = None  # deprecated: state is tracked server-side
    opponents: int = Field(default=1, ge=1, le=8)
    voice_engine: Optional[str] = "browser"  # 'browser' | 'elevenlabs' | 'sarvam'
    voice_api_key: Optional[str] = None
    voice_id: Optional[str] = None


class TTSRequest(BaseModel):
    text: str = Field(max_length=MAX_TTS_CHARS)
    engine: Optional[str] = "browser"
    api_key: Optional[str] = None
    voice_id: Optional[str] = None


class ResetRequest(BaseModel):
    session_id: str


def _session_id(raw: Optional[str]) -> str:
    raw = (raw or "").strip()
    if not raw:
        return str(uuid.uuid4())
    if not _SID_RE.match(raw):
        raise HTTPException(status_code=400, detail="Invalid session_id")
    return raw


def _equity(cards: dict, opponents: int) -> float:
    from treys import Card

    hero = [Card.new(c) for c in known(cards.get("hero_cards", []))]
    board = [Card.new(c) for c in known(cards.get("board_cards", []))]
    if len(hero) != 2:
        return 50.0
    return calculate_equity(hero, board, opponents=opponents)


@app.get("/health")
def health():
    return {"status": "ok", "service": "PokerLens API"}


# Plain `def` (not async): the work below is blocking (Gemini, Monte Carlo,
# TTS HTTP), so FastAPI runs it in a worker thread instead of freezing the loop.
@app.post("/analyze")
def analyze(req: AnalyzeRequest, request: Request):
    rate_limit(request, "analyze", limit=60)

    if not req.image_b64 or not req.image_b64.strip():
        raise HTTPException(status_code=400, detail="Image data is required")
    if len(req.image_b64) > MAX_IMAGE_CHARS:
        raise HTTPException(status_code=413, detail="Image too large")

    sid = _session_id(req.session_id)
    session = store.get(sid)

    # Step 1: read the cards
    try:
        cards = detect_cards(req.image_b64)
    except GeminiConfigError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=f"Card detection failed: {e}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Vision service error: {e}")

    # Step 2: debounced change detection (server-side state)
    state_changed, transition = session.update(cards, live=bool(req.is_live))

    # Step 3: equity (cheap, always returned so the meter stays live)
    equity = _equity(cards, req.opponents)

    has_question = bool(req.question and req.question.strip())
    hero_ready = session.hero_ready(cards)

    # Live mode: stay silent unless something meaningful changed (or user asked)
    if req.is_live and not has_question and not (state_changed and hero_ready):
        return {
            "session_id": sid,
            "state_changed": False,
            "transition": None,
            "cards": cards,
            "equity": equity,
            "advice": None,
            "audio_base64": None,
            "history": session.history[-10:],
        }

    # Step 4: coaching
    try:
        advice = get_coaching(
            cards=cards,
            equity=equity,
            question=req.question or "What should I do?",
            history=session.history,
            transition=transition,
            opponents=req.opponents,
        )
    except GeminiConfigError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Coaching failed: {e}")

    # Step 5: optional ElevenLabs / Sarvam synthesis
    audio_b64 = None
    voice_error = None
    if req.voice_engine and req.voice_engine.lower() in ("elevenlabs", "sarvam"):
        raw_audio, mime, err = synthesize_speech(
            text=advice,
            engine=req.voice_engine,
            api_key=req.voice_api_key,
            voice_id=req.voice_id,
        )
        if raw_audio:
            audio_b64 = f"data:{mime};base64," + base64.b64encode(raw_audio).decode("utf-8")
        elif err:
            voice_error = err

    # Step 6: record the hand (only when advice was actually generated)
    hand_number = session.next_hand_number()
    session.add_hand(
        {
            "hand": hand_number,
            "hero": cards.get("hero_cards", []),
            "board": cards.get("board_cards", []),
            "street": cards.get("street", "unknown"),
            "equity": equity,
            "advice_preview": advice[:80] + ("..." if len(advice) > 80 else ""),
        }
    )

    return {
        "session_id": sid,
        "hand_number": hand_number,
        "state_changed": True,
        "transition": transition,
        "cards": cards,
        "equity": equity,
        "advice": advice,
        "audio_base64": audio_b64,
        "voice_error": voice_error,
        "history": session.history[-10:],
    }


@app.post("/tts")
def tts_endpoint(req: TTSRequest, request: Request):
    """Synthesize speech using ElevenLabs or Sarvam AI (rate limited, length capped)."""
    rate_limit(request, "tts", limit=20)
    raw_audio, mime, err = synthesize_speech(
        text=req.text,
        engine=req.engine or "browser",
        api_key=req.api_key,
        voice_id=req.voice_id,
    )
    if raw_audio:
        b64 = f"data:{mime};base64," + base64.b64encode(raw_audio).decode("utf-8")
        return {"status": "ok", "audio_base64": b64, "mime": mime}
    return {"status": "fallback_browser", "error": err}


@app.post("/reset")
def reset(req: ResetRequest):
    session = store.peek(req.session_id)
    if session:
        session.clear()
    return {"status": "cleared", "session_id": req.session_id}


@app.get("/history/{session_id}")
def get_history(session_id: str):
    session = store.peek(session_id)
    return {"history": session.history if session else []}
