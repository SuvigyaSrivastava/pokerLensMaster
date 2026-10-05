from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from typing import Optional, Dict, List, Any
import uuid

from vision import detect_cards
from equity import calculate_equity
from coach import get_coaching

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

class ResetRequest(BaseModel):
    session_id: str

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
                    # Normalize card string (e.g., AH -> Ah)
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
        equity = 50.0  # Silent fallback

    # Step 3: Get coaching advice
    try:
        advice = get_coaching(
            cards=cards,
            equity=equity,
            question=req.question or "What should I do?",
            history=sessions[sid]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Coaching failed: {str(e)}")

    # Step 4: Store in session history
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
        "cards": cards,
        "equity": equity,
        "advice": advice,
        "history": sessions[sid][-10:]  # last 10 hands only
    }

@app.post("/reset")
def reset(req: ResetRequest):
    if req.session_id in sessions:
        sessions[req.session_id] = []
    return {"status": "cleared", "session_id": req.session_id}

@app.get("/history/{session_id}")
def get_history(session_id: str):
    return {"history": sessions.get(session_id, [])}
