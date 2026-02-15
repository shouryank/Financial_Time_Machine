
import React from 'react';
import { MarketTrend, TimelineBranch } from '../types';
import { formatCurrency } from '../services/financeUtils';
import { CURRENT_YEAR } from '../constants';

interface StatCardsProps {
  branch: TimelineBranch;
  parentBranch: TimelineBranch | null;
  originalBranch: TimelineBranch;
}

type AssetLineItem = {
  signature: string;
  label: string;
  purchaseAmount: number;
  currentValue: number;
  yearsHeld: number;
  annualRate: number;
  trend: 'depreciate' | 'appreciate';
};

type MarketSource = 'crypto' | 'equity';

// Approximate broad-market annual returns used for non-crypto financial assets.
// This prevents crypto volatility from being incorrectly applied to savings/401k/stocks.
const DEFAULT_EQUITY_RETURNS: Record<number, number> = {
  2010: 0.15, 2011: 0.02, 2012: 0.16, 2013: 0.32, 2014: 0.14, 2015: 0.01,
  2016: 0.12, 2017: 0.21, 2018: -0.04, 2019: 0.31, 2020: 0.18, 2021: 0.28,
  2022: -0.18, 2023: 0.26, 2024: 0.15, 2025: 0.10
};

const getAssetProfile = (label: string, description: string, eventType: TimelineBranch['events'][number]['type']) => {
  const text = `${label} ${description}`.toLowerCase();
  if (/car|vehicle|auto|suv|sedan|truck/.test(text)) return { type: 'Vehicle', annualRate: 0.15, trend: 'depreciate' as const, valuation: 'fixed' as const, marketSource: null as MarketSource | null };
  if (/house|home|land|property|real estate|apartment|condo/.test(text)) return { type: 'Real Estate', annualRate: 0.04, trend: 'appreciate' as const, valuation: 'fixed' as const, marketSource: null as MarketSource | null };
  if (/crypto|bitcoin|btc|ethereum|eth/.test(text)) {
    return { type: 'Financial Asset', annualRate: 0.20, trend: 'appreciate' as const, valuation: 'market' as const, marketSource: 'crypto' as MarketSource };
  }
  if (/401k|retirement|ira|pension|stock|stocks|etf|mutual fund|index fund|shares|equity/.test(text)) {
    return { type: 'Financial Asset', annualRate: 0.08, trend: 'appreciate' as const, valuation: 'market' as const, marketSource: 'equity' as MarketSource };
  }
  if (eventType === 'investment') return { type: 'Financial Asset', annualRate: 0.08, trend: 'appreciate' as const, valuation: 'market' as const, marketSource: 'equity' as MarketSource };
  if (/phone|laptop|electronics|computer/.test(text)) return { type: 'Electronics', annualRate: 0.25, trend: 'depreciate' as const, valuation: 'fixed' as const, marketSource: null as MarketSource | null };
  if (/furniture|appliance/.test(text)) return { type: 'Household', annualRate: 0.12, trend: 'depreciate' as const, valuation: 'fixed' as const, marketSource: null as MarketSource | null };
  return null;
};

const isTrendRelevantForSource = (trend: MarketTrend, source: MarketSource): boolean => {
  const text = (trend.narrative || '').toLowerCase();
  if (source === 'crypto') {
    return /crypto|bitcoin|btc|ethereum|eth|altcoin|blockchain/.test(text);
  }
  return /stock|equity|s&p|nasdaq|index|bond|interest rate|fed|treasury|retirement|401k|etf/.test(text);
};

const getMarketGrowthRateForYear = (
  year: number,
  trends: MarketTrend[],
  fallbackRate: number,
  marketSource: MarketSource
): number => {
  const trend = trends.find(t => t.year === year);
  if (!trend || !Number.isFinite(trend.growthRate)) {
    if (marketSource === 'equity') return DEFAULT_EQUITY_RETURNS[year] ?? fallbackRate;
    return fallbackRate;
  }
  if (!isTrendRelevantForSource(trend, marketSource)) {
    if (marketSource === 'equity') return DEFAULT_EQUITY_RETURNS[year] ?? fallbackRate;
    return fallbackRate;
  }

  // Safety bounds to avoid pathological outputs from malformed trend values.
  const bounded = Math.max(-0.95, Math.min(trend.growthRate, marketSource === 'crypto' ? 5 : 1));
  return bounded;
};

const compoundWithMarketTrends = (
  principal: number,
  startYear: number,
  trends: MarketTrend[],
  fallbackRate: number,
  marketSource: MarketSource
): number => {
  let value = principal;
  for (let year = startYear + 1; year <= CURRENT_YEAR; year++) {
    value *= (1 + getMarketGrowthRateForYear(year, trends, fallbackRate, marketSource));
  }
  return Math.max(0, Math.round(value));
};

const getEventSignature = (event: TimelineBranch['events'][number]): string => {
  return `${event.year}|${event.type}|${event.amount}|${event.label.toLowerCase()}`;
};

const buildAssetItems = (events: TimelineBranch['events'], marketTrends: MarketTrend[]): AssetLineItem[] => {
  const isAssetEvent = (event: TimelineBranch['events'][number]): boolean => {
    const description = (event.description || '').toLowerCase();
    // Trust event classification from Gemini/DB mapping.
    // DB imports include intent in description, so we keep that compatibility.
    return event.type === 'investment' || /\binvestment\b/.test(description);
  };

  return events
    .filter(isAssetEvent)
    .map(e => {
      const profile = getAssetProfile(e.label, e.description, e.type);
      if (!profile) return null;
      const yearsHeld = Math.max(0, CURRENT_YEAR - e.year);
      const currentValue = profile.valuation === 'market'
        ? compoundWithMarketTrends(e.amount, e.year, marketTrends, profile.annualRate, profile.marketSource || 'equity')
        : profile.trend === 'depreciate'
          ? Math.max(0, Math.round(e.amount * Math.pow(1 - profile.annualRate, yearsHeld)))
          : Math.max(0, Math.round(e.amount * Math.pow(1 + profile.annualRate, yearsHeld)));
      return {
        signature: getEventSignature(e),
        label: `${profile.type}: ${e.label} (${e.year})`,
        purchaseAmount: e.amount,
        currentValue,
        yearsHeld,
        annualRate: profile.annualRate,
        trend: profile.trend
      };
    })
    .filter((item): item is AssetLineItem => Boolean(item));
};

const StatCards: React.FC<StatCardsProps> = ({ branch, parentBranch, originalBranch }) => {
  const sidePopupRightClass =
    'absolute top-0 left-[100%] w-[320px] max-h-[260px] opacity-0 invisible pointer-events-none group-hover:opacity-100 group-hover:visible group-hover:pointer-events-auto transition-all duration-150 bg-slate-950/95 border border-slate-700 rounded-xl p-4 text-xs z-[9999] overflow-y-auto shadow-2xl shadow-black/30';
  const sidePopupLeftClass =
    'absolute top-0 right-[100%] w-[320px] max-h-[260px] opacity-0 invisible pointer-events-none group-hover:opacity-100 group-hover:visible group-hover:pointer-events-auto transition-all duration-150 bg-slate-950/95 border border-slate-700 rounded-xl p-4 text-xs z-[9999] overflow-y-auto shadow-2xl shadow-black/30';
  const parentAssetItems = parentBranch ? buildAssetItems(parentBranch.events, parentBranch.marketTrends) : [];
  const parentAssetValueBySignature = new Map<string, number>(
    parentAssetItems.map(item => [item.signature, item.currentValue])
  );

  const branchAssetItems = buildAssetItems(branch.events, branch.marketTrends).map(item => {
    const inheritedValue = parentAssetValueBySignature.get(item.signature);
    if (inheritedValue === undefined) return item;
    // Keep parent investment valuation unchanged for inherited assets.
    return { ...item, currentValue: inheritedValue };
  });
  const originalAssetItems = buildAssetItems(originalBranch.events, originalBranch.marketTrends);
  const assetsTotal = branchAssetItems.reduce((sum, item) => sum + item.currentValue, 0);
  const originalAssetsTotal = originalAssetItems.reduce((sum, item) => sum + item.currentValue, 0);
  const totalNetWorth = branch.calculatedNetWorth + assetsTotal;
  const originalTotalWorth = originalBranch.calculatedNetWorth + originalAssetsTotal;
  const difference = totalNetWorth - originalTotalWorth;
  const isPositive = difference >= 0;
  const liquidFunds = branch.calculatedNetWorth;
  const originalLiquidFunds = originalBranch.calculatedNetWorth;
  const liquidDifference = liquidFunds - originalLiquidFunds;
  const isLiquidPositive = liquidDifference >= 0;
  const changeEvents = branch.events.filter(e => e.year >= branch.divergenceYear);
  const changeItems = changeEvents.map(event => {
    const signed = event.type === 'expense' ? -event.amount : event.amount;
    return {
      label: `${event.year} - ${event.label}`,
      signed
    };
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
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

      <div className={`glass p-5 rounded-2xl border-l-4 ${isLiquidPositive ? 'border-l-teal-500' : 'border-l-orange-500'} relative overflow-visible group z-0 hover:z-[100]`}>
        <div className="absolute top-0 right-0 p-3 opacity-10">
          <i className="fa-solid fa-wallet text-4xl"></i>
        </div>
        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Liquid Funds</p>
        <h2 className="text-3xl font-bold font-heading text-white tracking-tight">
          {formatCurrency(liquidFunds)}
        </h2>
        <p className="text-[10px] text-slate-500 mt-2 italic font-medium">Cash available now</p>
        <div className={sidePopupLeftClass}>
          <p className="text-slate-300 font-bold mb-1">Cash Breakdown</p>
          <p className="text-slate-400">Prime cash: {formatCurrency(originalLiquidFunds)}</p>
          <p className={`${isLiquidPositive ? 'text-teal-300' : 'text-orange-300'}`}>Cash delta: {isLiquidPositive ? '+' : ''}{formatCurrency(liquidDifference)}</p>
          <p className="text-slate-500 mt-2">Excludes asset market value. Includes post-divergence income/expenses/investment cash effects.</p>
        </div>
      </div>

      <div className="glass p-5 rounded-2xl border-l-4 border-l-cyan-500 relative overflow-visible group z-0 hover:z-[100]">
        <div className="absolute top-0 right-0 p-3 opacity-10">
          <i className="fa-solid fa-car-side text-4xl"></i>
        </div>
        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Non Liquid Assets</p>
        <h2 className="text-3xl font-bold font-heading text-white tracking-tight">
          {formatCurrency(assetsTotal)}
        </h2>
        <p className="text-[10px] text-slate-500 mt-2 italic font-medium">Tangible + investment assets (depreciation/appreciation)</p>
        <div className={sidePopupLeftClass}>
          <p className="text-slate-300 font-bold mb-1">Asset Line Items</p>
          <div className="space-y-1 pr-1">
            {branchAssetItems.length === 0 ? (
              <p className="text-slate-500">No asset entries found for this branch.</p>
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
