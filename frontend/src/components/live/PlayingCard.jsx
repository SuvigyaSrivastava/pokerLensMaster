import React from 'react';

const SUIT = {
  h: { s: '♥', c: 'text-[#C0321F]' },
  d: { s: '♦', c: 'text-[#C0321F]' },
  s: { s: '♠', c: 'text-[#15171A]' },
  c: { s: '♣', c: 'text-[#15171A]' },
};

export function parseCard(card) {
  if (!card || card.includes('?')) return null;
  const t = card.trim();
  const rank = t.slice(0, -1).toUpperCase();
  return { rank: rank === 'T' ? '10' : rank, suit: t.slice(-1).toLowerCase() };
}

const SIZES = {
  sm: 'w-9 h-[52px] rounded-lg text-[15px]',
  md: 'w-[38px] h-[54px] rounded-lg text-[16px] sm:w-[52px] sm:h-[74px] sm:rounded-[10px] sm:text-[21px]',
  pick: 'w-[52px] h-[74px] rounded-[10px] text-[21px]',
  lg: 'w-16 h-[90px] rounded-xl text-[26px]',
};

export default function PlayingCard({ card, size = 'md', onClick, label }) {
  const p = parseCard(card);
  const cls = SIZES[size];
  const Tag = onClick ? 'button' : 'div';
  if (!p) {
    return (
      <Tag type={onClick ? 'button' : undefined} onClick={onClick} aria-label={label || 'Empty card slot'}
        className={`${cls} shrink-0 border border-dashed border-fg/30 grid place-items-center text-fg-dim ${onClick ? 'hover:border-fg hover:text-fg transition' : ''}`}>
        <span className="text-base leading-none">{card && card.includes('?') ? '?' : '+'}</span>
      </Tag>
    );
  }
  const suit = SUIT[p.suit] || { s: p.suit, c: 'text-[#15171A]' };
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} aria-label={label || `${p.rank} ${p.suit}`}
      className={`${cls} ${suit.c} shrink-0 bg-white border border-fg/25 shadow-[0_2px_0_rgba(27,26,23,.12)] flex flex-col items-center justify-center leading-none font-bold animate-deal ${onClick ? 'hover:-translate-y-0.5 transition-transform' : ''}`}>
      <span className="tracking-tight">{p.rank}</span>
      <span className="text-[0.8em] -mt-0.5">{suit.s}</span>
    </Tag>
  );
}
