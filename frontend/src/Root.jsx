import React, { useState } from 'react';
import App from './App.jsx';
import LiveTable from './components/LiveTable.jsx';

export default function Root() {
  const [tab, setTab] = useState(() => {
    try { return sessionStorage.getItem('pokerlens_tab') || 'live'; } catch (e) { return 'live'; }
  });
  const pick = (t) => {
    setTab(t);
    try { sessionStorage.setItem('pokerlens_tab', t); } catch (e) {}
  };
  return (
    <div className="bg-[#0D1B0F] min-h-screen">
      <nav className="flex items-center gap-2 px-4 py-2 border-b border-[#1A2E1C] bg-[#0D1B0F]">
        <span className="font-black text-white mr-3">🃏 PokerLens</span>
        {[['live', 'Live Co-Pilot'], ['snapshot', 'Snapshot (classic)']].map(([k, t]) => (
          <button
            key={k}
            onClick={() => pick(k)}
            className={`text-xs px-3 py-1.5 rounded-lg border ${tab === k ? 'bg-[#00C853] text-black font-bold border-[#00C853]' : 'bg-[#1A2E1C] text-gray-300 border-[#2a452d]'}`}
          >
            {t}
          </button>
        ))}
      </nav>
      {tab === 'live' ? <LiveTable /> : <App />}
    </div>
  );
}
