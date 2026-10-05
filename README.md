# 🃏 PokerLens — Real-Time AI Poker Coach

PokerLens uses computer vision, Monte Carlo poker simulations, and voice synthesis to analyze poker tables and deliver sharp, real-time tactical coaching.

---

## ⚡ Tech Stack

- **Backend:** Python 3.11+, FastAPI, Uvicorn
- **AI Vision & Coach:** Google Gemini 3.8 Flash (`google-generativeai`, override with `GEMINI_MODEL`)
- **Poker Math & Equity:** `treys` (3,000-iteration Monte Carlo vs 1–8 random opponent hands)
- **Frontend:** React 18, Vite, Tailwind CSS
- **Voice Output:** Web Speech API (default), or ElevenLabs / Sarvam AI
- **Voice Input:** Web Speech API (`SpeechRecognition` - Chrome)
- **Deployment:** Render (Backend) + Vercel (Frontend) — 100% Free Tier

---

## 📁 Project Structure

```
PokerVision/
├── backend/
│   ├── main.py               # FastAPI endpoints, CORS, rate limiting
│   ├── gemini_client.py      # Lazy Gemini client + config errors
│   ├── vision.py             # Gemini Vision card detection
│   ├── cards.py              # Card parsing / validation / street derivation
│   ├── tracker.py            # Session store + debounced table-change detection
│   ├── equity.py             # Treys Monte Carlo equity engine
│   ├── coach.py              # Gemini coaching advice generator
│   ├── tts.py                # ElevenLabs / Sarvam speech synthesis
│   ├── tests/                # pytest suite (no network / API key needed)
│   ├── requirements.txt      # Python dependencies
│   ├── requirements-dev.txt  # pytest + httpx
│   ├── .env.example          # Environment variables template
│   └── .env                  # Local secret keys (gitignored)
├── frontend/
│   ├── src/
│   │   ├── main.jsx          # React entry point
│   │   ├── App.jsx           # Master app container & state
│   │   ├── api.js            # Axios client for backend endpoints
│   │   └── components/
│   │       ├── CameraCapture.jsx   # Webcam capture + image upload
│   │       ├── CardDisplay.jsx     # Visual poker cards & street indicator
│   │       ├── EquityMeter.jsx     # Animated equity percentage bar
│   │       ├── CoachPanel.jsx      # AI advice panel & speech replay
│   │       ├── VoiceInput.jsx      # Speech-to-text mic input
│   │       ├── HandHistory.jsx     # Session hand tracking
│   │       └── WakeupBanner.jsx    # Cold-start server notification
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── package.json
├── .gitignore
└── README.md
```

---

## 🚀 Local Development Setup

### 1. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure Gemini API key
copy .env.example .env
# Edit .env and insert your GEMINI_API_KEY from https://aistudio.google.com
# (never commit .env or put API keys in frontend code — Vite bundles them into the public JS)

# Start backend server
uvicorn main:app --reload --port 8000
```

Run the tests (no API key required):
```bash
pip install -r requirements-dev.txt
pytest
```

Verify backend:
```bash
curl http://localhost:8000/health
# Response: {"status":"ok","service":"PokerLens API"}
```

### 2. Frontend Setup

```bash
cd frontend

# Install npm dependencies
npm install

# Start Vite dev server
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## 🌐 Free Cloud Deployment

### Deploy Backend to Render (Free)
1. Push repository to GitHub.
2. Sign in to [Render](https://render.com) (No credit card needed).
3. Click **New +** -> **Web Service** -> Connect your GitHub repo.
4. Settings:
   - **Root Directory:** `backend`
   - **Runtime:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Environment Variables:
   - `GEMINI_API_KEY`: `<your_gemini_api_key>`
   - `ALLOWED_ORIGINS`: `https://<your-app>.vercel.app` (CORS allow-list; defaults to localhost only)
   - Optional: `GEMINI_MODEL`, `ELEVENLABS_API_KEY`, `SARVAM_API_KEY`
6. Deploy and copy your Render URL (e.g. `https://pokerlens-api.onrender.com`).

### Deploy Frontend to Vercel (Free)
1. Sign in to [Vercel](https://vercel.com) (No credit card needed).
2. Click **Add New...** -> **Project** -> Import your GitHub repo.
3. Settings:
   - **Framework Preset:** `Vite`
   - **Root Directory:** `frontend`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
4. Environment Variables:
   - `VITE_API_URL`: `https://<your-render-app>.onrender.com`
5. Deploy!
