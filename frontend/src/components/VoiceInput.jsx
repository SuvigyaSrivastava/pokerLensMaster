import React, { useState, useEffect, useRef } from 'react';

export default function VoiceInput({ onTranscript, disabled = false }) {
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const onTranscriptRef = useRef(onTranscript);

  // Keep the newest callback without recreating the recognizer on every render
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    const SpeechRecognitionClass =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognitionClass) {
      setIsSupported(true);
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript;
        if (transcript && onTranscriptRef.current) {
          onTranscriptRef.current(transcript);
        }
        setIsListening(false);
      };

      recognition.onerror = (err) => {
        console.warn('SpeechRecognition error:', err);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    } else {
      setIsSupported(false);
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  if (!isSupported) return null;

  const toggleListen = () => {
    if (disabled) return;
    if (!recognitionRef.current) return;

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.warn('Could not start recognition:', err);
        setIsListening(false);
      }
    }
  };

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={toggleListen}
        disabled={disabled}
        title={isListening ? 'Listening... click to stop' : 'Speak your question (Chrome only)'}
        className={`p-3 rounded-xl border flex items-center justify-center transition-all ${
          isListening
            ? 'bg-red-500/20 border-red-500 text-red-400 ring-4 ring-red-500/40 animate-pulse'
            : 'bg-[#0D1B0F] hover:bg-[#142817] border-[#2a452d] text-gray-300 hover:text-white hover:border-[#00C853]'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <span className="text-lg">{isListening ? '🛑' : '🎤'}</span>
      </button>
      <span className="text-[10px] text-gray-500 mt-1 select-none">Voice (Chrome)</span>
    </div>
  );
}
