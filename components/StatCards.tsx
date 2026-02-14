
import React from 'react';
import { TimelineBranch } from '../types';
import { formatCurrency } from '../services/financeUtils';

interface StatCardsProps {
  branch: TimelineBranch;
  originalWorth: number;
}

const StatCards: React.FC<StatCardsProps> = ({ branch, originalWorth }) => {
  const difference = branch.calculatedNetWorth - originalWorth;
  const isPositive = difference >= 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="glass p-5 rounded-2xl border-l-4 border-l-blue-500 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-3 opacity-10">
          <i className="fa-solid fa-vault text-4xl"></i>
        </div>
        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Projected Net Worth</p>
        <h2 className="text-3xl font-bold font-heading text-white tracking-tight">
          {formatCurrency(branch.calculatedNetWorth)}
        </h2>
        <p className="text-[10px] text-slate-500 mt-2 italic font-medium">Estimated value in 2025 (USD)</p>
      </div>

      <div className={`glass p-5 rounded-2xl border-l-4 ${isPositive ? 'border-l-emerald-500' : 'border-l-rose-500'} relative overflow-hidden`}>
        <div className="absolute top-0 right-0 p-3 opacity-10">
          <i className={`fa-solid ${isPositive ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'} text-4xl`}></i>
        </div>
        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Reality Delta</p>
        <div className="flex items-baseline gap-2">
          <h2 className={`text-3xl font-bold font-heading ${isPositive ? 'text-emerald-400' : 'text-rose-400'} tracking-tight`}>
            {isPositive ? '+' : ''}{formatCurrency(difference)}
          </h2>
          <span className={`text-xs font-bold ${isPositive ? 'text-emerald-500/70' : 'text-rose-500/70'}`}>
            ({((difference / (originalWorth || 1)) * 100).toFixed(1)}%)
          </span>
        </div>
        <p className="text-[10px] text-slate-500 mt-2 italic font-medium">vs. Prime Timeline</p>
      </div>

      <div className="glass p-5 rounded-2xl border-l-4 border-l-purple-500 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-3 opacity-10">
          <i className="fa-solid fa-clock-rotate-left text-4xl"></i>
        </div>
        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Time Point</p>
        <h2 className="text-3xl font-bold font-heading text-white tracking-tight">
          {branch.divergenceYear}
        </h2>
        <p className="text-[10px] text-slate-500 mt-2 italic font-medium">Year of divergence</p>
      </div>
    </div>
  );
};

export default StatCards;
