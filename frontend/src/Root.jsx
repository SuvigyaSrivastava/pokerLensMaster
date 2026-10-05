import React, { Suspense, lazy } from 'react';
import LiveTable from './components/LiveTable.jsx';

// The original photo-at-a-time prototype is kept for reference at /?classic=1; it is not part of the product.
const Classic = lazy(() => import('./App.jsx'));

export default function Root() {
  const classic = new URLSearchParams(window.location.search).has('classic');
  if (!classic) return <LiveTable />;
  return (
    <div className="bg-[#0D1B0F] text-gray-100 min-h-screen">
      <nav className="flex items-center gap-3 px-4 py-2 border-b border-[#1A2E1C]">
        <a href="/" className="text-xs px-3 py-1.5 rounded-lg border bg-[#1A2E1C] text-gray-200 border-[#2a452d]">← Back to live coach</a>
        <span className="text-xs text-gray-400">Classic photo mode (prototype)</span>
      </nav>
      <Suspense fallback={null}><Classic /></Suspense>
    </div>
  );
}
