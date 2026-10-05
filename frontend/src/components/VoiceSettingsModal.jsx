import React, { useState } from 'react';
import { synthesizeTTS } from '../api';

export default function VoiceSettingsModal({ isOpen, onClose, voiceConfig, onSaveConfig }) {
  const [engine, setEngine] = useState(voiceConfig?.engine || 'browser');
  const [elevenKey, setElevenKey] = useState(voiceConfig?.elevenKey || '');
  const [elevenVoiceId, setElevenVoiceId] = useState(voiceConfig?.elevenVoiceId || 'JBFqnCBsd6RMkjVDRZzb');
  const [sarvamKey, setSarvamKey] = useState(voiceConfig?.sarvamKey || '');
  const [sarvamSpeaker, setSarvamSpeaker] = useState(voiceConfig?.sarvamSpeaker || 'meera');
  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState(null);

  if (!isOpen) return null;

  const handleSave = () => {
    const newConfig = {
      engine,
      elevenKey: elevenKey.trim(),
      elevenVoiceId: elevenVoiceId.trim() || 'JBFqnCBsd6RMkjVDRZzb',
      sarvamKey: sarvamKey.trim(),
      sarvamSpeaker: sarvamSpeaker.trim() || 'meera'
    };
    onSaveConfig(newConfig);
    onClose();
  };

  const handleTestVoice = async () => {
    setIsTesting(true);
    setTestStatus('Testing speech output...');
    const sampleText = 'PokerLens voice coach online. Ready to read the table.';

    if (engine === 'browser') {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(sampleText);
        u.rate = 0.95;
        u.pitch = 1.0;
        u.onend = () => {
          setIsTesting(false);
          setTestStatus('Browser voice test completed!');
        };
        u.onerror = () => {
          setIsTesting(false);
          setTestStatus('Browser speech error.');
        };
        window.speechSynthesis.speak(u);
      } else {
        setIsTesting(false);
        setTestStatus('SpeechSynthesis not supported in this browser.');
      }
      return;
    }

    try {
      const activeKey = engine === 'elevenlabs' ? elevenKey : sarvamKey;
      const activeVoice = engine === 'elevenlabs' ? elevenVoiceId : sarvamSpeaker;

      const res = await synthesizeTTS({
        text: sampleText,
        engine,
        api_key: activeKey,
        voice_id: activeVoice
      });

      if (res.audio_base64) {
        const audio = new Audio(res.audio_base64);
        audio.onended = () => {
          setIsTesting(false);
          setTestStatus(`${engine.toUpperCase()} voice verified!`);
        };
        audio.onerror = () => {
          setIsTesting(false);
          setTestStatus('Failed to play synthesized audio.');
        };
        await audio.play();
      } else if (res.status === 'fallback_browser') {
        setIsTesting(false);
        setTestStatus(`Notice: ${res.error || 'Fell back to browser voice.'}`);
      }
    } catch (err) {
      setIsTesting(false);
      setTestStatus(`Error: ${err.response?.data?.detail || err.message}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#1A2E1C] border border-[#2a452d] w-full max-w-md rounded-2xl p-6 shadow-2xl flex flex-col gap-5 text-gray-100">
        <div className="flex items-center justify-between border-b border-[#2a452d] pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎙️</span>
            <h3 className="text-lg font-bold text-white">Voice Agent Engine</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white text-lg p-1"
          >
            ✕
          </button>
        </div>

        {/* Engine Selector */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
            Select Coach Voice Engine
          </label>
          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={() => setEngine('browser')}
              className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                engine === 'browser'
                  ? 'bg-[#00C853]/15 border-[#00C853] text-white ring-1 ring-[#00C853]'
                  : 'bg-[#0D1B0F] border-[#2a452d] text-gray-300 hover:border-gray-500'
              }`}
            >
              <div>
                <p className="text-sm font-bold flex items-center gap-1.5">
                  <span>⚡</span> Browser Native Voice
                  <span className="text-[10px] bg-[#00C853]/20 text-[#00C853] font-semibold px-1.5 py-0.5 rounded">
                    100% Free Forever
                  </span>
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Zero setup, 0ms latency, unlimited minutes, no API keys needed
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setEngine('elevenlabs')}
              className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                engine === 'elevenlabs'
                  ? 'bg-[#00C853]/15 border-[#00C853] text-white ring-1 ring-[#00C853]'
                  : 'bg-[#0D1B0F] border-[#2a452d] text-gray-300 hover:border-gray-500'
              }`}
            >
              <div>
                <p className="text-sm font-bold flex items-center gap-1.5">
                  <span>🎬</span> ElevenLabs Voice AI
                  <span className="text-[10px] bg-blue-500/20 text-blue-300 font-semibold px-1.5 py-0.5 rounded">
                    Studio Quality
                  </span>
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Hyper-realistic caddy voice (10,000 free chars/month)
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setEngine('sarvam')}
              className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                engine === 'sarvam'
                  ? 'bg-[#00C853]/15 border-[#00C853] text-white ring-1 ring-[#00C853]'
                  : 'bg-[#0D1B0F] border-[#2a452d] text-gray-300 hover:border-gray-500'
              }`}
            >
              <div>
                <p className="text-sm font-bold flex items-center gap-1.5">
                  <span>🇮🇳</span> Sarvam AI Bulbul
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 font-semibold px-1.5 py-0.5 rounded">
                    Indian English / Indic
                  </span>
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Expressive Indian-accented English with sub-250ms streaming
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* ElevenLabs Specific Fields */}
        {engine === 'elevenlabs' && (
          <div className="bg-[#0D1B0F] p-3.5 rounded-xl border border-[#2a452d] flex flex-col gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-300 block mb-1">
                ElevenLabs API Key
              </label>
              <input
                type="password"
                value={elevenKey}
                onChange={(e) => setElevenKey(e.target.value)}
                placeholder="sk_..."
                className="w-full bg-black/40 border border-[#2a452d] focus:border-[#00C853] rounded-lg px-3 py-2 text-xs text-gray-100 outline-none"
              />
              <p className="text-[10px] text-gray-500 mt-1">
                From elevenlabs.io profile settings (Free plan includes 10k chars)
              </p>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-300 block mb-1">
                Voice ID (Optional)
              </label>
              <input
                type="text"
                value={elevenVoiceId}
                onChange={(e) => setElevenVoiceId(e.target.value)}
                placeholder="JBFqnCBsd6RMkjVDRZzb (George)"
                className="w-full bg-black/40 border border-[#2a452d] focus:border-[#00C853] rounded-lg px-3 py-2 text-xs text-gray-100 outline-none font-mono"
              />
            </div>
          </div>
        )}

        {/* Sarvam AI Specific Fields */}
        {engine === 'sarvam' && (
          <div className="bg-[#0D1B0F] p-3.5 rounded-xl border border-[#2a452d] flex flex-col gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-300 block mb-1">
                Sarvam API Subscription Key
              </label>
              <input
                type="password"
                value={sarvamKey}
                onChange={(e) => setSarvamKey(e.target.value)}
                placeholder="Paste your Sarvam AI key..."
                className="w-full bg-black/40 border border-[#2a452d] focus:border-[#00C853] rounded-lg px-3 py-2 text-xs text-gray-100 outline-none"
              />
              <p className="text-[10px] text-gray-500 mt-1">
                From sarvam.ai dashboard (new accounts get free starter credits)
              </p>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-300 block mb-1">
                Speaker Voice
              </label>
              <select
                value={sarvamSpeaker}
                onChange={(e) => setSarvamSpeaker(e.target.value)}
                className="w-full bg-black/40 border border-[#2a452d] focus:border-[#00C853] rounded-lg px-3 py-2 text-xs text-gray-100 outline-none"
              >
                <option value="meera">Meera (Clear Indian English)</option>
                <option value="pavithra">Pavithra</option>
                <option value="maitreyi">Maitreyi</option>
                <option value="arvind">Arvind (Male Coach)</option>
                <option value="amartya">Amartya</option>
              </select>
            </div>
          </div>
        )}

        {/* Test voice indicator */}
        {testStatus && (
          <p className="text-xs text-center text-yellow-300 bg-yellow-950/40 py-1.5 px-3 rounded-lg border border-yellow-800/40">
            {testStatus}
          </p>
        )}

        {/* Footer actions */}
        <div className="flex items-center gap-2 pt-2 border-t border-[#2a452d]">
          <button
            type="button"
            onClick={handleTestVoice}
            disabled={isTesting}
            className="flex-1 bg-[#0D1B0F] hover:bg-[#142817] text-gray-200 border border-[#2a452d] font-semibold py-2.5 px-4 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <span>🔊</span> {isTesting ? 'Testing Voice...' : 'Test Speech Output'}
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="flex-1 bg-[#00C853] hover:bg-[#00b34a] text-black font-bold py-2.5 px-4 rounded-xl text-xs transition-all shadow-md"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
