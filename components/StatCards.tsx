
import React from 'react';
import { TimelineBranch } from '../types';
import { formatCurrency } from '../services/financeUtils';
import { CURRENT_YEAR } from '../constants';

interface StatCardsProps {
  branch: TimelineBranch;
  originalBranch: TimelineBranch;
}

type AssetLineItem = {
  label: string;
  purchaseAmount: number;
  currentValue: number;
  yearsHeld: number;
  annualDepreciation: number;
};

const getAssetProfile = (label: string, description: string) => {
  const text = `${label} ${description}`.toLowerCase();
  if (/car|vehicle|auto|suv|sedan|truck/.test(text)) return { type: 'Vehicle', annualDepreciation: 0.15 };
  if (/phone|laptop|electronics|computer/.test(text)) return { type: 'Electronics', annualDepreciation: 0.25 };
  if (/furniture|appliance/.test(text)) return { type: 'Household', annualDepreciation: 0.12 };
  return null;
};

const buildAssetItems = (events: TimelineBranch['events']): AssetLineItem[] => {
  return events
    .filter(e => e.type === 'expense')
    .map(e => {
      const profile = getAssetProfile(e.label, e.description);
      if (!profile) return null;
      const yearsHeld = Math.max(0, CURRENT_YEAR - e.year);
      const currentValue = Math.max(0, Math.round(e.amount * Math.pow(1 - profile.annualDepreciation, yearsHeld)));
      return {
        label: `${profile.type} (${e.year})`,
        purchaseAmount: e.amount,
        currentValue,
        yearsHeld,
        annualDepreciation: profile.annualDepreciation
      };
    })
    .filter((item): item is AssetLineItem => Boolean(item));
};

const StatCards: React.FC<StatCardsProps> = ({ branch, originalBranch }) => {
  const sidePopupRightClass =
    'absolute top-0 left-[calc(100%+12px)] w-[320px] max-h-[260px] opacity-0 invisible pointer-events-none group-hover:opacity-100 group-hover:visible group-hover:pointer-events-auto transition-all duration-150 bg-slate-950/95 border border-slate-700 rounded-xl p-4 text-xs z-[9999] overflow-y-auto shadow-2xl shadow-black/30';
  const sidePopupLeftClass =
    'absolute top-0 right-[calc(100%+12px)] w-[320px] max-h-[260px] opacity-0 invisible pointer-events-none group-hover:opacity-100 group-hover:visible group-hover:pointer-events-auto transition-all duration-150 bg-slate-950/95 border border-slate-700 rounded-xl p-4 text-xs z-[9999] overflow-y-auto shadow-2xl shadow-black/30';
  const branchAssetItems = buildAssetItems(branch.events);
  const originalAssetItems = buildAssetItems(originalBranch.events);
  const assetsTotal = branchAssetItems.reduce((sum, item) => sum + item.currentValue, 0);
  const originalAssetsTotal = originalAssetItems.reduce((sum, item) => sum + item.currentValue, 0);
  const totalNetWorth = branch.calculatedNetWorth + assetsTotal;
  const originalTotalWorth = originalBranch.calculatedNetWorth + originalAssetsTotal;
  const difference = totalNetWorth - originalTotalWorth;
  const isPositive = difference >= 0;
  const changeEvents = branch.events.filter(e => e.year >= branch.divergenceYear);
  const changeItems = changeEvents.map(event => {
    const signed = event.type === 'expense' ? -event.amount : event.amount;
    return {
      label: `${event.year} - ${event.label}`,
      signed
    };
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      <div className="glass p-5 rounded-2xl border-l-4 border-l-blue-500 relative overflow-visible group z-0 hover:z-[100]">
        <div className="absolute top-0 right-0 p-3 opacity-10">
          <i className="fa-solid fa-vault text-4xl"></i>
        </div>
        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Projected Net Worth</p>
        <h2 className="text-3xl font-bold font-heading text-white tracking-tight">
          {formatCurrency(totalNetWorth)}
        </h2>
        <p className="text-[10px] text-slate-500 mt-2 italic font-medium">Saved/invested + assets in 2025 (USD)</p>
        <div className={sidePopupRightClass}>
          <p className="text-slate-300 font-bold mb-1">Calculation Breakdown</p>
          <p className="text-slate-400">Saved/invested: {formatCurrency(branch.calculatedNetWorth)}</p>
          <p className="text-cyan-300">Assets: {formatCurrency(assetsTotal)}</p>
          <p className="text-slate-400">Prime total: {formatCurrency(originalTotalWorth)}</p>
          <p className={`${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>Branch delta: {isPositive ? '+' : ''}{formatCurrency(difference)}</p>
          <div className="mt-2 space-y-1 pr-1">
            {changeItems.length === 0 ? (
              <p className="text-slate-500">No divergence changes.</p>
            ) : (
              changeItems.map((item, idx) => (
                <p key={idx} className={item.signed >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {item.label}: {item.signed >= 0 ? '+' : ''}{formatCurrency(item.signed)}
                </p>
              ))
            )}
          </div>
        </div>
      </div>

      <div className={`glass p-5 rounded-2xl border-l-4 ${isPositive ? 'border-l-emerald-500' : 'border-l-rose-500'} relative overflow-visible group z-0 hover:z-[100]`}>
        <div className="absolute top-0 right-0 p-3 opacity-10">
          <i className={`fa-solid ${isPositive ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'} text-4xl`}></i>
        </div>
        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Reality Delta</p>
        <div className="flex items-baseline gap-2">
          <h2 className={`text-3xl font-bold font-heading ${isPositive ? 'text-emerald-400' : 'text-rose-400'} tracking-tight`}>
            {isPositive ? '+' : ''}{formatCurrency(difference)}
          </h2>
          <span className={`text-xs font-bold ${isPositive ? 'text-emerald-500/70' : 'text-rose-500/70'}`}>
            ({((difference / (originalTotalWorth || 1)) * 100).toFixed(1)}%)
          </span>
        </div>
        <p className="text-[10px] text-slate-500 mt-2 italic font-medium">vs. Prime Timeline</p>
        <div className={sidePopupRightClass}>
          <p className="text-slate-300 font-bold mb-1">Delta Components</p>
          <p className="text-slate-400">Prime total: {formatCurrency(originalTotalWorth)}</p>
          <p className="text-slate-400">Branch total: {formatCurrency(totalNetWorth)}</p>
          <p className={`${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>Difference: {isPositive ? '+' : ''}{formatCurrency(difference)}</p>
        </div>
      </div>

      <div className="glass p-5 rounded-2xl border-l-4 border-l-cyan-500 relative overflow-visible group z-0 hover:z-[100]">
        <div className="absolute top-0 right-0 p-3 opacity-10">
          <i className="fa-solid fa-car-side text-4xl"></i>
        </div>
        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Assets Value</p>
        <h2 className="text-3xl font-bold font-heading text-white tracking-tight">
          {formatCurrency(assetsTotal)}
        </h2>
        <p className="text-[10px] text-slate-500 mt-2 italic font-medium">Depreciated current value</p>
        <div className={sidePopupLeftClass}>
          <p className="text-slate-300 font-bold mb-1">Asset Line Items</p>
          <div className="space-y-1 pr-1">
            {branchAssetItems.length === 0 ? (
              <p className="text-slate-500">No tracked tangible assets from this divergence.</p>
            ) : (
              branchAssetItems.map((asset, idx) => (
                <p key={idx} className="text-cyan-300">
                  {asset.label}: {formatCurrency(asset.purchaseAmount)} {'\u2192'} {formatCurrency(asset.currentValue)}
                </p>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="glass p-5 rounded-2xl border-l-4 border-l-purple-500 relative overflow-visible group z-0 hover:z-[100]">
        <div className="absolute top-0 right-0 p-3 opacity-10">
          <i className="fa-solid fa-clock-rotate-left text-4xl"></i>
        </div>
        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Time Point</p>
        <h2 className="text-3xl font-bold font-heading text-white tracking-tight">
          {branch.divergenceYear}
        </h2>
        <p className="text-[10px] text-slate-500 mt-2 italic font-medium">Year of divergence</p>
        <div className={sidePopupLeftClass}>
          <p className="text-slate-300 font-bold mb-1">Divergence Detail</p>
          <p className="text-slate-400">Changed events: {changeEvents.length}</p>
          <div className="mt-1 space-y-1 pr-1">
            {changeEvents.slice(0, 6).map((event, idx) => (
              <p key={idx} className="text-purple-300">{event.year} - {event.label}</p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatCards;
