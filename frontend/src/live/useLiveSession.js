import { useCallback, useEffect, useRef, useState } from 'react';
import { bytesToB64, createMicPipeline, createPlayer } from './audio';

export const API = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');
const WS_BASE = API.replace(/^http/, 'ws');

// Scene-change detection on a tiny grayscale thumbnail (mean abs pixel diff, 0-255).
const MOTION_THRESHOLD = 5;
const SETTLE_TICKS = 2; // consecutive calm ticks (~2 s) after movement => "scene settled"
const KEEPALIVE_MS = 3000; // send a fresh frame at least this often so questions use a current view
const FRAME_WIDTH = 768;
const MAX_RETRIES = 3; // client-side reconnects after a dropped link (the hand is restored from our snapshot)

const VIDEO = (facing) => ({ facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } });
const AUDIO = { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true };

const EMPTY_STATS = { frames: 0, kb: 0, kbps: 0, replies: [] };

export function useLiveSession() {
  const [status, setStatus] = useState('idle'); // idle | starting | connecting | live | reconnecting | closed | error
  const [state, setState] = useState(null);
  const [facts, setFacts] = useState(null);
  const [log, setLog] = useState([]);
  const [tools, setTools] = useState([]);
  const [notice, setNotice] = useState(null);
  const [level, setLevel] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [latency, setLatency] = useState(null);
  const [muted, setMutedState] = useState(false);
  const [camera, setCamera] = useState({ on: false, facing: 'environment', count: 0 });
  const [stats, setStats] = useState(EMPTY_STATS);

  const R = useRef({}); // mutable session internals
  const idc = useRef(0);
  const videoElRef = useRef(null); // the <video> may mount after start(), so it is attached separately

  const attachVideo = useCallback((el) => {
    videoElRef.current = el;
    const stream = R.current.stream;
    if (el && stream && el.srcObject !== stream) {
      el.srcObject = stream;
      el.muted = true;
      el.playsInline = true;
      el.play().catch(() => {});
    }
  }, []);

  const send = useCallback((obj) => {
    const r = R.current;
    const ws = r.ws;
    if (!ws || ws.readyState !== 1) return false;
    const raw = JSON.stringify(obj);
    r.bytesUp = (r.bytesUp || 0) + raw.length;
    ws.send(raw);
    return true;
  }, []);

  const cue = useCallback((kind) => {
    const r = R.current;
    if (r.sounds !== false && r.player) r.player.cue(kind);
  }, []);

  const cleanup = useCallback(() => {
    const r = R.current;
    r.dead = true;
    clearInterval(r.frameTimer);
    clearInterval(r.pingTimer);
    clearInterval(r.statsTimer);
    clearTimeout(r.retryTimer);
    if (r.onVisible) document.removeEventListener('visibilitychange', r.onVisible);
    try { r.wakeLock && r.wakeLock.release(); } catch (e) {}
    try { r.mic && r.mic.stop(); } catch (e) {}
    try { r.player && r.player.close(); } catch (e) {}
    try { r.stream && r.stream.getTracks().forEach((t) => t.stop()); } catch (e) {}
    try {
      if (r.ws) {
        r.ws.onclose = null;
        r.ws.close();
      }
    } catch (e) {}
    if (videoElRef.current) videoElRef.current.srcObject = null;
    R.current = {};
    setSpeaking(false);
    setLevel(0);
  }, []);

  const stop = useCallback(() => {
    cleanup();
    setStatus('idle');
  }, [cleanup]);

  useEffect(() => cleanup, [cleanup]);

  const handleMessage = useCallback((m) => {
    const r = R.current;
    switch (m.type) {
      case 'status':
        if (m.status === 'closed') break; // the socket's own close event decides what happens next
        if (m.status === 'live') {
          if (r.attempts > 0) cue('back');
          r.everLive = true;
          r.attempts = 0;
        }
        setStatus(m.status);
        break;
      case 'state':
        r.lastState = m.state;
        setState(m.state);
        break;
      case 'facts':
        setFacts(m.facts);
        break;
      case 'audio':
        if (r.player) {
          if (r.askedAt && !r.coachStarted) {
            const ms = Math.round(performance.now() - r.askedAt);
            if (ms < 20000) {
              setLatency(ms);
              r.replies = [...(r.replies || []).slice(-19), ms];
            }
            r.askedAt = null;
          }
          r.coachStarted = true;
          r.player.play(m.data, m.rate || 24000);
        }
        break;
      case 'interrupted':
        r.player && r.player.stop();
        break;
      case 'transcript':
        if (m.role === 'user') {
          r.askedAt = performance.now();
          r.coachStarted = false;
        }
        setLog((prev) => {
          const last = prev[prev.length - 1];
          if (last && !last.done && last.role === m.role) {
            return [...prev.slice(0, -1), { ...last, text: last.text + m.text }];
          }
          return [...prev.slice(-40), { id: ++idc.current, role: m.role, text: m.text, done: false }];
        });
        break;
      case 'turn_complete':
        setLog((prev) => prev.map((x) => (x.done ? x : { ...x, done: true })));
        r.coachStarted = false;
        break;
      case 'tool':
        setTools((prev) => [...prev.slice(-29), { id: ++idc.current, name: m.name, args: m.args, ok: m.ok, error: m.error, ms: m.ms, at: Date.now() }]);
        if (m.ok && m.name === 'set_board') cue('read');
        else if (m.ok && m.name === 'record_action') cue('heard');
        if (m.ok && (m.name === 'set_board' || m.name === 'set_hero_cards')) {
          try { navigator.vibrate && navigator.vibrate(40); } catch (e) {}
        }
        break;
      case 'notice':
        setNotice(m.message);
        break;
      case 'error':
        setNotice(m.message);
        if (m.retry === false) r.noRetry = true;
        if (m.fatal) {
          cleanup();
          setStatus('error');
        }
        break;
      default:
        break;
    }
  }, [cleanup, cue]);

  // ---- camera frames: ~1 fps, change detection, "scene settled" trigger ----
  const startFrameLoop = useCallback(() => {
    const r = R.current;
    if (r.frameTimer) return;
    const small = document.createElement('canvas');
    small.width = 32;
    small.height = 24;
    const sctx = small.getContext('2d', { willReadFrequently: true });
    const big = document.createElement('canvas');
    const bctx = big.getContext('2d');
    let prev = null;
    let changing = false;
    let calm = 0;
    let lastSent = 0;

    const sendFrame = (v) => {
      const w = FRAME_WIDTH;
      const h = Math.round((w * (v.videoHeight || 480)) / (v.videoWidth || 640));
      big.width = w;
      big.height = h;
      bctx.drawImage(v, 0, 0, w, h);
      const data = big.toDataURL('image/jpeg', 0.72).split(',')[1];
      if (send({ type: 'video', data })) r.frames = (r.frames || 0) + 1;
      lastSent = performance.now();
    };

    r.grabNow = () => {
      const v = videoElRef.current;
      if (v && v.readyState >= 2 && v.videoWidth) sendFrame(v);
    };

    r.frameTimer = setInterval(() => {
      const v = videoElRef.current;
      if (!v || v.readyState < 2 || !v.videoWidth) return;
      sctx.drawImage(v, 0, 0, 32, 24);
      const px = sctx.getImageData(0, 0, 32, 24).data;
      const cur = new Float32Array(32 * 24);
      for (let i = 0; i < cur.length; i++) cur[i] = px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114;
      let diff = 0;
      if (prev) {
        for (let i = 0; i < cur.length; i++) diff += Math.abs(cur[i] - prev[i]);
        diff /= cur.length;
      }
      const hadPrev = !!prev;
      prev = cur;

      let scene = false;
      let sendNow = performance.now() - lastSent > KEEPALIVE_MS;
      if (hadPrev && diff > MOTION_THRESHOLD) {
        changing = true;
        calm = 0;
        sendNow = true;
      } else if (changing) {
        calm += 1;
        if (calm >= SETTLE_TICKS) {
          changing = false;
          scene = true;
          sendNow = true;
        }
      }
      if (sendNow) sendFrame(v);
      if (scene) send({ type: 'scene' });
    }, 1000);
  }, [send]);

  const connect = useCallback((resume) => {
    const r = R.current;
    if (r.dead || !r.stream) return;
    const q = new URLSearchParams({ mode: r.mode === 'ptt' ? 'ptt' : 'auto', code: r.code || '' });
    if (resume) q.set('resume', '1');
    setStatus(resume ? 'reconnecting' : 'connecting');
    const ws = new WebSocket(`${WS_BASE}/ws/live?${q.toString()}`);
    r.ws = ws;
    ws.onmessage = (ev) => {
      if (R.current !== r) return;
      try { handleMessage(JSON.parse(ev.data)); } catch (e) {}
    };
    ws.onopen = () => {
      if (R.current !== r) return;
      // Put the hand back exactly as it was: the server keeps no state between sockets.
      if (resume && r.lastState) send({ type: 'restore', state: r.lastState });
      clearInterval(r.pingTimer);
      r.pingTimer = setInterval(() => send({ type: 'ping' }), 5000);
      if (r.hasVideo) startFrameLoop();
    };
    ws.onclose = (ev) => {
      if (R.current !== r || r.ws !== ws) return;
      clearInterval(r.pingTimer);
      r.ws = null;
      const refused = ev.code === 1008 || ev.code === 1013;
      if (!refused && r.everLive && !r.noRetry && (r.attempts || 0) < MAX_RETRIES) {
        r.attempts = (r.attempts || 0) + 1;
        if (r.attempts === 1) cue('drop');
        r.player && r.player.stop();
        setStatus('reconnecting');
        r.retryTimer = setTimeout(() => connect(true), 700 * 2 ** (r.attempts - 1));
        return;
      }
      const wasLive = r.everLive;
      const quiet = r.noRetry; // the server already explained why (shown as the notice)
      cleanup();
      setStatus('closed');
      if (quiet) return;
      if (ev.code === 1008) setNotice('The server refused the connection: wrong access code, or this site isn’t on its allowed list.');
      else if (ev.code === 1013) setNotice('The coach is busy with another session. Try again in a minute.');
      else if (wasLive) setNotice('The connection dropped and couldn’t be restored. Check your internet and start again.');
      else setNotice('Couldn’t reach the coach server. It may still be waking up — wait a few seconds and try again.');
    };
  }, [cleanup, cue, handleMessage, send, startFrameLoop]);

  const start = useCallback(
    async ({ mode = 'auto', code = '', fullDuplex = false, sounds = true } = {}) => {
      if (R.current.stream || R.current.starting) return;
      setNotice(null);
      setLog([]);
      setTools([]);
      setState(null);
      setFacts(null);
      setLatency(null);
      setMutedState(false);
      setStats(EMPTY_STATS);
      setStatus('starting');

      if (!window.isSecureContext && location.hostname !== 'localhost') {
        setNotice('The camera and microphone need HTTPS. Open the https:// link of the deployed app.');
        setStatus('error');
        return;
      }
      if (!navigator.mediaDevices || !window.AudioWorkletNode || !window.WebSocket) {
        setNotice('This browser can’t run the live coach. Use a current Chrome, Edge or Safari.');
        setStatus('error');
        return;
      }

      const r = (R.current = { starting: true, mode, code, fullDuplex, sounds, pttActive: false, muted: false, attempts: 0 });
      // Create and unlock the speaker inside the tap, before any permission prompt can use up the gesture.
      r.player = createPlayer(setSpeaking);
      r.player.unlock();

      let stream;
      let hasVideo = true;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO, video: VIDEO('environment') });
      } catch (e1) {
        // No camera (or it was refused)? The coach still works by voice alone.
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO });
          hasVideo = false;
        } catch (e2) {
          const denied = e2 && (e2.name === 'NotAllowedError' || e2.name === 'SecurityError');
          if (R.current === r) cleanup();
          setNotice(denied
            ? 'Microphone access was blocked. Allow it in the browser’s site settings (the lock icon in the address bar), then start again.'
            : 'No microphone was found. Plug one in or try another device.');
          setStatus('error');
          return;
        }
      }
      if (R.current !== r) { // stopped while the permission prompt was open
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      r.stream = stream;
      r.hasVideo = hasVideo;
      r.starting = false;
      r.facing = 'environment';
      const settings = hasVideo ? stream.getVideoTracks()[0].getSettings() : {};
      if (settings.facingMode) r.facing = settings.facingMode;
      setCamera({ on: hasVideo, facing: r.facing, count: hasVideo ? 1 : 0 });
      if (!hasVideo) setNotice('No camera available, so this is a voice-only session. Tell the coach your cards and the board out loud.');
      else {
        navigator.mediaDevices.enumerateDevices()
          .then((d) => R.current === r && setCamera((c) => ({ ...c, count: d.filter((x) => x.kind === 'videoinput').length })))
          .catch(() => {});
      }
      attachVideo(videoElRef.current);

      try {
        r.mic = await createMicPipeline(
          stream,
          (pcm) => {
            const cur = R.current;
            if (!cur.ws || cur.ws.readyState !== 1 || cur.muted) return;
            if (cur.mode === 'ptt' && !cur.pttActive) return;
            if (!cur.fullDuplex && cur.player && cur.player.isPlaying()) return; // avoid hearing itself on speakers
            send({ type: 'audio', data: bytesToB64(pcm) });
          },
          (lv) => setLevel(lv),
        );
      } catch (e) {
        if (R.current === r) cleanup();
        setNotice('Could not start the microphone in this browser. Try Chrome.');
        setStatus('error');
        return;
      }
      if (R.current !== r) return;

      // Keep the phone awake: a locked screen would freeze the camera and drop the link.
      const lock = async () => {
        try { if ('wakeLock' in navigator && document.visibilityState === 'visible') r.wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
      };
      r.onVisible = () => { if (document.visibilityState === 'visible') lock(); };
      document.addEventListener('visibilitychange', r.onVisible);
      lock();

      let lastKb = 0;
      r.statsTimer = setInterval(() => {
        const kb = (r.bytesUp || 0) / 1024;
        setStats({ frames: r.frames || 0, kb: Math.round(kb), kbps: Math.round(((kb - lastKb) / 2) * 10) / 10, replies: r.replies || [] });
        lastKb = kb;
      }, 2000);

      connect(false);
    },
    [attachVideo, cleanup, connect, send]
  );

  const ask = (r) => { r.askedAt = performance.now(); r.coachStarted = false; };

  const advise = useCallback(() => {
    const r = R.current;
    r.grabNow && r.grabNow();
    if (send({ type: 'advise' })) { ask(r); cue('ask'); }
  }, [send, cue]);
  const scan = useCallback(() => {
    R.current.grabNow && R.current.grabNow();
    send({ type: 'scan' });
  }, [send]);
  const sendText = useCallback((text) => {
    const t = String(text || '').trim().slice(0, 500);
    if (!t || !send({ type: 'text', text: t })) return false;
    ask(R.current);
    setLog((prev) => [...prev.slice(-40), { id: ++idc.current, role: 'user', text: t, done: true, typed: true }]);
    return true;
  }, [send]);
  const newHand = useCallback(() => send({ type: 'new_hand' }), [send]);
  const setField = useCallback((field, value) => send({ type: 'set', field, value }), [send]);
  const pttStart = useCallback(() => {
    if (R.current.mode !== 'ptt') return;
    R.current.pttActive = true;
    R.current.player && R.current.player.stop();
    send({ type: 'activity', state: 'start' });
  }, [send]);
  const pttEnd = useCallback(() => {
    if (R.current.mode !== 'ptt' || !R.current.pttActive) return;
    R.current.pttActive = false;
    send({ type: 'activity', state: 'end' });
  }, [send]);
  const setMuted = useCallback((v) => {
    R.current.muted = v;
    setMutedState(v);
  }, []);

  const flipCamera = useCallback(async () => {
    const r = R.current;
    if (!r.stream || !r.hasVideo || r.flipping) return;
    r.flipping = true;
    const next = r.facing === 'user' ? 'environment' : 'user';
    try {
      const old = r.stream.getVideoTracks();
      old.forEach((t) => t.stop()); // phones can only open one camera at a time
      const fresh = await navigator.mediaDevices.getUserMedia({ video: VIDEO(next) });
      if (R.current !== r) { fresh.getTracks().forEach((t) => t.stop()); return; }
      old.forEach((t) => r.stream.removeTrack(t));
      r.stream.addTrack(fresh.getVideoTracks()[0]);
      r.facing = next;
      setCamera((c) => ({ ...c, facing: next }));
      const el = videoElRef.current;
      if (el) { el.srcObject = null; el.srcObject = r.stream; el.play().catch(() => {}); }
    } catch (e) {
      setNotice('Couldn’t switch cameras on this device.');
      try { // put the previous camera back rather than leaving the coach blind
        if (R.current === r && !r.stream.getVideoTracks().some((t) => t.readyState === 'live')) {
          const back = await navigator.mediaDevices.getUserMedia({ video: VIDEO(r.facing) });
          r.stream.getVideoTracks().forEach((t) => r.stream.removeTrack(t));
          r.stream.addTrack(back.getVideoTracks()[0]);
          const el = videoElRef.current;
          if (el) { el.srcObject = null; el.srcObject = r.stream; el.play().catch(() => {}); }
        }
      } catch (e2) {}
    } finally {
      r.flipping = false;
    }
  }, []);

  return {
    status, state, facts, log, tools, notice, level, speaking, latency, muted, camera, stats,
    start, stop, attachVideo, advise, scan, sendText, newHand, setField, pttStart, pttEnd, setMuted, flipCamera,
    clearNotice: () => setNotice(null),
  };
}
