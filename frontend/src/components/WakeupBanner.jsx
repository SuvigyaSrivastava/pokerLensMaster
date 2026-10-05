import React from 'react';

export default function WakeupBanner({ isWaking }) {
  if (!isWaking) return null;

  return (
    <div className="bg-yellow-950/80 border border-yellow-600/70 text-yellow-200 px-4 py-2.5 text-sm text-center rounded-lg shadow-md animate-pulse">
      ⚡ AI server warming up (~30 seconds on first visit or cold start)...
    </div>
  );
}
