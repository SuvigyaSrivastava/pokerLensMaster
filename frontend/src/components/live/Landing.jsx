import React, { useEffect, useState } from 'react';
import { API } from '../../live/useLiveSession';
import { Icon, Logo, Segmented, Toggle } from './ui';
import PlayingCard from './PlayingCard';

const STEPS = [
  ['camera', 'Show your cards', 'Hold your two cards up to the camera once. It reads them back to you.'],
  ['ear', 'Play out loud', 'It listens to the bets and watches the flop, turn and river land. Nothing to tap.'],
  ['bolt', 'Ask for the move', 'Say “what should I do?” and hear the answer. The odds are on screen if you want to check its work.'],
];

// The free backend sleeps when idle. Wake it while the person reads, and name the exact problem
// (asleep / no API key / this site not allowed) before they press Start instead of failing afterwards.
function useServerStatus() {
  const [s, setS] = useState('checking'); // checking | waking | ready | nokey | blocked | down
  useEffect(() => {
    let dead = false;
    let timer;
    const began = Date.now();
    const slow = setTimeout(() => !dead && setS((p) => (p === 'checking' ? 'waking' : p)), 2500);
    const get = async (mode) => {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 20000);
      try { return await fetch(`${API}/health`, { mode, cache: 'no-store', signal: ctl.signal }); } finally { clearTimeout(t); }
    };
    const ping = async () => {
      try {
        const body = await (await get('cors')).json();
        if (!dead) setS(body.live_ready === false ? 'nokey' : 'ready');
        return;
      } catch (e) { /* asleep, offline, or CORS refused: tell them apart below */ }
      try {
        await get('no-cors'); // reachable, but it would not let this page read the answer
        if (!dead) setS('blocked');
      } catch (e) {
        if (dead) return;
        setS(Date.now() - began > 75000 ? 'down' : 'waking');
        timer = setTimeout(ping, 4000);
      }
    };
    ping();
    return () => { dead = true; clearTimeout(slow); clearTimeout(timer); };
  }, []);
  return s;
}

const SERVER = {
  checking: ['bg-fg-dim', 'Checking the coach server…'],
  waking: ['bg-amber animate-pulse', 'Waking the coach server — about 30 seconds'],
  ready: ['bg-mint', 'Coach server is ready'],
  nokey: ['bg-coral', 'The server is up but has no AI key set (GEMINI_API_KEY)'],
  blocked: ['bg-coral', 'The server is up but doesn’t allow this site yet (ALLOWED_ORIGINS)'],
  down: ['bg-coral', 'Can’t reach the coach server right now'],
};

export default function Landing({ settings, setSettings, onStart, onDemo, notice, clearNotice, status }) {
  const server = useServerStatus();
  const [open, setOpen] = useState(false);
  const busy = status === 'starting' || status === 'connecting';
  const failed = status === 'closed' || status === 'error';
  const set = (k) => (v) => setSettings({ ...settings, [k]: v });
  const [dot, serverText] = SERVER[server];

  return (
    <div className="relative min-h-[100dvh] overflow-hidden">

      <div className="relative max-w-5xl mx-auto px-5 sm:px-8">
        <header className="flex items-center justify-between h-16 border-b border-fg">
          <Logo />
          <span className="eyebrow">Practice &amp; home games</span>
        </header>

        <main className="grid lg:grid-cols-[1.05fr_.95fr] gap-10 lg:gap-14 items-center pt-6 sm:pt-12 pb-16">
          <section className="animate-rise">
            <p className="eyebrow !text-coral">A hands-free coach for a real table</p>
            <h1 className="mt-4 font-display text-[52px] leading-[0.98] sm:text-[76px] tracking-[-0.02em] max-w-[12ch]">
              A poker coach in your ear, <em className="text-coral">not on a screen.</em>
            </h1>
            <p className="mt-5 text-[17px] leading-relaxed text-fg-muted max-w-xl">
              Prop your phone up as the camera, put one earbud in, and keep your eyes on the table. PokerLens sees the cards, hears the bets and tells you the move out loud.
            </p>

            {notice && (
              <div role="alert" className="mt-6 flex items-start gap-3 rounded-2xl border border-coral/30 bg-coral/10 p-4 animate-rise">
                <Icon name="alert" className="text-coral mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{failed ? 'The session ended' : 'Heads up'}</p>
                  <p className="text-sm text-fg-muted mt-0.5">{notice}</p>
                </div>
                <button onClick={clearNotice} aria-label="Dismiss" className="text-fg-muted hover:text-fg"><Icon name="x" size={16} /></button>
              </div>
            )}

            <div className="mt-7 flex flex-col sm:flex-row gap-3">
              <button onClick={onStart} disabled={busy} className="btn-primary h-14 px-7 text-base">
                {busy ? <><span className="w-4 h-4 rounded-full border-2 border-ink/30 border-t-ink animate-spin" />Connecting…</> : <><Icon name="play" filled size={18} />{failed ? 'Try again' : 'Start session'}</>}
              </button>
              <button onClick={onDemo} disabled={busy} className="btn-ghost h-14 px-6 text-base">Watch a demo hand</button>
            </div>

            <div className="mt-4 flex items-center gap-2 text-xs text-fg-muted" aria-live="polite">
              <span className={`w-2 h-2 rounded-full ${dot}`} />{serverText}
            </div>

            <div className="mt-7 panel overflow-hidden max-w-xl">
              <button onClick={() => setOpen(!open)} aria-expanded={open} className="w-full flex items-center justify-between px-4 py-3.5 text-sm">
                <span className="font-medium">Session settings</span>
                <span className="flex items-center gap-2 text-fg-muted text-xs">
                  {settings.mode === 'ptt' ? 'Push-to-talk' : 'Hands-free'} · {settings.earbuds ? 'Earbuds' : 'Speaker'}{settings.earStart ? ' · Screen off' : ''}
                  <Icon name="chevron" size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
                </span>
              </button>
              {open && (
                <div className="px-4 pb-4 pt-1 flex flex-col gap-4 border-t border-line animate-rise">
                  <div className="pt-3">
                    <p className="text-sm font-medium mb-2">How you talk to it</p>
                    <Segmented value={settings.mode} onChange={set('mode')} options={[['auto', 'Hands-free'], ['ptt', 'Push-to-talk']]} />
                    <p className="text-xs text-fg-muted mt-2 leading-snug">
                      {settings.mode === 'ptt' ? 'It only listens while you hold the talk button. Best for a loud room.' : 'It listens the whole time and stays quiet until you ask. Best for a home game.'}
                    </p>
                  </div>
                  <Toggle checked={settings.earbuds} onChange={set('earbuds')} label="I’m wearing earbuds" hint="Lets you interrupt the coach mid-sentence. Without earbuds the mic pauses while it speaks so it can’t hear itself." />
                  <Toggle checked={settings.earStart} onChange={set('earStart')} label="Start with the screen off" hint="Runs by ear: the screen goes dark and one tap anywhere asks for the move. You can bring the screen back at any time." />
                  <Toggle checked={settings.sounds} onChange={set('sounds')} label="Sound cues" hint="A soft tone when the board is read or a bet is heard, so you know it registered without looking." />
                  <label className="block">
                    <span className="block text-sm font-medium mb-2">Access code <span className="text-fg-dim font-normal">(only if you were given one)</span></span>
                    <input type="password" autoComplete="off" value={settings.code} onChange={(e) => set('code')(e.target.value)} placeholder="Leave blank if none"
                      className="w-full h-11 rounded-xl bg-ink-900 border border-line px-3 text-sm outline-none focus:border-fg placeholder:text-fg-dim" />
                  </label>
                </div>
              )}
            </div>

            <p className="mt-5 text-xs text-fg-dim max-w-xl leading-relaxed">
              You’ll be asked for camera and microphone access; without a camera it runs by voice alone. Video and audio are streamed to the AI model for the session and aren’t saved by PokerLens. Everyone at the table should know it’s listening.
              Built for practice and home games — most card rooms don’t allow electronic aids.
            </p>
          </section>

          <aside className="flex flex-col gap-4 animate-rise [animation-delay:80ms]">
            <Preview />
            <ol className="border-t border-fg divide-y divide-line">
              {STEPS.map(([icon, title, body], i) => (
                <li key={title} className="flex gap-4 py-4">
                  <span className="num shrink-0 w-8 text-sm text-coral pt-1">0{i + 1}</span>
                  <div>
                    <p className="font-display text-2xl leading-tight">{title}</p>
                    <p className="text-sm text-fg-muted mt-1 leading-snug">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </aside>
        </main>
      </div>
    </div>
  );
}

// A static miniature of the live screen, so the first view already shows the payoff.
function Preview() {
  return (
    <div className="panel p-4 select-none" aria-hidden="true">
      <div className="flex items-center justify-between">
        <span className="eyebrow">The move</span>
        <span className="eyebrow !text-mint">Live</span>
      </div>
      <div className="flex items-end justify-between mt-2">
        <p className="font-display text-6xl leading-none text-mint">Call</p>
        <p className="num text-right text-sm text-fg-muted"><span className="text-fg text-xl font-semibold">52%</span> to win<br />need 28%</p>
      </div>
      <div className="relative h-2 rounded-full bg-ink-500 mt-3">
        <div className="absolute inset-y-0 left-0 rounded-full bg-mint" style={{ width: '52%' }} />
        <div className="absolute -inset-y-1 w-0.5 bg-fg rounded" style={{ left: '28%' }} />
      </div>
      <div className="flex items-center gap-1.5 mt-4">
        <PlayingCard card="Ah" size="sm" /><PlayingCard card="Kh" size="sm" />
        <span className="w-px h-8 bg-line mx-1.5" />
        <PlayingCard card="Qh" size="sm" /><PlayingCard card="7h" size="sm" /><PlayingCard card="2c" size="sm" /><PlayingCard card="9s" size="sm" /><PlayingCard size="sm" />
      </div>
    </div>
  );
}
