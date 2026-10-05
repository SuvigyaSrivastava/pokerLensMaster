import React, { useState, useEffect, useCallback, useRef } from 'react';
import { wakeServer, analyzeHand, resetSession } from './api';
import WakeupBanner from './components/WakeupBanner';
import CameraCapture from './components/CameraCapture';
import CardDisplay from './components/CardDisplay';
import EquityMeter from './components/EquityMeter';
import CoachPanel from './components/CoachPanel';
import VoiceInput from './components/VoiceInput';
import HandHistory from './components/HandHistory';
import VoiceSettingsModal from './components/VoiceSettingsModal';

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

  // Live Auto-Agent Mode (Continuous Table Co-Pilot)
  const [isLiveMode, setIsLiveMode] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Voice Engine Config
  const [voiceConfig, setVoiceConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('pokerlens_voice_config');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {
      engine: 'browser',
      elevenKey: '',
      elevenVoiceId: 'JBFqnCBsd6RMkjVDRZzb',
      sarvamKey: '',
      sarvamSpeaker: 'meera'
    };
  });

  const activeAudioRef = useRef(null);
  const lastCardsRef = useRef(null);

  // Keep lastCardsRef in sync with result
  useEffect(() => {
    if (result?.cards) {
      lastCardsRef.current = result.cards;
    }
  }, [result]);

  // Initialize session and server wake-up ping
  useEffect(() => {
    let sid = localStorage.getItem('pokerlens_session');
    if (!sid) {
      sid = generateUUID();
      localStorage.setItem('pokerlens_session', sid);
    }
    setSessionId(sid);

    let isCancelled = false;
    wakeServer()
      .then(() => {
        if (!isCancelled) setIsWaking(false);
      })
      .catch(() => {});

    const wakeTimer = setTimeout(() => {
      if (!isCancelled) setIsWaking(false);
    }, 35000);

    return () => {
      isCancelled = true;
      clearTimeout(wakeTimer);
    };
  }, []);

  // Universal speech function: ElevenLabs / Sarvam audio tag or Web Speech API fallback
  const speakAdvice = useCallback((text, audioBase64 = null) => {
    if (!text && !audioBase64) return;

    // Stop any playing audio
    if (activeAudioRef.current) {
      try {
        activeAudioRef.current.pause();
        activeAudioRef.current = null;
      } catch (e) {}
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    // 1. If audio base64 is provided (from ElevenLabs or Sarvam AI)
    if (audioBase64) {
      try {
        const audio = new Audio(audioBase64);
        activeAudioRef.current = audio;
        setIsSpeaking(true);
        audio.onended = () => setIsSpeaking(false);
        audio.onerror = () => {
          setIsSpeaking(false);
          // Fall back to browser voice
          if ('speechSynthesis' in window && text) {
            const u = new SpeechSynthesisUtterance(text);
            window.speechSynthesis.speak(u);
          }
        };
        audio.play().catch(() => {
          setIsSpeaking(false);
        });
        return;
      } catch (e) {
        console.warn('Audio playback error:', e);
      }
    }

    // 2. Default Browser Web Speech API
    if ('speechSynthesis' in window && text) {
      try {
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
    }
  }, []);

  const handleSaveVoiceConfig = (newConfig) => {
    setVoiceConfig(newConfig);
    try {
      localStorage.setItem('pokerlens_voice_config', JSON.stringify(newConfig));
    } catch (e) {}
  };

  // Main analyze / live update handler
  const handleAnalyze = async (overrideB64 = null, isAutoLive = false, overrideQuestion = '') => {
    const frameToAnalyze = overrideB64 || capturedB64;
    if (!frameToAnalyze) {
      if (!isAutoLive) {
        setError('Please capture or upload an image of the poker table first.');
      }
      return;
    }

    // If auto-live frame, update current frame preview
    if (overrideB64) {
      setCapturedB64(overrideB64);
    }

    const currentQuestion = typeof overrideQuestion === 'string' ? overrideQuestion : question;

    setIsAnalyzing(true);
    if (!isAutoLive) setError(null);

    try {
      const activeApiKey =
        voiceConfig.engine === 'elevenlabs'
          ? voiceConfig.elevenKey
          : voiceConfig.engine === 'sarvam'
          ? voiceConfig.sarvamKey
          : null;

      const activeVoiceId =
        voiceConfig.engine === 'elevenlabs'
          ? voiceConfig.elevenVoiceId
          : voiceConfig.engine === 'sarvam'
          ? voiceConfig.sarvamSpeaker
          : null;

      const data = await analyzeHand({
        image_b64: frameToAnalyze,
        question: currentQuestion,
        session_id: sessionId,
        is_live: isAutoLive,
        last_cards: lastCardsRef.current,
        voice_engine: voiceConfig.engine,
        voice_api_key: activeApiKey,
        voice_id: activeVoiceId
      });

      // Update state
      if (data.state_changed || !isAutoLive || currentQuestion) {
        setResult(data);
        if (data.advice) {
          speakAdvice(data.advice, data.audio_base64);
        }
      } else if (data.cards) {
        // Table hasn't changed; update equity / cards quietly without interrupting speech
        setResult((prev) => (prev ? { ...prev, cards: data.cards, equity: data.equity } : data));
      }
    } catch (err) {
      // In auto-live mode, don't spam popups on transient frames
      if (!isAutoLive) {
        console.error('Analyze error:', err);
        const detail =
          err.response?.data?.detail ||
          err.message ||
          'Failed to read table cards. Ensure proper lighting and try again.';
        setError(detail);
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCaptureFrame = useCallback((b64, isAutoLive = false) => {
    if (isAutoLive) {
      handleAnalyze(b64, true, '');
    } else {
      setCapturedB64(b64);
      setError(null);
    }
  }, []);

  const handleReset = async () => {
    try {
      if (sessionId) {
        await resetSession(sessionId);
      }
    } catch (e) {}
    const newSid = generateUUID();
    localStorage.setItem('pokerlens_session', newSid);
    setSessionId(newSid);
    setResult(null);
    setQuestion('');
    setCapturedB64(null);
    setError(null);
    lastCardsRef.current = null;
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  };

  const currentStreet = result?.cards?.street || 'Preflop';

  return (
    <div className="min-h-screen bg-[#0D1B0F] text-gray-100 flex flex-col font-sans">
      {/* Voice Settings Modal */}
      <VoiceSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        voiceConfig={voiceConfig}
        onSaveConfig={handleSaveVoiceConfig}
      />

      {/* Top Navbar */}
      <header className="border-b border-[#1A2E1C] bg-[#0D1B0F]/95 backdrop-blur sticky top-0 z-30 px-4 py-3 sm:px-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl select-none">🃏</span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                  PokerLens
                </h1>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-[#00C853]/20 text-[#00C853] border border-[#00C853]/40 px-2 py-0.5 rounded-full">
                  Live Coach
                </span>
              </div>
              <p className="text-[11px] text-gray-400 hidden sm:block">
                Continuous real-time table vision & voice coaching
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Live Co-Pilot Switch */}
            <button
              type="button"
              onClick={() => setIsLiveMode((prev) => !prev)}
              className={`text-xs font-bold px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition-all shadow-md ${
                isLiveMode
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/60 ring-2 ring-emerald-500/20'
                  : 'bg-[#1A2E1C] text-gray-300 border-[#2a452d] hover:text-white'
              }`}
              title="Toggle continuous autonomous table monitoring"
            >
              <span className={`w-2 h-2 rounded-full ${isLiveMode ? 'bg-[#00C853] animate-ping' : 'bg-gray-500'}`} />
              {isLiveMode ? 'LIVE AGENT ON' : 'LIVE PAUSED'}
            </button>

            {/* Voice Engine Button */}
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="text-xs bg-[#1A2E1C] hover:bg-[#233f26] text-gray-200 border border-[#2a452d] px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 font-medium"
              title="Configure voice output (ElevenLabs, Sarvam AI, Browser)"
            >
              <span>🎙️</span>
              <span className="hidden md:inline capitalize">{voiceConfig.engine}</span>
            </button>

            {result?.hand_number && (
              <span className="bg-[#1A2E1C] text-[#00C853] border border-[#2a452d] px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold hidden sm:inline-block">
                Hand #{result.hand_number}
              </span>
            )}

            <button
              type="button"
              onClick={handleReset}
              className="text-xs bg-[#1A2E1C] hover:bg-[#233f26] text-gray-400 hover:text-white border border-[#2a452d] px-2.5 py-1.5 rounded-lg transition-all"
              title="Reset session"
            >
              🔄
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
        <WakeupBanner isWaking={isWaking} />

        {/* Global Error Banner */}
        {error && (
          <div className="bg-red-950/80 border border-red-500/80 text-red-200 px-4 py-3 rounded-xl flex items-start justify-between gap-3 text-sm shadow-lg animate-fadeIn">
            <div className="flex items-start gap-2">
              <span className="text-lg">⚠️</span>
              <div>
                <p className="font-semibold">Table Vision Notice</p>
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
          {/* Left Column: Camera Feed */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <CameraCapture
              onCapture={handleCaptureFrame}
              capturedB64={capturedB64}
              isAnalyzing={isAnalyzing}
              isLiveMode={isLiveMode}
              streetBadge={result?.cards?.street}
            />

            {/* Live Agent HUD status card */}
            <div className="bg-[#1A2E1C]/60 border border-[#2a452d] rounded-xl p-3.5 text-xs text-gray-300 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <span className="text-sm">🤖</span> Live Agent State
                </span>
                <span className="text-[11px] font-mono text-emerald-400">
                  {isLiveMode ? 'Active • Autonomous' : 'Paused'}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                {isLiveMode
                  ? 'Your voice coach is watching the table live. When your hole cards are dealt or community cards open (Flop, Turn, River), it speaks proactive advice automatically without you pressing anything.'
                  : 'Live mode paused. Click "LIVE AGENT ON" above or use "Single Snap" below.'}
              </p>
            </div>
          </div>

          {/* Right Column: Cards, Equity, Coach Advice & Follow-up */}
          <div className="lg:col-span-7 flex flex-col gap-5">
            {/* Live scanning indicator */}
            {isAnalyzing && (
              <div className="bg-[#1A2E1C] border border-[#00C853]/40 rounded-xl p-6 flex flex-col items-center justify-center gap-3 text-center shadow-xl animate-pulse">
                <div className="w-8 h-8 border-3 border-[#00C853] border-t-transparent rounded-full animate-spin"></div>
                <h3 className="text-sm font-bold text-gray-100">
                  Scanning table & evaluating Monte Carlo equity...
                </h3>
              </div>
            )}

            {/* Results Section */}
            {result ? (
              <>
                <CardDisplay cards={result.cards} />
                <EquityMeter equity={result.equity} />
                <CoachPanel
                  advice={result.advice}
                  isSpeaking={isSpeaking}
                  onSpeak={(text) => speakAdvice(text, result.audio_base64)}
                />
              </>
            ) : (
              !isAnalyzing && (
                <div className="bg-[#1A2E1C] border border-[#2a452d] rounded-xl p-8 text-center flex flex-col items-center justify-center gap-3">
                  <div className="w-14 h-14 rounded-full bg-[#0D1B0F] border border-[#2a452d] flex items-center justify-center text-2xl">
                    🃏
                  </div>
                  <h3 className="text-lg font-bold text-gray-100">
                    Live Table Co-Pilot Ready
                  </h3>
                  <p className="text-xs text-gray-400 max-w-md">
                    Position your hole cards and community cards in the camera view. The AI coach will detect each street (Preflop, Flop, Turn, River) and whisper the exact winning line aloud in real time.
                  </p>
                </div>
              )
            )}

            {/* Interaction Bar: Ask Coach Follow-up / Speak */}
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
                      if (e.key === 'Enter') handleAnalyze(null, false, question);
                    }}
                    placeholder="e.g., Should I value bet or check? What do I beat?"
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
                    handleAnalyze(null, false, transcript);
                  }}
                  disabled={isAnalyzing}
                />
              </div>

              {/* Manual Trigger Button */}
              <button
                type="button"
                onClick={() => handleAnalyze(null, false, question)}
                disabled={isAnalyzing}
                className="w-full bg-[#00C853] hover:bg-[#00b34a] text-black font-extrabold py-3 px-6 rounded-lg text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg hover:shadow-[#00C853]/20 transition-all active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isAnalyzing ? (
                  <>
                    <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    Analyzing Current Table...
                  </>
                ) : (
                  <>
                    <span>⚡</span> Instant Analysis & Voice Advice
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Hand History Panel */}
        <HandHistory history={result?.history} />
      </main>

      {/* Footer */}
      <footer className="border-t border-[#1A2E1C] bg-[#0D1B0F] px-4 py-4 text-center text-xs text-gray-500">
        PokerLens Live • Powered by Google Gemini Vision & Monte Carlo Engine • Voice: {voiceConfig.engine.toUpperCase()}
      </footer>
    </div>
  );
}
