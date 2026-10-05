import { useCallback, useEffect, useRef, useState } from 'react';

// A scripted hand that drives the same interface as useLiveSession, with no camera, mic or server.
// It exists so the product can be shown (and understood) in 30 seconds anywhere.

const base = { hand_number: 1, hero_cards: [], board_cards: [], street: 'preflop', pot: 150, to_call: 100, opponents: 2, hero_folded: false, small_blind: 50, big_blind: 100, recent_actions: [] };

const facts = (o) => ({ ok: true, equity_note: 'Simulated numbers for the demo.', ...o });

const SCRIPT = [
  { at: 600, coach: 'Coach online. Show me your cards.' },
  { at: 3200, tool: ['set_hero_cards', { cards: ['Ah', 'Kh'] }], state: { hero_cards: ['Ah', 'Kh'] },
    facts: facts({ equity_pct: 66.8, required_equity_pct: 40, to_call: 100, pot: 150, made_hand: 'AK suited', verdict_hint: 'Strong: raise for value, or at least call.' }) },
  { at: 4000, coach: 'Ace king of hearts. Got it.' },
  { at: 6800, user: 'Raise to three hundred.' },
  { at: 7700, tool: ['record_action', { actor: 'opp:Ravi', action: 'raise', amount: 300 }],
    state: { pot: 450, to_call: 200, opponents: 1, recent_actions: [{ actor: 'opp:Ravi', action: 'raise', amount: 300 }] },
    facts: facts({ equity_pct: 66.8, required_equity_pct: 30.8, to_call: 200, pot: 450, made_hand: 'AK suited', verdict_hint: 'Strong: raise for value, or at least call.' }) },
  { at: 10200, user: 'Coach, what should I do?' },
  { at: 11000, tool: ['get_decision_facts', {}], latency: 1400 },
  { at: 11600, coach: 'Raise. You’re about 67 percent against a random hand and only need 31 to call.' },
  { at: 15200, user: 'I’ll just call.' },
  { at: 16000, tool: ['record_action', { actor: 'hero', action: 'call', amount: 300 }],
    state: { pot: 650, to_call: 0, recent_actions: [{ actor: 'opp:Ravi', action: 'raise', amount: 300 }, { actor: 'hero', action: 'call', amount: 300 }] },
    facts: facts({ equity_pct: 66.8, required_equity_pct: 0, to_call: 0, pot: 650, made_hand: 'AK suited', verdict_hint: 'Strong: bet for value (about 2/3 pot).' }) },
  { at: 19000, tool: ['set_board', { cards: ['Qh', '7h', '2c'] }], state: { board_cards: ['Qh', '7h', '2c'], street: 'flop' },
    facts: facts({ equity_pct: 68.5, required_equity_pct: 0, to_call: 0, pot: 650, made_hand: 'High Card', verdict_hint: 'Strong: bet for value (about 2/3 pot).', outs: { count: 15, approx_hit_pct: 54 } }) },
  { at: 22000, user: 'Four hundred.' },
  { at: 22900, tool: ['record_action', { actor: 'opp:Ravi', action: 'bet', amount: 400 }],
    state: { pot: 1050, to_call: 400, recent_actions: [{ actor: 'opp:Ravi', action: 'raise', amount: 300 }, { actor: 'hero', action: 'call', amount: 300 }, { actor: 'opp:Ravi', action: 'bet', amount: 400 }] },
    facts: facts({ equity_pct: 68.5, required_equity_pct: 27.6, to_call: 400, pot: 1050, made_hand: 'High Card', verdict_hint: 'Strong: raise for value, or at least call.', outs: { count: 15, approx_hit_pct: 54 } }) },
  { at: 25500, user: 'What now?' },
  { at: 26300, tool: ['get_decision_facts', {}], latency: 1300 },
  { at: 26900, coach: 'Call or raise. Nut flush draw plus two overcards — fifteen outs, and you only need 28 percent.' },
];

export function useDemoSession() {
  const [status, setStatus] = useState('idle');
  const [state, setState] = useState(null);
  const [factsNow, setFacts] = useState(null);
  const [log, setLog] = useState([]);
  const [tools, setTools] = useState([]);
  const [notice, setNotice] = useState(null);
  const [level, setLevel] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [latency, setLatency] = useState(null);
  const [muted, setMuted] = useState(false);
  const timers = useRef([]);
  const idc = useRef(0);

  const clear = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  const later = (ms, fn) => timers.current.push(setTimeout(fn, ms));

  const say = useCallback((role, text) => {
    setLog((p) => [...p.slice(-40), { id: ++idc.current, role, text, done: true }]);
    if (role === 'coach') {
      setSpeaking(true);
      later(Math.min(4200, 900 + text.length * 45), () => setSpeaking(false));
    } else {
      setLevel(0.2);
      later(900, () => setLevel(0));
    }
  }, []);

  const stop = useCallback(() => {
    clear();
    setStatus('idle');
    setSpeaking(false);
    setLevel(0);
  }, [clear]);

  useEffect(() => clear, [clear]);

  const start = useCallback(() => {
    clear();
    setLog([]); setTools([]); setFacts(null); setNotice(null); setLatency(null); setMuted(false);
    setState(null);
    setStatus('connecting');
    later(500, () => { setStatus('live'); setState({ ...base }); });
    SCRIPT.forEach((s) => later(s.at, () => {
      if (s.coach) say('coach', s.coach);
      if (s.user) say('user', s.user);
      if (s.tool) setTools((p) => [...p.slice(-29), { id: ++idc.current, name: s.tool[0], args: s.tool[1], ok: true, at: Date.now() }]);
      if (s.state) setState((p) => ({ ...(p || base), ...s.state }));
      if (s.facts) setFacts(s.facts);
      if (s.latency) setLatency(s.latency);
    }));
  }, [clear, say]);

  const advise = useCallback(() => {
    setTools((p) => [...p.slice(-29), { id: ++idc.current, name: 'get_decision_facts', args: {}, ok: true, at: Date.now() }]);
    later(700, () => say('coach', 'This is a scripted demo. In a live session I’d give you the move for this exact spot.'));
  }, [say]);

  const setField = useCallback((field, value) => {
    setState((p) => (p ? { ...p, [field]: value, ...(field === 'board_cards' ? { street: ['preflop', 'preflop', 'preflop', 'flop', 'turn', 'river'][value.length] || 'preflop' } : {}) } : p));
  }, []);

  const newHand = useCallback(() => {
    clear();
    setFacts(null);
    setState((p) => ({ ...base, hand_number: (p?.hand_number || 1) + 1 }));
  }, [clear]);

  const noop = useCallback(() => {}, []);

  return {
    demo: true,
    status, state, facts: factsNow, log, tools, notice, level, speaking, latency, muted,
    start, stop, attachVideo: noop, advise, scan: noop, newHand, setField, pttStart: noop, pttEnd: noop, setMuted,
    clearNotice: () => setNotice(null),
  };
}
