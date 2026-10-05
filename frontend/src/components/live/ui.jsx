import React from 'react';

const PATHS = {
  camera: <><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.2-1.6h5.4L15.9 6h1.6A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" /><circle cx="12" cy="12.5" r="3.2" /></>,
  mic: <><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" /></>,
  micOff: <><path d="M15 10.5v-4a3 3 0 0 0-5.7-1.3M9 9v2.5a3 3 0 0 0 4.6 2.5M5.5 11.5a6.5 6.5 0 0 0 10.3 5.3M18.5 11.5c0 .9-.2 1.8-.5 2.6M12 18v2.5M4 4l16 16" /></>,
  scan: <><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M4 12h16" /></>,
  bolt: <path d="M13 3 5 13.5h6L10.5 21 19 10h-6z" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  play: <path d="M8 5.5v13l11-6.5z" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  refresh: <><path d="M20 11a8 8 0 0 0-14.3-4.5L4 8.5M4 13a8 8 0 0 0 14.3 4.5l1.7-2" /><path d="M4 4v4.5h4.5M20 20v-4.5h-4.5" /></>,
  ear: <><path d="M7 9a5 5 0 0 1 10 0c0 3-3 3.5-3 6.5a3 3 0 0 1-5.5 1.5" /><path d="M10 9.5a2 2 0 0 1 4 0" /></>,
  minus: <path d="M6 12h12" />,
  plus: <path d="M12 6v12M6 12h12" />,
  pencil: <path d="m5 19 1-4L16.5 4.5l3 3L9 18zM14.5 6.5l3 3" />,
  alert: <><path d="M12 4 3 19h18z" /><path d="M12 10v4M12 16.5v.5" /></>,
  volume: <><path d="M4 10v4h3l5 4V6l-5 4z" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></>,
  code: <path d="m9 7-5 5 5 5M15 7l5 5-5 5" />,
};

export function Icon({ name, size = 18, className = '', filled = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true"
      fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name]}
    </svg>
  );
}

export function Logo({ compact = false }) {
  return (
    <span className="inline-flex items-center gap-2 select-none">
      <span className="grid place-items-center w-7 h-7 rounded-md bg-fg">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="5.2" fill="none" stroke="#F4F0E8" strokeWidth="1.6" />
          <circle cx="8" cy="8" r="1.8" fill="#E0492F" />
        </svg>
      </span>
      {!compact && <span className="font-display text-[22px] leading-none">PokerLens</span>}
    </span>
  );
}

// Animated bars driven by the real microphone level (0..~0.25).
export function MicBars({ level = 0, active = true, className = '' }) {
  const v = Math.min(1, level * 5);
  const shape = [0.55, 1, 0.7, 0.9, 0.5];
  return (
    <span className={`inline-flex items-center gap-[2px] h-3.5 ${className}`} aria-hidden="true">
      {shape.map((s, i) => (
        <span key={i} className="w-[2.5px] rounded-full bg-current transition-[height] duration-100"
          style={{ height: `${active ? Math.max(18, Math.min(100, (0.18 + v * s) * 100)) : 18}%` }} />
      ))}
    </span>
  );
}

export function Segmented({ value, onChange, options, disabled }) {
  return (
    <div className="grid grid-flow-col auto-cols-fr p-1 rounded-xl bg-ink-900 border border-line">
      {options.map(([k, label]) => (
        <button key={k} type="button" disabled={disabled} onClick={() => onChange(k)} aria-pressed={value === k}
          className={`px-3 py-2 rounded-lg text-sm font-medium transition ${value === k ? 'bg-fg text-ink' : 'text-fg-muted hover:text-fg'}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="w-full flex items-center justify-between gap-4 text-left">
      <span>
        <span className="block text-sm font-medium text-fg">{label}</span>
        {hint && <span className="block text-xs text-fg-muted mt-0.5 leading-snug">{hint}</span>}
      </span>
      <span className={`shrink-0 w-11 h-6 rounded-full p-0.5 transition ${checked ? 'bg-fg' : 'bg-ink-500'}`}>
        <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </span>
    </button>
  );
}
