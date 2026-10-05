import React, { useState } from 'react';

export default function HandHistory({ history }) {
  const [selectedHand, setSelectedHand] = useState(null);

  if (!history || !Array.isArray(history) || history.length === 0) {
    return null;
  }

  return (
    <div className="bg-[#1A2E1C] border border-[#2a452d] rounded-xl p-4 shadow-xl flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-200 flex items-center gap-1.5">
          <span>📜</span> Hand History (Session: {history.length} hands)
        </h3>
        <span className="text-[11px] text-gray-400">Click a hand for details</span>
      </div>

      <div className="flex gap-2.5 overflow-x-auto pb-2 pt-1 scrollbar-thin scrollbar-thumb-[#2a452d]">
        {history.map((h, i) => {
          const isSelected = selectedHand === h.hand;
          const heroText = Array.isArray(h.hero) ? h.hero.join(' ') : '';
          const boardText = Array.isArray(h.board) && h.board.length > 0 ? `| ${h.board.join(' ')}` : '';
          const equityVal = typeof h.equity === 'number' ? h.equity.toFixed(0) : h.equity;

          return (
            <button
              key={`hand-history-${h.hand || i}`}
              type="button"
              onClick={() => setSelectedHand(isSelected ? null : h.hand)}
              className={`flex-shrink-0 text-left px-3 py-2 rounded-lg border transition-all text-xs ${
                isSelected
                  ? 'bg-[#0D1B0F] border-[#00C853] text-[#00C853] ring-1 ring-[#00C853]'
                  : 'bg-[#0D1B0F]/80 border-[#2a452d] hover:border-gray-500 text-gray-300'
              }`}
            >
              <div className="flex items-center gap-2 font-mono font-bold">
                <span className="text-gray-400">#{h.hand}</span>
                <span className="text-white">{heroText || '??'}</span>
                <span className="text-xs text-yellow-400">{equityVal}%</span>
              </div>
              {boardText && (
                <div className="text-[11px] text-gray-400 font-mono mt-0.5">
                  {boardText}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {selectedHand !== null && (
        <div className="bg-[#0D1B0F] p-3 rounded-lg border border-[#2a452d] text-xs text-gray-300 animate-fadeIn">
          {(() => {
            const h = history.find((item) => item.hand === selectedHand);
            if (!h) return null;
            return (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-gray-400 font-mono text-[11px] border-b border-[#2a452d] pb-1">
                  <span>
                    Hand #{h.hand} • {h.street || 'unknown'} • Equity: {h.equity}%
                  </span>
                  <span>Hero: {Array.isArray(h.hero) ? h.hero.join(' ') : ''}</span>
                </div>
                <p className="text-gray-200 italic mt-0.5">
                  "{h.advice_preview}"
                </p>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
