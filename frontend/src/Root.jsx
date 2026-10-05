import React, { useState } from 'react';
import App from './App.jsx';
import LiveTable from './components/LiveTable.jsx';

export default function Root() {
  const [classic, setClassic] = useState(false);
  if (!classic) return <LiveTable onClassic={() => setClassic(true)} />;
  return (
    <div className="bg-[#0D1B0F] min-h-screen">
      <nav className="flex items-center gap-3 px-4 py-2 border-b border-[#1A2E1C]">
        <button onClick={() => setClassic(false)} className="text-xs px-3 py-1.5 rounded-lg border bg-[#1A2E1C] text-gray-200 border-[#2a452d]">← Back to live coach</button>
        <span className="text-xs text-gray-400">Classic photo mode</span>
      </nav>
      <App />
    </div>
  );
}
