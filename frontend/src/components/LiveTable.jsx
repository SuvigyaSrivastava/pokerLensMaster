import React, { useState } from 'react';
import { useLiveSession } from '../live/useLiveSession';
import { useDemoSession } from '../live/useDemoSession';
import Landing from './live/Landing';
import Session from './live/Session';

const RUNNING = ['starting', 'connecting', 'live', 'reconnecting'];

const load = () => {
  const d = { mode: 'auto', earbuds: false, earStart: false, sounds: true, code: '' };
  try { return { ...d, ...JSON.parse(localStorage.getItem('pokerlens_settings') || '{}'), code: localStorage.getItem('pokerlens_code') || '' }; } catch (e) { return d; }
};

export default function LiveTable() {
  const real = useLiveSession();
  const demo = useDemoSession();
  const [settings, setSettingsState] = useState(load);
  const [which, setWhich] = useState('real');

  const setSettings = (s) => {
    setSettingsState(s);
    try {
      localStorage.setItem('pokerlens_settings', JSON.stringify({ mode: s.mode, earbuds: s.earbuds, earStart: s.earStart, sounds: s.sounds }));
      localStorage.setItem('pokerlens_code', s.code);
    } catch (e) {}
  };

  const live = which === 'demo' ? demo : real;
  // Stay on the landing screen until permissions are granted, so a denied prompt never strands the user.
  const inSession = which === 'demo' ? RUNNING.includes(demo.status) : ['connecting', 'live', 'reconnecting'].includes(real.status);

  if (inSession) return <Session live={live} settings={settings} />;

  return (
    <Landing
      settings={settings}
      setSettings={setSettings}
      status={real.status}
      notice={real.notice}
      clearNotice={real.clearNotice}
      onStart={() => { setWhich('real'); real.start({ mode: settings.mode, code: settings.code, fullDuplex: settings.earbuds, sounds: settings.sounds }); }}
      onDemo={() => { setWhich('demo'); demo.start(); }}
    />
  );
}
