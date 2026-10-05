// Browser audio helpers for the live co-pilot.
// Mic: any device sample rate -> 16 kHz mono PCM16, 100 ms chunks, via an AudioWorklet.
// Player: gapless playback of 24 kHz PCM16 chunks with instant interruption.

const WORKLET_SRC = `
class PCM16k extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.need = Math.round(this.ratio * 1600); // input samples per 100 ms output chunk
    this.buf = new Float32Array(this.need * 3);
    this.len = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    if (this.len + ch.length > this.buf.length) this.len = 0; // overflow guard
    this.buf.set(ch, this.len);
    this.len += ch.length;
    while (this.len >= this.need) {
      const out = new Int16Array(1600);
      let sumSq = 0;
      for (let i = 0; i < 1600; i++) {
        const a = Math.floor(i * this.ratio);
        const b = Math.max(a + 1, Math.floor((i + 1) * this.ratio));
        let s = 0;
        for (let j = a; j < b; j++) s += this.buf[j];
        const v = Math.max(-1, Math.min(1, s / (b - a)));
        sumSq += v * v;
        out[i] = v < 0 ? v * 32768 : v * 32767;
      }
      this.buf.copyWithin(0, this.need, this.len);
      this.len -= this.need;
      this.port.postMessage({ pcm: out.buffer, level: Math.sqrt(sumSq / 1600) }, [out.buffer]);
    }
    return true;
  }
}
registerProcessor('pcm16k', PCM16k);
`;

export function bytesToB64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export async function createMicPipeline(stream, onPCM, onLevel) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  await ctx.resume();
  const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
  await ctx.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);

  const src = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
  const node = new AudioWorkletNode(ctx, 'pcm16k');
  node.port.onmessage = (e) => {
    onPCM(e.data.pcm);
    onLevel && onLevel(e.data.level);
  };
  // Some browsers only run a worklet that reaches the destination: use a muted gain.
  const mute = ctx.createGain();
  mute.gain.value = 0;
  src.connect(node);
  node.connect(mute);
  mute.connect(ctx.destination);

  return {
    stop() {
      try {
        node.port.onmessage = null;
        src.disconnect();
        node.disconnect();
        ctx.close();
      } catch (e) {}
    },
  };
}

export function createPlayer(onSpeaking) {
  let ctx = null;
  let nextTime = 0;
  let busyUntil = 0; // performance.now() ms when queued audio finishes (+ tail)
  const active = new Set();

  const ensure = () => {
    if (!ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      ctx = new Ctx();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };

  return {
    unlock: ensure, // call from a click so mobile browsers allow sound
    isPlaying: () => performance.now() < busyUntil,
    play(b64, rate = 24000) {
      const c = ensure();
      const bin = atob(b64);
      const n = bin.length >> 1;
      if (!n) return;
      const buf = c.createBuffer(1, n, rate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < n; i++) {
        let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
        if (v & 0x8000) v -= 0x10000;
        ch[i] = v / 32768;
      }
      const s = c.createBufferSource();
      s.buffer = buf;
      s.connect(c.destination);
      const t = Math.max(c.currentTime + 0.03, nextTime);
      s.start(t);
      nextTime = t + buf.duration;
      busyUntil = performance.now() + (nextTime - c.currentTime) * 1000 + 350;
      active.add(s);
      onSpeaking && onSpeaking(true);
      s.onended = () => {
        active.delete(s);
        if (!active.size) onSpeaking && onSpeaking(false);
      };
    },
    // Earcons: short tones that confirm an event without a screen (card read, bet heard, link lost/back).
    cue(kind) {
      const NOTES = { read: [[660, 0], [990, 0.09]], heard: [[520, 0]], ask: [[440, 0]], drop: [[330, 0], [220, 0.12]], back: [[440, 0], [660, 0.1]] };
      const seq = NOTES[kind];
      if (!seq) return;
      try {
        const c = ensure();
        const t0 = c.currentTime + 0.01;
        seq.forEach(([freq, at]) => {
          const o = c.createOscillator();
          const g = c.createGain();
          o.type = 'sine';
          o.frequency.value = freq;
          g.gain.setValueAtTime(0.0001, t0 + at);
          g.gain.exponentialRampToValueAtTime(0.09, t0 + at + 0.012);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.11);
          o.connect(g);
          g.connect(c.destination);
          o.start(t0 + at);
          o.stop(t0 + at + 0.13);
        });
        // keep the half-duplex mic gate closed while the tone plays so the model never hears it
        busyUntil = Math.max(busyUntil, performance.now() + 380);
      } catch (e) {}
    },
    stop() {
      active.forEach((s) => {
        try {
          s.onended = null;
          s.stop();
        } catch (e) {}
      });
      active.clear();
      nextTime = 0;
      busyUntil = 0;
      onSpeaking && onSpeaking(false);
    },
    close() {
      this.stop();
      try {
        ctx && ctx.close();
      } catch (e) {}
      ctx = null;
    },
  };
}
