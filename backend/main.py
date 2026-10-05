from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from typing import Optional, Dict, List, Any, Tuple
import uuid
import base64

from vision import detect_cards
from equity import calculate_equity
from coach import get_coaching
from tts import synthesize_speech

load_dotenv()

app = FastAPI(title="PokerLens API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory session store: maps session_id -> list of hand summaries
sessions: Dict[str, List[Dict[str, Any]]] = {}

class AnalyzeRequest(BaseModel):
    image_b64: str
    question: Optional[str] = ""
    session_id: Optional[str] = ""
    is_live: Optional[bool] = False
    last_cards: Optional[Dict[str, Any]] = None
    voice_engine: Optional[str] = "browser"  # 'browser' | 'elevenlabs' | 'sarvam'
    voice_api_key: Optional[str] = None
    voice_id: Optional[str] = None

class TTSRequest(BaseModel):
    text: str
    engine: Optional[str] = "browser"
    api_key: Optional[str] = None
    voice_id: Optional[str] = None

class ResetRequest(BaseModel):
    session_id: str

def detect_transition(current: dict, previous: Optional[dict]) -> Tuple[bool, Optional[str]]:
    """
    Determines if a poker table transition occurred (e.g. hole cards dealt, flop, turn, river).
    """
    if not previous:
        hero = current.get("hero_cards", [])
        board = current.get("board_cards", [])
        if len(hero) == 2 and len(board) == 0:
            return True, "hero_dealt"
        elif len(board) == 3:
            return True, "flop_opened"
        elif len(board) == 4:
            return True, "turn_opened"
        elif len(board) == 5:
            return True, "river_opened"
        return True, "initial"

    prev_hero = sorted(previous.get("hero_cards", []))
    curr_hero = sorted(current.get("hero_cards", []))
    prev_board = sorted(previous.get("board_cards", []))
    curr_board = sorted(current.get("board_cards", []))

    # 1. New hand / Hero cards dealt
    if curr_hero and curr_hero != prev_hero:
        return True, "hero_dealt"

    # 2. Flop opened (0 -> 3 cards)
    if len(prev_board) < 3 and len(curr_board) >= 3:
        return True, "flop_opened"

    # 3. Turn card dealt (3 -> 4 cards)
    if len(prev_board) < 4 and len(curr_board) >= 4:
        return True, "turn_opened"

    # 4. River card dealt (4 -> 5 cards)
    if len(prev_board) < 5 and len(curr_board) >= 5:
        return True, "river_opened"

    # 5. Any board cards changed
    if curr_board != prev_board:
        return True, "board_updated"

    return False, None

@app.get("/health")
def health():
    return {"status": "ok", "service": "PokerLens API"}

@app.post("/analyze")
async def analyze(req: AnalyzeRequest):
    if not req.image_b64 or not req.image_b64.strip():
        raise HTTPException(status_code=400, detail="Image data is required")

    # Get or create session
    sid = req.session_id.strip() if req.session_id else str(uuid.uuid4())
    if sid not in sessions:
        sessions[sid] = []

    # Step 1: Detect cards from image
    try:
        cards = detect_cards(req.image_b64)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Card detection failed: {str(e)}")

    # Check for live state changes
    state_changed, transition = detect_transition(cards, req.last_cards)

    # Step 2: Calculate equity (never crash — fallback to 50.0)
    equity = 50.0
    try:
        from treys import Card
        hero_raw = cards.get("hero_cards", [])
        board_raw = cards.get("board_cards", [])

        hero_cards = []
        for c in hero_raw:
            if isinstance(c, str) and len(c) == 2 and "?" not in c:
                try:
                    formatted_card = c[0].upper() + c[1].lower()
                    hero_cards.append(Card.new(formatted_card))
                except Exception:
                    pass

        board_cards = []
        for c in board_raw:
            if isinstance(c, str) and len(c) == 2 and "?" not in c:
                try:
                    formatted_card = c[0].upper() + c[1].lower()
                    board_cards.append(Card.new(formatted_card))
                except Exception:
                    pass

        if len(hero_cards) == 2:
            equity = calculate_equity(hero_cards, board_cards)
    except Exception:
        equity = 50.0

    # In continuous live mode: if state hasn't changed and no user question, skip AI coach generation to save quota & voice silence
    has_question = bool(req.question and req.question.strip())
    if req.is_live and not state_changed and not has_question:
        return {
            "session_id": sid,
            "state_changed": False,
            "transition": None,
            "cards": cards,
            "equity": equity,
            "advice": None,
            "audio_base64": None,
            "history": sessions[sid][-10:]
        }

    # Step 3: Get coaching advice
    try:
        advice = get_coaching(
            cards=cards,
            equity=equity,
            question=req.question or "What should I do?",
            history=sessions[sid],
            transition=transition
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Coaching failed: {str(e)}")

    # Step 4: Optional ElevenLabs / Sarvam AI audio synthesis
    audio_b64 = None
    voice_error = None
    if req.voice_engine and req.voice_engine.lower() in ["elevenlabs", "sarvam"]:
        raw_audio, mime, err = synthesize_speech(
            text=advice,
            engine=req.voice_engine,
            api_key=req.voice_api_key,
            voice_id=req.voice_id
        )
        if raw_audio:
            audio_b64 = f"data:{mime};base64," + base64.b64encode(raw_audio).decode("utf-8")
        elif err:
            voice_error = err

    # Step 5: Store in session history (only when meaningful advice generated)
    hand_number = len(sessions[sid]) + 1
    summary = {
        "hand": hand_number,
        "hero": cards.get("hero_cards", []),
        "board": cards.get("board_cards", []),
        "street": cards.get("street", "unknown"),
        "equity": equity,
        "advice_preview": advice[:80] + ("..." if len(advice) > 80 else "")
    }
    sessions[sid].append(summary)

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
        "history": sessions[sid][-10:]
    }

@app.post("/tts")
def tts_endpoint(req: TTSRequest):
    """
    Dedicated endpoint to synthesize speech using ElevenLabs or Sarvam AI.
    """
    raw_audio, mime, err = synthesize_speech(
        text=req.text,
        engine=req.engine or "browser",
        api_key=req.api_key,
        voice_id=req.voice_id
    )
    if raw_audio:
        b64 = f"data:{mime};base64," + base64.b64encode(raw_audio).decode("utf-8")
        return {"status": "ok", "audio_base64": b64, "mime": mime}
    return {"status": "fallback_browser", "error": err}

@app.post("/reset")
def reset(req: ResetRequest):
    if req.session_id in sessions:
        sessions[req.session_id] = []
    return {"status": "cleared", "session_id": req.session_id}

@app.get("/history/{session_id}")
def get_history(session_id: str):
    return {"history": sessions.get(session_id, [])}
