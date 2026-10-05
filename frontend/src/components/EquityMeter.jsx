import React from 'react';

export default function EquityMeter({ equity = 50.0 }) {
  const safeEquity = Math.max(0, Math.min(100, Number(equity) || 50));

  let colorClass = 'bg-[#00C853]';
  let textClass = 'text-[#00C853]';
  let assessment = 'Strong favorite';

  if (safeEquity >= 65) {
    colorClass = 'bg-[#00C853]';
    textClass = 'text-[#00C853]';
    assessment = 'Strong favorite — push your advantage';
  } else if (safeEquity >= 45) {
    colorClass = 'bg-[#FFD700]';
    textClass = 'text-yellow-400';
    assessment = 'Coin flip — pot control or selective play';
  } else {
    colorClass = 'bg-[#FF4444]';
    textClass = 'text-red-400';
    assessment = 'Behind — exercise caution / fold candidate';
  }

  return (
    <div className="bg-[#1A2E1C] border border-[#2a452d] rounded-xl p-4 shadow-xl flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <div>
          <span className="text-xs uppercase tracking-wider text-gray-400 font-semibold block">
            Win Equity (Monte Carlo)
          </span>
          <span className="text-xs text-gray-400 mt-0.5 block">{assessment}</span>
        </div>
        <div className={`text-3xl font-extrabold tracking-tight ${textClass}`}>
          {safeEquity.toFixed(1)}%
        </div>
      </div>

      {/* Progress Bar Container */}
      <div className="w-full bg-[#0D1B0F] border border-[#2a452d] rounded-full h-4 overflow-hidden p-0.5">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${colorClass}`}
          style={{ width: `${safeEquity}%` }}
        />
      </div>

      <div className="flex justify-between text-[11px] text-gray-500 font-mono px-0.5">
        <span>0%</span>
        <span>25%</span>
        <span>50%</span>
        <span>75%</span>
        <span>100%</span>
      </div>
    </div>
  );
}
