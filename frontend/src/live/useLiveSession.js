import { useCallback, useEffect, useRef, useState } from 'react';
import { bytesToB64, createMicPipeline, createPlayer } from './audio';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const WS_BASE = API.replace(/^http/, 'ws').replace(/\/$/, '');

// Scene-change detection on a tiny grayscale thumbnail (mean abs pixel diff, 0-255).
const MOTION_THRESHOLD = 5;
const SETTLE_TICKS = 2; // consecutive calm ticks (~2 s) after movement => "scene settled"
const KEEPALIVE_MS = 3000; // send a fresh frame at least this often so questions use a current view
const FRAME_WIDTH = 768;

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

  const R = useRef({}); // mutable session internals
  const idc = useRef(0);

  const send = useCallback((obj) => {
    const ws = R.current.ws;
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
  }, []);

  const cleanup = useCallback(() => {
    const r = R.current;
    clearInterval(r.frameTimer);
    clearInterval(r.pingTimer);
    try { r.mic && r.mic.stop(); } catch (e) {}
    try { r.player && r.player.close(); } catch (e) {}
    try { r.stream && r.stream.getTracks().forEach((t) => t.stop()); } catch (e) {}
    try {
      if (r.ws) {
        r.ws.onclose = null;
        r.ws.close();
      }
    } catch (e) {}
    if (r.videoEl) r.videoEl.srcObject = null;
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
        if (m.status === 'closed') setStatus('closed');
        else setStatus(m.status);
        break;
      case 'state':
        setState(m.state);
        break;
      case 'facts':
        setFacts(m.facts);
        break;
      case 'audio':
        if (r.player) {
          if (r.userSpokeAt && !r.coachStarted) {
            setLatency(Math.round(performance.now() - r.userSpokeAt));
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
          r.userSpokeAt = performance.now();
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
        setTools((prev) => [...prev.slice(-5), { id: ++idc.current, name: m.name, ok: m.ok, error: m.error }]);
        break;
      case 'notice':
        setNotice(m.message);
        break;
      case 'error':
        setNotice(m.message);
        if (m.fatal) {
          cleanup();
          setStatus('error');
        }
        break;
      default:
        break;
    }
  }, [cleanup]);

  const start = useCallback(
    async ({ videoEl, mode = 'auto', code = '', fullDuplex = false }) => {
      if (R.current.ws) return;
      setNotice(null);
      setLog([]);
      setTools([]);
      setState(null);
      setFacts(null);
      setLatency(null);
      setStatus('starting');

      if (!window.isSecureContext && location.hostname !== 'localhost') {
        setNotice('The camera and microphone need HTTPS. Open the https:// link of the deployed app.');
        setStatus('error');
        return;
      }

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch (e) {
        setNotice('Camera and microphone permission is required. Allow both and press Start again.');
        setStatus('error');
        return;
      }

      const r = (R.current = { stream, videoEl, mode, fullDuplex, pttActive: false, muted: false });
      if (videoEl) {
        videoEl.srcObject = stream;
        videoEl.muted = true;
        videoEl.playsInline = true;
        videoEl.play().catch(() => {});
      }
      r.player = createPlayer(setSpeaking);
      r.player.unlock(); // inside the click gesture

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
        setNotice('Could not start the microphone pipeline in this browser. Try Chrome.');
        cleanup();
        setStatus('error');
        return;
      }

      const url = `${WS_BASE}/ws/live?${new URLSearchParams({ mode: mode === 'ptt' ? 'ptt' : 'auto', code }).toString()}`;
      setStatus('connecting');
      const ws = new WebSocket(url);
      r.ws = ws;
      ws.onmessage = (ev) => {
        try { handleMessage(JSON.parse(ev.data)); } catch (e) {}
      };
      ws.onopen = () => {
        r.pingTimer = setInterval(() => send({ type: 'ping' }), 5000);
        startFrameLoop();
      };
      ws.onclose = (ev) => {
        const wasLive = !!R.current.ws;
        cleanup();
        setStatus('closed');
        if (wasLive && (ev.code === 1008 || ev.code === 1006)) {
          setNotice(ev.code === 1008 ? 'Access code rejected (or origin not allowed).' : 'Could not reach the server. Is the backend running / awake?');
        } else if (ev.code === 1013) {
          setNotice('Server is busy with another live session. Try again shortly.');
        }
      };

      // ---- camera frames: ~1 fps, change detection, "scene settled" trigger ----
      function startFrameLoop() {
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
          send({ type: 'video', data });
          lastSent = performance.now();
        };

        r.grabNow = () => {
          if (videoEl && videoEl.readyState >= 2) sendFrame(videoEl);
        };

        r.frameTimer = setInterval(() => {
          const v = videoEl;
          if (!v || v.readyState < 2) return;
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
      }
    },
    [cleanup, handleMessage, send]
  );

  const advise = useCallback(() => {
    R.current.grabNow && R.current.grabNow();
    send({ type: 'advise' });
  }, [send]);
  const scan = useCallback(() => {
    R.current.grabNow && R.current.grabNow();
    send({ type: 'scan' });
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

  return {
    status, state, facts, log, tools, notice, level, speaking, latency, muted,
    start, stop, advise, scan, newHand, setField, pttStart, pttEnd, setMuted,
    clearNotice: () => setNotice(null),
  };
}
