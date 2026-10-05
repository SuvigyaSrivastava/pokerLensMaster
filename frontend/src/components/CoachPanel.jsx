import React from 'react';

export default function CoachPanel({ advice, isSpeaking, onSpeak }) {
  if (!advice) return null;

  return (
    <div className="bg-[#1A2E1C] border-2 border-[#00C853]/60 rounded-xl p-5 shadow-2xl flex flex-col gap-3 relative overflow-hidden transition-all duration-300">
      {/* Top accent glow */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#00C853] to-transparent opacity-80" />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🎯</span>
          <h3 className="text-base font-bold text-gray-100 tracking-wide">
            Coach Advice
          </h3>
          {isSpeaking && (
            <span className="inline-flex items-center gap-1 text-[11px] text-[#00C853] bg-[#00C853]/15 px-2 py-0.5 rounded-full border border-[#00C853]/30 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00C853]"></span>
              Speaking...
            </span>
          )}
        </div>

        {onSpeak && (
          <button
            type="button"
            onClick={() => onSpeak(advice)}
            className="text-xs bg-[#0D1B0F] hover:bg-[#142817] text-[#00C853] border border-[#00C853]/40 hover:border-[#00C853] px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-medium transition-all shadow active:scale-95"
            title="Read advice aloud"
          >
            <span>🔊</span> Replay
          </button>
        )}
      </div>

      <div className="bg-[#0D1B0F]/90 rounded-lg p-4 border border-[#2a452d]">
        <p className="text-gray-100 text-sm sm:text-base leading-relaxed font-medium">
          {advice}
        </p>
      </div>
    </div>
  );
}
