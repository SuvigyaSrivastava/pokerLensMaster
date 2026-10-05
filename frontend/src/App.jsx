import React, { useState, useEffect, useCallback } from 'react';
import { wakeServer, analyzeHand, resetSession } from './api';
import WakeupBanner from './components/WakeupBanner';
import CameraCapture from './components/CameraCapture';
import CardDisplay from './components/CardDisplay';
import EquityMeter from './components/EquityMeter';
import CoachPanel from './components/CoachPanel';
import VoiceInput from './components/VoiceInput';
import HandHistory from './components/HandHistory';

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function App() {
  const [sessionId, setSessionId] = useState('');
  const [isWaking, setIsWaking] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [question, setQuestion] = useState('');
  const [error, setError] = useState(null);
  const [capturedB64, setCapturedB64] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Initialize session and server wake-up ping
  useEffect(() => {
    let sid = localStorage.getItem('pokerlens_session');
    if (!sid) {
      sid = generateUUID();
      localStorage.setItem('pokerlens_session', sid);
    }
    setSessionId(sid);

    let wakeTimer = null;
    let isCancelled = false;

    wakeServer()
      .then(() => {
        if (!isCancelled) setIsWaking(false);
      })
      .catch(() => {});

    // Fallback: clear wake-up banner after 35 seconds regardless
    wakeTimer = setTimeout(() => {
      if (!isCancelled) setIsWaking(false);
    }, 35000);

    return () => {
      isCancelled = true;
      if (wakeTimer) clearTimeout(wakeTimer);
    };
  }, []);

  const speak = useCallback((text) => {
    if (!('speechSynthesis' in window) || !text) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.95;
      u.pitch = 1.0;
      u.onstart = () => setIsSpeaking(true);
      u.onend = () => setIsSpeaking(false);
      u.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(u);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
      setIsSpeaking(false);
    }
  }, []);

  const handleCapture = useCallback((b64) => {
    setCapturedB64(b64);
    setError(null);
  }, []);

  const handleAnalyze = async (overrideQuestion) => {
    if (!capturedB64) {
      setError('Please capture a photo or upload an image of the poker table first.');
      return;
    }

    const currentQuestion = typeof overrideQuestion === 'string' ? overrideQuestion : question;

    setIsAnalyzing(true);
    setError(null);

    try {
      const data = await analyzeHand(capturedB64, currentQuestion, sessionId);
      setResult(data);
      if (data.advice) {
        speak(data.advice);
      }
    } catch (err) {
      console.error('Analyze error:', err);
      const detail =
        err.response?.data?.detail ||
        err.message ||
        'Failed to analyze cards. Please ensure good lighting and try again.';
      setError(detail);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReset = async () => {
    try {
      if (sessionId) {
        await resetSession(sessionId);
      }
    } catch (e) {
      console.warn('Reset error:', e);
    }
    const newSid = generateUUID();
    localStorage.setItem('pokerlens_session', newSid);
    setSessionId(newSid);
    setResult(null);
    setQuestion('');
    setCapturedB64(null);
    setError(null);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  };

  return (
    <div className="min-h-screen bg-[#0D1B0F] text-gray-100 flex flex-col">
      {/* Top Navbar */}
      <header className="border-b border-[#1A2E1C] bg-[#0D1B0F]/90 backdrop-blur sticky top-0 z-30 px-4 py-3 sm:px-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl select-none">🃏</span>
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                PokerLens
                <span className="text-[10px] font-bold uppercase tracking-wider bg-[#00C853]/20 text-[#00C853] border border-[#00C853]/40 px-2 py-0.5 rounded-full">
                  AI Coach
                </span>
              </h1>
              <p className="text-[11px] text-gray-400 hidden sm:block">
                Real-time vision card reader & equity coaching
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {result?.hand_number && (
              <span className="bg-[#1A2E1C] text-[#00C853] border border-[#2a452d] px-3 py-1 rounded-lg text-xs font-mono font-bold">
                Hand #{result.hand_number}
              </span>
            )}
            <button
              type="button"
              onClick={handleReset}
              className="text-xs bg-[#1A2E1C] hover:bg-[#233f26] text-gray-300 hover:text-white border border-[#2a452d] px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5"
              title="Clear session history"
            >
              <span>🔄</span> Reset
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
        {/* Cold Start Wakeup Notice */}
        <WakeupBanner isWaking={isWaking} />

        {/* Global Error Banner */}
        {error && (
          <div className="bg-red-950/80 border border-red-500/80 text-red-200 px-4 py-3 rounded-xl flex items-start justify-between gap-3 text-sm shadow-lg animate-fadeIn">
            <div className="flex items-start gap-2">
              <span className="text-lg">⚠️</span>
              <div>
                <p className="font-semibold">Analysis Notice</p>
                <p className="text-xs text-red-300 mt-0.5">{error}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-100 text-xs px-2 py-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* Two-Column Responsive Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Camera / Frame Capture */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <CameraCapture
              onCapture={handleCapture}
              capturedB64={capturedB64}
              isAnalyzing={isAnalyzing}
            />

            {/* Quick tips */}
            <div className="bg-[#1A2E1C]/50 border border-[#2a452d]/60 rounded-xl p-3.5 text-xs text-gray-400 flex flex-col gap-1.5">
              <span className="font-semibold text-gray-300 flex items-center gap-1">
                <span>💡</span> Tips for best card detection:
              </span>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-gray-400">
                <li>Keep cards clearly visible and flat under good lighting.</li>
                <li>Hole cards and board cards will be automatically classified.</li>
                <li>Ask specific questions like "Should I c-bet?", "What's my equity?"</li>
              </ul>
            </div>
          </div>

          {/* Right Column: Cards, Equity, Coach Advice & Follow-up */}
          <div className="lg:col-span-7 flex flex-col gap-5">
            {/* Loading Indicator */}
            {isAnalyzing && (
              <div className="bg-[#1A2E1C] border border-[#00C853]/40 rounded-xl p-8 flex flex-col items-center justify-center gap-3 text-center shadow-xl animate-pulse">
                <div className="w-10 h-10 border-4 border-[#00C853] border-t-transparent rounded-full animate-spin"></div>
                <h3 className="text-base font-bold text-gray-100">
                  Reading the table...
                </h3>
                <p className="text-xs text-gray-400 max-w-sm">
                  Detecting cards with Gemini Vision and running 3,000 Monte Carlo simulations...
                </p>
              </div>
            )}

            {/* Results Section */}
            {result && !isAnalyzing && (
              <>
                {/* Detected Cards */}
                <CardDisplay cards={result.cards} />

                {/* Equity Bar */}
                <EquityMeter equity={result.equity} />

                {/* Coach Advice */}
                <CoachPanel
                  advice={result.advice}
                  isSpeaking={isSpeaking}
                  onSpeak={speak}
                />
              </>
            )}

            {/* Empty State when no result yet and not analyzing */}
            {!result && !isAnalyzing && (
              <div className="bg-[#1A2E1C] border border-[#2a452d] rounded-xl p-8 text-center flex flex-col items-center justify-center gap-3">
                <div className="w-14 h-14 rounded-full bg-[#0D1B0F] border border-[#2a452d] flex items-center justify-center text-2xl">
                  🃏
                </div>
                <h3 className="text-lg font-bold text-gray-100">
                  No Hand Analyzed Yet
                </h3>
                <p className="text-xs text-gray-400 max-w-md">
                  Snap a photo from your webcam or upload an image of poker cards on the left, then click{' '}
                  <strong className="text-gray-200">"Analyze Table"</strong> to get instant equity and AI coaching advice.
                </p>
              </div>
            )}

            {/* Interaction Bar: Question Input + Voice + Analyze Button */}
            <div className="bg-[#1A2E1C] border border-[#2a452d] rounded-xl p-4 shadow-xl flex flex-col gap-3">
              <label htmlFor="coach-question" className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                <span>💬</span> Ask Coach / Follow-up Question
              </label>

              <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                  <input
                    id="coach-question"
                    type="text"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAnalyze();
                    }}
                    placeholder="e.g., Should I bet for value or check? What do I beat?"
                    disabled={isAnalyzing}
                    className="w-full bg-[#0D1B0F] border border-[#2a452d] focus:border-[#00C853] focus:ring-1 focus:ring-[#00C853] text-gray-100 text-sm rounded-lg px-3.5 py-2.5 outline-none transition-all placeholder-gray-500"
                  />
                  {question && (
                    <button
                      type="button"
                      onClick={() => setQuestion('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Voice Input (SpeechRecognition for Chrome) */}
                <VoiceInput
                  onTranscript={(transcript) => {
                    setQuestion(transcript);
                    handleAnalyze(transcript);
                  }}
                  disabled={isAnalyzing}
                />
              </div>

              {/* Main Analyze Action Button */}
              <button
                type="button"
                onClick={() => handleAnalyze()}
                disabled={isAnalyzing || !capturedB64}
                className="w-full bg-[#00C853] hover:bg-[#00b34a] text-black font-extrabold py-3 px-6 rounded-lg text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg hover:shadow-[#00C853]/20 transition-all active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isAnalyzing ? (
                  <>
                    <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    Analyzing Hand...
                  </>
                ) : (
                  <>
                    <span>⚡</span> Analyze Table & Get Coaching
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Section: Hand History */}
        <HandHistory history={result?.history} />
      </main>

      {/* Footer */}
      <footer className="border-t border-[#1A2E1C] bg-[#0D1B0F] px-4 py-4 text-center text-xs text-gray-500">
        PokerLens • Powered by Google Gemini 2.5 Flash & treys Monte Carlo Engine
      </footer>
    </div>
  );
}
