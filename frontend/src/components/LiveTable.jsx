import React, { useEffect, useRef, useState } from 'react';
import { useLiveSession } from '../live/useLiveSession';
import CardDisplay from './CardDisplay';
import EquityMeter from './EquityMeter';

const STATUS = {
  idle: ['Ready', 'bg-[#1A2E1C] text-gray-300 border-[#2a452d]'],
  starting: ['Starting…', 'bg-yellow-950/60 text-yellow-300 border-yellow-700/50'],
  connecting: ['Connecting…', 'bg-yellow-950/60 text-yellow-300 border-yellow-700/50'],
  live: ['LIVE', 'bg-emerald-950/80 text-emerald-300 border-emerald-500/60'],
  reconnecting: ['Reconnecting…', 'bg-yellow-950/60 text-yellow-300 border-yellow-700/50'],
  closed: ['Disconnected', 'bg-red-950/60 text-red-300 border-red-700/50'],
  error: ['Error', 'bg-red-950/60 text-red-300 border-red-700/50'],
};

const parseCards = (txt) => txt.split(/[\s,]+/).filter(Boolean);

function Field({ label, value, version, onCommit, placeholder, width = 'w-full', mono = true }) {
  const [v, setV] = useState(value);
  // Reset to the server's value on every state push (even when unchanged), so a rejected edit reverts.
  useEffect(() => setV(value), [value, version]);
  const commit = () => {
    if (v !== value) onCommit(v);
  };
  return (
    <label className="flex flex-col gap-1 text-[11px] text-gray-400">
      {label}
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        placeholder={placeholder}
        className={`${width} ${mono ? 'font-mono' : ''} bg-[#0D1B0F] border border-[#2a452d] focus:border-[#00C853] rounded-lg px-2.5 py-1.5 text-sm text-gray-100 outline-none`}
      />
    </label>
  );
}

export default function LiveTable() {
  const live = useLiveSession();
  const videoRef = useRef(null);
  const [mode, setMode] = useState('auto'); // auto = hands-free, ptt = push to talk
  const [earbuds, setEarbuds] = useState(false);
  const [code, setCode] = useState(() => {
    try { return localStorage.getItem('pokerlens_code') || ''; } catch (e) { return ''; }
  });

  const { status } = live;
  const running = ['starting', 'connecting', 'live', 'reconnecting'].includes(status);
  const isLive = status === 'live';
  const [label, cls] = STATUS[status] || STATUS.idle;
  const s = live.state;
  const f = live.facts;

  const begin = () => {
    try { localStorage.setItem('pokerlens_code', code); } catch (e) {}
    live.start({ videoEl: videoRef.current, mode, code, fullDuplex: earbuds });
  };

  // Spacebar = push to talk (when that mode is on and the user isn't typing)
  useEffect(() => {
    if (mode !== 'ptt' || !isLive) return undefined;
    const typing = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    const down = (e) => { if (e.code === 'Space' && !e.repeat && !typing()) { e.preventDefault(); live.pttStart(); } };
    const up = (e) => { if (e.code === 'Space' && !typing()) { e.preventDefault(); live.pttEnd(); } };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [mode, isLive, live.pttStart, live.pttEnd]);

  const cards = s ? { hero_cards: s.hero_cards, board_cards: s.board_cards, street: s.street, confidence: 'high' } : null;

  return (
    <div className="min-h-screen bg-[#0D1B0F] text-gray-100">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 flex flex-col gap-5">
        {/* Control bar */}
        <div className="flex flex-wrap items-center gap-3 bg-[#1A2E1C] border border-[#2a452d] rounded-xl p-3">
          {!running ? (
            <button onClick={begin} className="bg-[#00C853] hover:bg-[#00b34a] text-black font-extrabold px-5 py-2.5 rounded-lg text-sm shadow-lg">
              ▶ Start Live Coach
            </button>
          ) : (
            <button onClick={live.stop} className="bg-red-600 hover:bg-red-500 text-white font-bold px-5 py-2.5 rounded-lg text-sm">
              ■ Stop
            </button>
          )}
          <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${cls} ${isLive ? 'animate-pulse' : ''}`}>{label}</span>

          <div className="flex rounded-lg overflow-hidden border border-[#2a452d] text-xs">
            {[['auto', 'Hands-free'], ['ptt', 'Push-to-talk']].map(([k, t]) => (
              <button
                key={k}
                disabled={running}
                onClick={() => setMode(k)}
                className={`px-3 py-1.5 ${mode === k ? 'bg-[#00C853] text-black font-bold' : 'bg-[#0D1B0F] text-gray-300'} disabled:opacity-60`}
              >
                {t}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-1.5 text-xs text-gray-300" title="Tick if you wear earbuds/headset. Otherwise the mic pauses while the coach talks so it can't hear itself.">
            <input type="checkbox" checked={earbuds} disabled={running} onChange={(e) => setEarbuds(e.target.checked)} />
            Earbuds
          </label>

          <input
            type="password"
            value={code}
            disabled={running}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Access code (if set)"
            className="ml-auto w-40 bg-[#0D1B0F] border border-[#2a452d] rounded-lg px-2.5 py-1.5 text-xs text-gray-100 outline-none"
          />
        </div>

        {live.notice && (
          <div className="bg-red-950/80 border border-red-500/70 text-red-200 px-4 py-3 rounded-xl flex items-start justify-between gap-3 text-sm">
            <span>⚠️ {live.notice}</span>
            <button onClick={live.clearNotice} className="text-red-300 hover:text-white text-xs">✕</button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left: camera + controls */}
          <div className="lg:col-span-5 flex flex-col gap-3">
            <div className={`relative rounded-xl overflow-hidden bg-black aspect-[4/3] border-2 ${isLive ? 'border-[#00C853] shadow-[0_0_24px_rgba(0,200,83,0.25)]' : 'border-[#2a452d]'}`}>
              <video ref={videoRef} playsInline muted autoPlay className="w-full h-full object-cover" />
              {!running && (
                <div className="absolute inset-0 flex items-center justify-center text-center text-sm text-gray-400 p-6">
                  Press Start, allow camera + microphone, then hold your two cards up to the camera for a second.
                </div>
              )}
              {live.speaking && (
                <span className="absolute top-2 left-2 text-[11px] bg-black/70 text-[#00C853] border border-[#00C853]/50 px-2 py-0.5 rounded-full animate-pulse">🔊 Coach speaking</span>
              )}
              {live.muted && running && (
                <span className="absolute top-2 right-2 text-[11px] bg-black/70 text-red-300 border border-red-500/50 px-2 py-0.5 rounded-full">🎙 Muted</span>
              )}
            </div>

            <div className="h-2 bg-[#1A2E1C] rounded-full overflow-hidden border border-[#2a452d]" title="Microphone level">
              <div className="h-full bg-[#00C853] transition-all duration-100" style={{ width: `${Math.min(100, live.level * 400)}%` }} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button disabled={!isLive} onClick={live.scan} className="bg-[#1A2E1C] hover:bg-[#233f26] border border-[#2a452d] rounded-lg py-2.5 text-sm font-semibold disabled:opacity-40">📷 Scan table</button>
              <button disabled={!running} onClick={() => live.setMuted(!live.muted)} className="bg-[#1A2E1C] hover:bg-[#233f26] border border-[#2a452d] rounded-lg py-2.5 text-sm font-semibold disabled:opacity-40">{live.muted ? '🎙 Unmute' : '🔇 Mute mic'}</button>
            </div>

            {mode === 'ptt' && (
              <button
                disabled={!isLive}
                onPointerDown={live.pttStart}
                onPointerUp={live.pttEnd}
                onPointerLeave={live.pttEnd}
                className="select-none touch-none bg-[#0D1B0F] active:bg-[#00C853] active:text-black border-2 border-[#00C853]/60 rounded-xl py-5 text-sm font-bold disabled:opacity-40"
              >
                🎤 Hold to talk (or hold Space)
              </button>
            )}

            <p className="text-[11px] text-gray-500 leading-relaxed">
              Say <b className="text-gray-300">“Coach, what should I do?”</b> or press Advise. It stays silent during table talk, tracks cards and bets quietly, and corrects itself when you fix a value on the right.
            </p>
          </div>

          {/* Right: table state + coach */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <button
              disabled={!isLive}
              onClick={live.advise}
              className="w-full bg-[#00C853] hover:bg-[#00b34a] text-black font-extrabold py-4 rounded-xl text-base shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ⚡ My turn — advise me
            </button>

            {cards && <CardDisplay cards={cards} showConfidence={false} />}

            {f && <EquityMeter equity={f.equity_pct} />}
            {f && (
              <div className="bg-[#1A2E1C] border border-[#2a452d] rounded-xl p-3 text-xs text-gray-300 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div><div className="text-gray-500">Hand</div><div className="font-semibold text-gray-100">{f.made_hand}</div></div>
                <div><div className="text-gray-500">Needed to call</div><div className="font-semibold text-gray-100">{f.to_call > 0 ? `${f.required_equity_pct}%` : '—'}</div></div>
                <div><div className="text-gray-500">Outs</div><div className="font-semibold text-gray-100">{f.outs ? `${f.outs.count} (~${f.outs.approx_hit_pct}%)` : '—'}</div></div>
                <div><div className="text-gray-500">Read</div><div className="font-semibold text-yellow-300">{f.verdict_hint?.split(':')[0]}</div></div>
              </div>
            )}

            {/* Tap-to-fix state */}
            <div className="bg-[#1A2E1C] border border-[#2a452d] rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">Table state <span className="text-[11px] font-normal text-gray-500">— edit anything the coach got wrong</span></h3>
                <button disabled={!isLive} onClick={live.newHand} className="text-xs bg-[#0D1B0F] border border-[#2a452d] hover:border-[#00C853] rounded-lg px-3 py-1.5 disabled:opacity-40">New hand</button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <Field label="Your cards" version={s} value={(s?.hero_cards || []).join(' ')} placeholder="Qh Kd" onCommit={(v) => live.setField('hero_cards', parseCards(v))} />
                <Field label="Board" version={s} value={(s?.board_cards || []).join(' ')} placeholder="7c 2d 9s" onCommit={(v) => live.setField('board_cards', parseCards(v))} />
                <Field label="Pot" version={s} value={s ? String(s.pot) : ''} placeholder="0" onCommit={(v) => live.setField('pot', Number(v))} />
                <Field label="To call" version={s} value={s ? String(s.to_call) : ''} placeholder="0" onCommit={(v) => live.setField('to_call', Number(v))} />
                <Field label="Opponents" version={s} value={s ? String(s.opponents) : ''} placeholder="1" onCommit={(v) => live.setField('opponents', Number(v))} />
              </div>
              {s?.recent_actions?.length > 0 && (
                <div className="text-[11px] text-gray-400 font-mono flex flex-wrap gap-x-3 gap-y-1">
                  {s.recent_actions.map((a, i) => (
                    <span key={i}>{a.actor.replace('opp:', '')} {a.action}{a.amount != null ? ` ${a.amount}` : ''}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Conversation */}
            <div className="bg-[#1A2E1C] border border-[#2a452d] rounded-xl p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">Conversation</h3>
                {live.latency != null && <span className="text-[11px] text-gray-400">last reply ≈ {(live.latency / 1000).toFixed(1)}s</span>}
              </div>
              <div className="max-h-56 overflow-y-auto flex flex-col gap-1.5 text-sm">
                {live.log.length === 0 && <p className="text-gray-500 text-xs">What the coach hears and says appears here.</p>}
                {live.log.map((m) => (
                  <p key={m.id} className={m.role === 'coach' ? 'text-[#00C853] font-medium' : 'text-gray-400 italic'}>
                    {m.role === 'coach' ? '🎯 ' : '👂 '}{m.text}
                  </p>
                ))}
              </div>
              {live.tools.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-[#2a452d]">
                  {live.tools.map((t) => (
                    <span key={t.id} title={t.error || ''} className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${t.ok ? 'border-[#2a452d] text-gray-400' : 'border-red-700/60 text-red-300'}`}>
                      {t.ok ? '✓' : '✕'} {t.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
