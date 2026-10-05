// Presentation helpers shared by the live screens.

export const fmt = (n) => (n == null || Number.isNaN(Number(n)) ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }));

export const STREETS = ['preflop', 'flop', 'turn', 'river'];

// Turn the engine's verdict hint into one glanceable word + a supporting line.
export function readVerdict(facts) {
  if (!facts || !facts.verdict_hint) return null;
  const hint = facts.verdict_hint;
  const h = hint.toLowerCase();
  const free = !(facts.to_call > 0);
  let word = 'Check';
  let tone = 'amber';
  if (h.startsWith('fold')) { word = 'Fold'; tone = 'coral'; }
  else if (h.startsWith('profitable')) { word = 'Call'; tone = 'mint'; }
  else if (h.startsWith('marginal')) { word = 'Close call'; tone = 'amber'; }
  else if (h.startsWith('strong')) { word = free ? 'Bet' : 'Raise'; tone = 'mint'; }
  else if (h.startsWith('medium')) { word = 'Check'; tone = 'amber'; }
  else if (h.startsWith('weak')) { word = 'Check'; tone = 'coral'; }
  const i = hint.indexOf(':');
  let detail = (i >= 0 ? hint.slice(i + 1) : hint).trim();
  detail = detail.charAt(0).toUpperCase() + detail.slice(1);
  return { word, tone, detail };
}

export const TONE = {
  mint: { text: 'text-mint', bg: 'bg-mint', soft: 'bg-mint/10 border-mint/30', hex: '#2EE59D' },
  amber: { text: 'text-amber', bg: 'bg-amber', soft: 'bg-amber/10 border-amber/30', hex: '#F5B84A' },
  coral: { text: 'text-coral', bg: 'bg-coral', soft: 'bg-coral/10 border-coral/30', hex: '#FF6B6B' },
};

// What the model did, in words a person at the table would use.
const TOOL_LABEL = {
  set_hero_cards: 'Read your cards',
  set_board: 'Read the board',
  record_action: 'Logged an action',
  set_pot: 'Updated the pot',
  set_to_call: 'Updated the bet to call',
  set_opponents: 'Counted the players',
  new_hand: 'Started a new hand',
  get_decision_facts: 'Ran the odds',
};
export const toolLabel = (name) => TOOL_LABEL[name] || name;

export function toolArgs(args) {
  if (!args || typeof args !== 'object') return '';
  return Object.values(args)
    .map((v) => (Array.isArray(v) ? v.join(' ') : String(v)))
    .join(', ');
}

export const actorName = (a) => (a === 'hero' ? 'You' : String(a || '').replace('opp:', '') || 'Opponent');

// The single next thing the player should do, derived from table state.
export function nextStep(state, { ptt } = {}) {
  const ask = ptt ? 'Hold the talk button and ask' : 'Ask “what should I do?”';
  if (!state) return { n: 0, title: 'Connecting to your coach…', body: 'This takes a few seconds.' };
  const hero = state.hero_cards?.length || 0;
  const board = state.board_cards?.length || 0;
  if (state.hero_folded) return { n: 4, title: 'You folded this hand', body: 'Tap New hand when the next one is dealt.' };
  if (hero < 2) return { n: 1, title: 'Show your two cards to the camera', body: 'Hold them steady for a second, faces toward the lens.' };
  if (board === 0) return { n: 2, title: 'Play the hand out loud', body: `Say the bets as they happen. ${ask} whenever it’s your turn.` };
  if (board < 5) return { n: 3, title: 'Keep the board in view', body: `New cards are picked up automatically. ${ask} any time.` };
  return { n: 3, title: 'River is out', body: `${ask}, then tap New hand for the next deal.` };
}
