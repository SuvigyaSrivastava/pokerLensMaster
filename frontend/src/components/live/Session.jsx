import React, { useEffect, useRef, useState } from 'react';
import { Icon, Logo, MicBars } from './ui';
import PlayingCard from './PlayingCard';
import CardPicker from './CardPicker';
import { STREETS, TONE, actorName, fmt, nextStep, readVerdict, toolArgs, toolLabel } from '../../live/format';

const clock = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export default function Session({ live, settings }) {
  const { status, state: s, facts: f } = live;
  const isLive = status === 'live';
  const ptt = settings.mode === 'ptt' && !live.demo;
  const [picker, setPicker] = useState(null); // 'hero' | 'board'
  const [held, setHeld] = useState(false);
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setSecs((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Notices are transient: show, then get out of the way.
  useEffect(() => {
    if (!live.notice) return undefined;
    const t = setTimeout(live.clearNotice, 7000);
    return () => clearTimeout(t);
  }, [live.notice]);

  // Spacebar = push to talk on a laptop.
  useEffect(() => {
    if (!ptt || !isLive) return undefined;
    const typing = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    const down = (e) => { if (e.code === 'Space' && !e.repeat && !typing()) { e.preventDefault(); setHeld(true); live.pttStart(); } };
    const up = (e) => { if (e.code === 'Space' && !typing()) { e.preventDefault(); setHeld(false); live.pttEnd(); } };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [ptt, isLive, live.pttStart, live.pttEnd]);

  const hero = s?.hero_cards || [];
  const board = s?.board_cards || [];
  const step = nextStep(isLive ? s : null, { ptt });

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <Header live={live} secs={secs} />

      <main className="flex-1 w-full max-w-6xl mx-auto px-3 sm:px-6 pt-3 pb-36 flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-5 lg:items-start">
        <div className="contents lg:flex lg:flex-col lg:gap-5">
          <div className="order-1 lg:order-none">
            <Stage live={live} step={step} ptt={ptt} held={held} hero={hero} board={board} />
          </div>
          <div className="order-4 lg:order-none">
            <Feed live={live} />
          </div>
        </div>
        <div className="contents lg:flex lg:flex-col lg:gap-5">
          <div className="order-2 lg:order-none">
            <Verdict facts={f} state={s} ptt={ptt} />
          </div>
          <div className="order-3 lg:order-none">
            <Table state={s} live={live} isLive={isLive} onPick={setPicker} />
          </div>
        </div>
      </main>

      {live.notice && (
        <div role="alert" className="fixed top-16 inset-x-3 sm:inset-x-auto sm:right-6 sm:w-96 z-40 flex items-start gap-3 rounded-2xl border border-amber/30 bg-ink-700/95 backdrop-blur p-3.5 shadow-card animate-rise">
          <Icon name="alert" className="text-amber shrink-0 mt-0.5" />
          <p className="flex-1 text-sm">{live.notice}</p>
          <button onClick={live.clearNotice} aria-label="Dismiss" className="text-fg-muted hover:text-fg"><Icon name="x" size={16} /></button>
        </div>
      )}

      <Dock live={live} isLive={isLive} ptt={ptt} held={held} setHeld={setHeld} />

      {picker === 'hero' && (
        <CardPicker title="Your cards" hint="Fix what the camera read, or enter them by hand." max={2} value={hero} taken={board}
          onSave={(c) => live.setField('hero_cards', c)} onClose={() => setPicker(null)} />
      )}
      {picker === 'board' && (
        <CardPicker title="Board" hint="Flop is three cards, then one each for the turn and river." max={5} value={board} taken={hero}
          onSave={(c) => live.setField('board_cards', c)} onClose={() => setPicker(null)} />
      )}
    </div>
  );
}

function Header({ live, secs }) {
  const { status } = live;
  const pill = live.demo
    ? ['bg-amber', 'text-amber', 'Demo']
    : status === 'live' ? ['bg-mint', 'text-mint', 'Live']
    : status === 'reconnecting' ? ['bg-amber animate-pulse', 'text-amber', 'Reconnecting']
    : ['bg-fg-dim animate-pulse', 'text-fg-muted', 'Connecting'];
  return (
    <header className="sticky top-0 z-30 bg-ink/85 backdrop-blur border-b border-line">
      <div className="max-w-6xl mx-auto h-14 px-3 sm:px-6 flex items-center gap-3">
        <Logo compact />
        <span className="flex items-center gap-2 rounded-full bg-ink-700 border border-line pl-2.5 pr-3 py-1.5" aria-live="polite">
          <span className="relative flex w-2 h-2">
            {status === 'live' && <span className={`absolute inset-0 rounded-full ${pill[0]} animate-ring`} />}
            <span className={`relative w-2 h-2 rounded-full ${pill[0]}`} />
          </span>
          <span className={`text-xs font-semibold ${pill[1]}`}>{pill[2]}</span>
          <span className="num text-xs text-fg-muted">{clock(secs)}</span>
        </span>
        {live.latency != null && (
          <span className="hidden sm:inline-flex chip" title="Time from the end of your question to the first sound of the answer">
            <Icon name="bolt" size={12} filled className="text-mint" /><span className="num">{(live.latency / 1000).toFixed(1)}s</span> reply
          </span>
        )}
        <button onClick={live.stop} className="ml-auto btn h-9 px-4 text-sm bg-coral/10 text-coral border border-coral/25 hover:bg-coral/20">End</button>
      </div>
    </header>
  );
}

function Stage({ live, step, ptt, held, hero, board }) {
  const [flash, setFlash] = useState(null);
  const lastTool = live.tools[live.tools.length - 1];
  useEffect(() => {
    if (!lastTool || !lastTool.ok || !['set_hero_cards', 'set_board'].includes(lastTool.name)) return undefined;
    setFlash(toolLabel(lastTool.name));
    const t = setTimeout(() => setFlash(null), 2200);
    return () => clearTimeout(t);
  }, [lastTool?.id]);

  const listening = !live.muted && (!ptt || held);
  const chip = live.speaking
    ? <span className="chip !bg-mint !text-mint-ink !border-mint font-semibold"><Icon name="volume" size={13} />Coach speaking</span>
    : live.muted
      ? <span className="chip !text-coral !border-coral/30"><Icon name="micOff" size={13} />Mic off</span>
      : <span className="chip !bg-black/60 backdrop-blur !text-fg"><MicBars level={live.level} active={listening} className="text-mint" />{listening ? 'Listening' : 'Hold to talk'}</span>;

  return (
    <section className={`relative overflow-hidden rounded-2xl bg-black border aspect-[16/10] lg:aspect-[4/3] transition-shadow ${live.speaking ? 'border-mint/60 shadow-glow' : 'border-line'}`}>
      {live.demo ? (
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,#14503a_0%,#0b2a20_55%,#06140f_100%)] grid place-items-center">
          <div className="flex flex-col items-center gap-3 -mt-8">
            <div className="flex gap-1.5 min-h-[52px]">{board.map((c) => <PlayingCard key={c} card={c} size="sm" />)}</div>
            <div className="flex gap-1.5 min-h-[52px] rotate-[-3deg]">{hero.map((c) => <PlayingCard key={c} card={c} size="sm" />)}</div>
          </div>
          <span className="absolute top-3 right-3 chip !bg-black/50">Simulated</span>
        </div>
      ) : (
        <video ref={live.attachVideo} playsInline muted autoPlay className="absolute inset-0 w-full h-full object-cover" />
      )}

      <div className="absolute top-3 left-3">{chip}</div>

      {flash && (
        <div className="absolute inset-x-0 top-14 flex justify-center animate-rise">
          <span className="flex items-center gap-2 rounded-full bg-mint text-mint-ink font-semibold text-sm px-4 py-2 shadow-glow"><Icon name="check" size={16} />{flash}</span>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 p-3 pt-10 bg-gradient-to-t from-black/90 via-black/60 to-transparent">
        <div className="flex items-start gap-3" aria-live="polite">
          {step.n > 0 && <span className="num shrink-0 grid place-items-center w-6 h-6 rounded-full bg-white text-black text-xs font-bold">{step.n}</span>}
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">{step.title}</p>
            <p className="text-xs text-white/70 mt-0.5 leading-snug">{step.body}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Verdict({ facts, state, ptt }) {
  const v = readVerdict(facts);
  const haveCards = (state?.hero_cards?.length || 0) === 2;

  if (!v) {
    return (
      <section className="panel p-5">
        <p className="eyebrow">The move</p>
        <p className="mt-2 text-2xl font-bold tracking-tight text-fg-muted">{haveCards ? 'Working out the odds…' : 'Waiting for your cards'}</p>
        <p className="mt-1.5 text-sm text-fg-dim leading-snug">
          {haveCards ? 'One moment.' : 'Your win chance, the price to call and the recommended move appear here as soon as your cards are read.'}
        </p>
      </section>
    );
  }

  const tone = TONE[v.tone];
  const eq = Math.max(0, Math.min(100, Number(facts.equity_pct) || 0));
  const need = Number(facts.required_equity_pct) || 0;
  const facing = facts.to_call > 0;
  const edge = eq - need;

  return (
    <section className={`panel p-5 border ${tone.soft} transition-colors`}>
      <div className="flex items-center justify-between">
        <p className="eyebrow">The move</p>
        <p className="text-[11px] text-fg-dim">{ptt ? 'Hold talk and ask for the reasoning' : 'Ask out loud for the reasoning'}</p>
      </div>

      <div className="mt-1.5 flex items-end justify-between gap-4">
        <p key={v.word} className={`text-[54px] leading-none font-extrabold tracking-[-0.04em] animate-rise ${tone.text}`}>{v.word}</p>
        <p className="text-right leading-tight pb-1">
          <span className="num block text-3xl font-bold">{eq.toFixed(0)}<span className="text-lg text-fg-muted">%</span></span>
          <span className="text-xs text-fg-muted">chance to win</span>
        </p>
      </div>
      <p className="mt-2 text-sm text-fg-muted leading-snug">{v.detail}</p>

      <div className="mt-4">
        <div className="relative h-2.5 rounded-full bg-ink-500">
          <div className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out ${tone.bg}`} style={{ width: `${eq}%` }} />
          {facing && <div className="absolute -inset-y-1.5 w-[3px] rounded bg-white shadow-[0_0_0_2px_#111316]" style={{ left: `calc(${Math.min(99, need)}% - 1.5px)` }} />}
        </div>
        <div className="flex justify-between mt-2 text-xs text-fg-muted">
          {facing
            ? <><span>You need <b className="num text-fg">{need.toFixed(0)}%</b> to call {fmt(facts.to_call)}</span><span className={`num font-semibold ${edge >= 0 ? 'text-mint' : 'text-coral'}`}>{edge >= 0 ? '+' : ''}{edge.toFixed(0)} pts</span></>
            : <span>Nothing to call — you can check for free</span>}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2">
        <Mini label="You hold" value={facts.made_hand} sub={state?.street} cap />
        <Mini label="Outs" value={facts.outs ? `${facts.outs.count}` : '—'} sub={facts.outs ? `≈${facts.outs.approx_hit_pct}% to hit` : 'no draw'} />
        <Mini label="Against" value={`${state?.opponents ?? facts.opponents ?? 1}`} sub={(state?.opponents ?? 1) === 1 ? 'player' : 'players'} />
      </dl>
      <p className="mt-3 text-[11px] text-fg-dim leading-snug">Win chance is simulated against random hands, so treat it as a baseline rather than a read on your opponents.</p>
    </section>
  );
}

function Mini({ label, value, sub, cap }) {
  return (
    <div className="rounded-xl bg-ink-900/60 border border-line px-3 py-2.5 min-w-0">
      <dt className="text-[11px] text-fg-dim">{label}</dt>
      <dd className={`text-sm font-semibold truncate mt-0.5 ${cap ? 'first-letter:uppercase' : 'num'}`}>{value}</dd>
      {sub && <p className="text-[11px] text-fg-muted truncate">{sub}</p>}
    </div>
  );
}

function Table({ state: s, live, isLive, onPick }) {
  const hero = s?.hero_cards || [];
  const board = s?.board_cards || [];
  const street = STREETS.indexOf(s?.street || 'preflop');
  const actions = s?.recent_actions || [];
  const off = !isLive;

  return (
    <section className="panel p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5" aria-label={`Street: ${s?.street || 'preflop'}`}>
          {STREETS.map((name, i) => (
            <span key={name} className={`text-[11px] font-semibold uppercase tracking-wider px-1.5 sm:px-2 py-1 rounded-md transition ${i === street ? 'bg-fg text-ink' : i < street ? 'text-fg-muted' : 'text-fg-dim/60'}`}>{name}</span>
          ))}
        </div>
        <button disabled={off} onClick={live.newHand} className="btn-ghost h-8 px-3 text-xs whitespace-nowrap shrink-0"><Icon name="refresh" size={13} />New hand</button>
      </div>

      <div className="mt-4 flex items-end gap-2.5 sm:gap-4 overflow-x-auto scroll-slim pb-1">
        <div>
          <p className="eyebrow mb-2">You</p>
          <div className="flex gap-1.5">
            {[0, 1].map((i) => <PlayingCard key={`${i}${hero[i] || ''}`} card={hero[i]} onClick={off ? undefined : () => onPick('hero')} label="Edit your cards" />)}
          </div>
        </div>
        <span className="w-px self-stretch bg-line mt-6" />
        <div>
          <p className="eyebrow mb-2">Board</p>
          <div className="flex gap-1.5">
            {[0, 1, 2, 3, 4].map((i) => <PlayingCard key={`${i}${board[i] || ''}`} card={board[i]} onClick={off ? undefined : () => onPick('board')} label="Edit the board" />)}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="Pot" value={s?.pot} disabled={off} onCommit={(v) => live.setField('pot', v)} />
        <Stat label="To call" value={s?.to_call} disabled={off} accent={s?.to_call > 0} onCommit={(v) => live.setField('to_call', v)} />
        <Stepper label="Opponents" value={s?.opponents ?? 1} disabled={off} onChange={(v) => live.setField('opponents', v)} />
      </div>

      {actions.length > 0 && (
        <div className="mt-4 flex gap-1.5 overflow-x-auto scroll-slim pb-1" aria-label="Recent actions">
          {actions.map((a, i) => (
            <span key={i} className={`chip shrink-0 ${a.actor === 'hero' ? '!text-mint !border-mint/25' : ''}`}>
              {actorName(a.actor)} <span className="text-fg">{a.action}</span>{a.amount != null && <span className="num text-fg">{fmt(a.amount)}</span>}
            </span>
          ))}
        </div>
      )}
      <p className="mt-3 text-[11px] text-fg-dim flex items-center gap-1.5"><Icon name="pencil" size={12} />Tap any card or number to correct it. Your fix always wins.</p>
    </section>
  );
}

function Stat({ label, value, onCommit, disabled, accent }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState('');
  const ref = useRef(null);
  useEffect(() => { if (editing) ref.current?.select(); }, [editing]);
  const commit = () => {
    setEditing(false);
    const n = Number(v);
    if (v !== '' && !Number.isNaN(n) && n !== Number(value)) onCommit(n);
  };
  return (
    <div className="rounded-xl bg-ink-900/60 border border-line px-3 py-2.5">
      <p className="text-[11px] text-fg-dim">{label}</p>
      {editing ? (
        <input ref={ref} value={v} inputMode="decimal" aria-label={label} onChange={(e) => setV(e.target.value.replace(/[^\d.]/g, ''))} onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditing(false); }}
          className="num w-full bg-transparent text-xl font-bold outline-none border-b border-mint" />
      ) : (
        <button disabled={disabled} onClick={() => { setV(value == null ? '' : String(value)); setEditing(true); }}
          className={`num block w-full text-left text-xl font-bold truncate ${accent ? 'text-amber' : ''}`}>{fmt(value)}</button>
      )}
    </div>
  );
}

function Stepper({ label, value, onChange, disabled }) {
  const b = 'grid place-items-center w-7 h-7 rounded-lg bg-ink-600 border border-line hover:bg-ink-500 disabled:opacity-30';
  return (
    <div className="rounded-xl bg-ink-900/60 border border-line px-3 py-2.5">
      <p className="text-[11px] text-fg-dim">{label}</p>
      <div className="flex items-center justify-between gap-1">
        <span className="num text-xl font-bold">{value}</span>
        <span className="flex gap-1">
          <button className={b} disabled={disabled || value <= 1} onClick={() => onChange(value - 1)} aria-label="Fewer opponents"><Icon name="minus" size={14} /></button>
          <button className={b} disabled={disabled || value >= 8} onClick={() => onChange(value + 1)} aria-label="More opponents"><Icon name="plus" size={14} /></button>
        </span>
      </div>
    </div>
  );
}

function Feed({ live }) {
  const [tab, setTab] = useState('talk');
  const end = useRef(null);
  useEffect(() => { end.current?.scrollTo({ top: end.current.scrollHeight, behavior: 'smooth' }); }, [live.log, live.tools, tab]);
  const tabs = [['talk', 'Conversation', live.log.length], ['hood', 'Under the hood', live.tools.length]];

  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center gap-1 px-2 pt-2" role="tablist">
        {tabs.map(([k, label, n]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition ${tab === k ? 'bg-ink-600 text-fg' : 'text-fg-muted hover:text-fg'}`}>
            {label}{n > 0 && <span className="num ml-1.5 text-[11px] text-fg-dim">{n}</span>}
          </button>
        ))}
      </div>
      <div ref={end} className="h-56 lg:h-64 overflow-y-auto scroll-slim px-4 py-3">
        {tab === 'talk' ? (
          live.log.length === 0 ? <Empty icon="ear" text="What the coach hears and says shows up here." /> : (
            <ul className="flex flex-col gap-2">
              {live.log.map((m) => (
                <li key={m.id} className={`max-w-[88%] rounded-2xl px-3.5 py-2 text-sm leading-snug animate-rise ${m.role === 'coach' ? 'self-start bg-mint/10 border border-mint/20 rounded-bl-md' : 'self-end bg-ink-600 border border-line text-fg-muted rounded-br-md'}`}>
                  <span className={`block text-[10px] font-semibold uppercase tracking-wider mb-0.5 ${m.role === 'coach' ? 'text-mint' : 'text-fg-dim'}`}>{m.role === 'coach' ? 'Coach' : 'Heard at the table'}</span>
                  {m.text}
                </li>
              ))}
            </ul>
          )
        ) : (
          live.tools.length === 0 ? <Empty icon="code" text="Every time the AI reads a card or logs a bet, the exact call it made is listed here." /> : (
            <ul className="flex flex-col">
              {live.tools.map((t) => (
                <li key={t.id} className="flex items-start gap-3 py-2 border-b border-white/[0.05] last:border-0 animate-rise">
                  <span className={`mt-0.5 grid place-items-center w-5 h-5 rounded-full shrink-0 ${t.ok ? 'bg-mint/15 text-mint' : 'bg-coral/15 text-coral'}`}><Icon name={t.ok ? 'check' : 'x'} size={12} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{toolLabel(t.name)}{!t.ok && <span className="text-coral"> — rejected</span>}</p>
                    <p className="font-mono text-[11px] text-fg-dim truncate">{t.name}({toolArgs(t.args)})</p>
                    {t.error && <p className="text-xs text-coral mt-0.5">{t.error}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )
        )}
      </div>
      {tab === 'hood' && <p className="px-4 pb-3 text-[11px] text-fg-dim leading-snug">The AI never does the maths. It reports what it saw and heard; the poker engine validates each call and computes the odds.</p>}
    </section>
  );
}

function Empty({ icon, text }) {
  return (
    <div className="h-full grid place-items-center text-center">
      <div className="max-w-[240px]"><Icon name={icon} size={22} className="mx-auto text-fg-dim" /><p className="text-sm text-fg-dim mt-2 leading-snug">{text}</p></div>
    </div>
  );
}

function Dock({ live, isLive, ptt, held, setHeld }) {
  const side = 'btn-ghost flex-col !gap-1 h-16 w-[72px] text-[11px] font-medium shrink-0';
  const press = () => { setHeld(true); live.pttStart(); };
  const release = () => { if (held) { setHeld(false); live.pttEnd(); } };
  return (
    <div className="fixed bottom-0 inset-x-0 z-30 bg-gradient-to-t from-ink via-ink/95 to-transparent pt-6 safe-b">
      <div className="max-w-xl mx-auto px-3 flex items-stretch gap-2">
        <button disabled={!isLive || live.demo} onClick={live.scan} className={side} title="Look at the table again now"><Icon name="scan" size={20} />Rescan</button>
        {ptt ? (
          <button disabled={!isLive} onPointerDown={press} onPointerUp={release} onPointerLeave={release} onPointerCancel={release} onContextMenu={(e) => e.preventDefault()}
            className={`btn flex-1 h-16 text-base touch-none ${held ? 'bg-mint text-mint-ink shadow-glow scale-[.98]' : 'bg-ink-600 text-fg border-2 border-mint/50'}`}>
            <Icon name="mic" size={20} />{held ? 'Listening… release to send' : 'Hold to talk'}
          </button>
        ) : (
          <button disabled={!isLive} onClick={live.advise} className="btn-primary flex-1 h-16 text-base shadow-glow">
            <Icon name="bolt" size={20} filled />What should I do?
          </button>
        )}
        {ptt ? (
          <button disabled={!isLive} onClick={live.advise} className={side}><Icon name="bolt" size={20} />Advise</button>
        ) : (
          <button disabled={live.demo} onClick={() => live.setMuted(!live.muted)} aria-pressed={live.muted} className={`${side} ${live.muted ? '!text-coral !border-coral/30' : ''}`}>
            <Icon name={live.muted ? 'micOff' : 'mic'} size={20} />{live.muted ? 'Unmute' : 'Mute'}
          </button>
        )}
      </div>
    </div>
  );
}
