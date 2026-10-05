import React, { useEffect, useState } from 'react';
import PlayingCard from './PlayingCard';
import { Icon } from './ui';

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS = [['s', '♠', 'text-fg'], ['h', '♥', 'text-coral'], ['d', '♦', 'text-coral'], ['c', '♣', 'text-fg']];

// Bottom sheet: pick a rank, then a suit. Faster and less error-prone than typing "Qh Kd" at a table.
export default function CardPicker({ title, hint, max, value, taken = [], sizes, onSave, onClose }) {
  const [cards, setCards] = useState(value || []);
  const [rank, setRank] = useState(null);
  const full = cards.length >= max;
  const valid = sizes ? sizes.includes(cards.length) : cards.length === 0 || cards.length === max;
  const used = new Set([...taken, ...cards].map((c) => c.toLowerCase()));

  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const add = (suit) => {
    if (!rank || full) return;
    const c = `${rank}${suit}`;
    if (used.has(c.toLowerCase())) return;
    setCards([...cards, c]);
    setRank(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close" className="absolute inset-0 bg-fg/60" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-ink-800 border border-line rounded-t-3xl sm:rounded-3xl p-5 safe-b animate-sheet">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl leading-none">{title}</h2>
            <p className="text-xs text-fg-muted mt-0.5">{hint}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="btn-ghost w-9 h-9 !rounded-full"><Icon name="x" size={16} /></button>
        </div>

        <div className="flex items-center gap-2 mt-4 min-h-[74px]">
          {Array.from({ length: max }).map((_, i) => (
            <PlayingCard key={`${i}-${cards[i] || 'e'}`} card={cards[i]} size="pick" onClick={cards[i] ? () => setCards(cards.filter((_, j) => j !== i)) : undefined}
              label={cards[i] ? `Remove ${cards[i]}` : undefined} />
          ))}
        </div>
        <p className="text-[11px] text-fg-dim mt-2 h-4">{cards.length > 0 ? 'Tap a card to remove it.' : ''}</p>

        <p className="eyebrow mt-3 mb-2">{full ? 'All set' : rank ? 'Now the suit' : 'Rank'}</p>
        <div className="grid grid-cols-7 gap-1.5">
          {RANKS.map((r) => (
            <button key={r} disabled={full} onClick={() => setRank(r === rank ? null : r)}
              className={`h-11 rounded-xl text-sm font-semibold border transition disabled:opacity-30 ${rank === r ? 'bg-fg text-ink border-fg' : 'bg-ink-900 border-line hover:bg-ink-600'}`}>
              {r === 'T' ? '10' : r}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-1.5 mt-2">
          {SUITS.map(([k, sym, color]) => {
            const dead = !rank || full || used.has(`${rank}${k}`.toLowerCase());
            return (
              <button key={k} disabled={dead} onClick={() => add(k)}
                className={`h-12 rounded-xl text-xl border border-line bg-ink-900 hover:bg-ink-600 transition disabled:opacity-25 ${color}`}>
                {sym}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-[auto_1fr] gap-2 mt-5">
          <button onClick={() => { setCards([]); setRank(null); }} className="btn-ghost h-12 px-4 text-sm">Clear</button>
          <button disabled={!valid} onClick={() => { onSave(cards); onClose(); }} className="btn-primary h-12 text-sm">
            {valid ? 'Save cards' : sizes && sizes.length > 1 ? 'Pick 3, 4 or 5 cards' : `Pick ${max} cards`}
          </button>
        </div>
      </div>
    </div>
  );
}
