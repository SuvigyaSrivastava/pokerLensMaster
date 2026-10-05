import React from 'react';

const RANKS = {
  '2': '2', '3': '3', '4': '4', '5': '5', '6': '6',
  '7': '7', '8': '8', '9': '9', 'T': '10', '10': '10',
  'J': 'J', 'Q': 'Q', 'K': 'K', 'A': 'A'
};

const SUITS = {
  h: { symbol: '♥', color: 'text-red-600' },
  d: { symbol: '♦', color: 'text-red-600' },
  s: { symbol: '♠', color: 'text-gray-900' },
  c: { symbol: '♣', color: 'text-gray-900' }
};

function renderCard(cardStr, index) {
  if (!cardStr || cardStr.includes('?')) {
    return (
      <div
        key={`card-unknown-${index}`}
        className="w-12 h-16 sm:w-14 sm:h-20 rounded-lg border-2 border-dashed border-gray-500 bg-black/20 flex flex-col items-center justify-center text-gray-400 font-mono text-sm select-none"
        title="Unidentified card"
      >
        <span>?</span>
      </div>
    );
  }

  const clean = cardStr.trim();
  const rawRank = clean.length === 3 ? clean.slice(0, 2).toUpperCase() : clean[0].toUpperCase();
  const rawSuit = clean.slice(-1).toLowerCase();

  const rankDisplay = RANKS[rawRank] || rawRank;
  const suitInfo = SUITS[rawSuit] || { symbol: rawSuit, color: 'text-gray-800' };

  return (
    <div
      key={`card-${cardStr}-${index}`}
      className="w-12 h-16 sm:w-14 sm:h-20 bg-white rounded-lg shadow-lg flex flex-col justify-between p-1.5 border border-gray-200 select-none transform hover:-translate-y-1 transition-transform"
    >
      <div className={`text-xs sm:text-sm font-bold leading-none ${suitInfo.color} flex items-center justify-between`}>
        <span>{rankDisplay}</span>
        <span className="text-[10px] sm:text-xs">{suitInfo.symbol}</span>
      </div>
      <div className={`text-xl sm:text-2xl font-bold self-center leading-none ${suitInfo.color}`}>
        {suitInfo.symbol}
      </div>
      <div className={`text-xs sm:text-sm font-bold leading-none ${suitInfo.color} rotate-180 flex items-center justify-between`}>
        <span>{rankDisplay}</span>
        <span className="text-[10px] sm:text-xs">{suitInfo.symbol}</span>
      </div>
    </div>
  );
}

export default function CardDisplay({ cards, showConfidence = true }) {
  if (!cards) return null;

  const heroCards = cards.hero_cards || [];
  const boardCards = cards.board_cards || [];
  const street = cards.street || 'unknown';
  const confidence = (cards.confidence || 'medium').toLowerCase();

  return (
    <div className="bg-[#1A2E1C] border border-[#2a452d] rounded-xl p-4 shadow-xl flex flex-col gap-4">
      {/* Header with Street Badge & Confidence */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider font-semibold text-gray-400">Street</span>
          <span className="bg-[#0D1B0F] text-[#00C853] border border-[#00C853]/40 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase">
            {street}
          </span>
        </div>

        {showConfidence && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">Detection:</span>
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              confidence === 'high'
                ? 'bg-green-950 text-green-300 border border-green-700/50'
                : confidence === 'medium'
                ? 'bg-yellow-950 text-yellow-300 border border-yellow-700/50'
                : 'bg-red-950 text-red-300 border border-red-700/50'
            }`}
          >
            {confidence}
          </span>
        </div>
        )}
      </div>

      {showConfidence && confidence === 'low' && (
        <div className="bg-yellow-950/40 border border-yellow-700/50 text-yellow-300 text-xs px-3 py-1.5 rounded-md">
          ⚠️ Low detection confidence — check card lighting or angle.
        </div>
      )}

      {/* Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
        {/* Hero Cards */}
        <div className="bg-[#0D1B0F]/60 rounded-lg p-3 border border-[#2a452d]/60">
          <p className="text-xs font-semibold text-gray-300 mb-2 flex items-center gap-1.5">
            <span>🃏</span> Your Hole Cards
          </p>
          <div className="flex gap-2 min-h-[64px] items-center">
            {heroCards.length > 0 ? (
              heroCards.map((c, i) => renderCard(c, i))
            ) : (
              <span className="text-xs text-gray-500 italic">No hole cards detected</span>
            )}
          </div>
        </div>

        {/* Board Cards */}
        <div className="bg-[#0D1B0F]/60 rounded-lg p-3 border border-[#2a452d]/60">
          <p className="text-xs font-semibold text-gray-300 mb-2 flex items-center gap-1.5">
            <span>🎴</span> Board ({street})
          </p>
          <div className="flex gap-2 flex-wrap min-h-[64px] items-center">
            {boardCards.length > 0 ? (
              boardCards.map((c, i) => renderCard(c, i))
            ) : (
              <span className="text-xs text-gray-500 italic">Preflop (no community cards)</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
