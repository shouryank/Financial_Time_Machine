
import React from 'react';
import { TimelineBranch } from '../types';
import { formatCurrency, calculateInvestmentPortfolio } from '../services/financeUtils';
import { formatMonthLabel, CURRENT_MONTH } from '../constants';

interface StatCardsProps {
  branch: TimelineBranch;
  originalBranch: TimelineBranch;
}

const StatCards: React.FC<StatCardsProps> = ({ branch, originalBranch }) => {
  // Investment portfolio valuation
  const portfolio = calculateInvestmentPortfolio(branch.events, CURRENT_MONTH);
  const cashBalance = branch.calculatedNetWorth;
  const netWorth = cashBalance + portfolio.totalPortfolioValue;

  const origPortfolio = calculateInvestmentPortfolio(originalBranch.events, CURRENT_MONTH);
  const origNetWorth = originalBranch.calculatedNetWorth + origPortfolio.totalPortfolioValue;

  const difference = netWorth - origNetWorth;
  const isPositive = difference >= 0;
  const isOriginal = branch.isOriginal;

  // Count spending categories from events
  const expenseCount = branch.events.filter(e => e.type === 'expense').length;
  const incomeCount = branch.events.filter(e => e.type === 'income').length;
  const investmentCount = branch.events.filter(e => e.type === 'investment').length;

  const portfolioGain = portfolio.totalPortfolioValue - portfolio.totalPrincipal;
  const portfolioReturn = portfolio.totalPrincipal > 0 ? portfolioGain / portfolio.totalPrincipal : 0;

  return (
    <div className="space-y-4">
      {/* Row 1: Key financial metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Net Worth */}
        <div className="glass p-5 rounded-2xl border-l-4 border-l-blue-500 relative overflow-visible">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <i className="fa-solid fa-vault text-4xl"></i>
          </div>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">
            {isOriginal ? 'Current Net Worth' : 'Alternate Net Worth'}
          </p>
          <h2 className="text-3xl font-bold font-heading text-white tracking-tight">
            {formatCurrency(netWorth)}
          </h2>
          <div className="flex gap-2 mt-2">
            <span className="text-[10px] text-slate-500 font-medium">Cash: {formatCurrency(cashBalance)}</span>
            <span className="text-[10px] text-blue-400 font-medium">+ Portfolio: {formatCurrency(portfolio.totalPortfolioValue)}</span>
          </div>
        </div>

        {/* Investment Portfolio */}
        <div className="glass p-5 rounded-2xl border-l-4 border-l-amber-500 relative overflow-visible">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <i className="fa-solid fa-chart-line text-4xl"></i>
          </div>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Portfolio Value</p>
          <h2 className="text-3xl font-bold font-heading text-white tracking-tight">
            {formatCurrency(portfolio.totalPortfolioValue)}
          </h2>
          <div className="flex gap-2 mt-2">
            <span className="text-[10px] text-slate-500 font-medium">Invested: {formatCurrency(portfolio.totalPrincipal)}</span>
            <span className={`text-[10px] font-bold ${portfolioGain >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {portfolioGain >= 0 ? '+' : ''}{formatCurrency(portfolioGain)} ({(portfolioReturn * 100).toFixed(1)}%)
            </span>
          </div>
        </div>

        {/* Reality Delta */}
        <div className={`glass p-5 rounded-2xl border-l-4 ${isOriginal ? 'border-l-slate-600' : isPositive ? 'border-l-emerald-500' : 'border-l-rose-500'} relative overflow-visible`}>
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <i className={`fa-solid ${isPositive ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'} text-4xl`}></i>
          </div>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Reality Delta</p>
          {isOriginal ? (
            <h2 className="text-3xl font-bold font-heading text-slate-500 tracking-tight">—</h2>
          ) : (
            <div className="flex items-baseline gap-2">
              <h2 className={`text-3xl font-bold font-heading ${isPositive ? 'text-emerald-400' : 'text-rose-400'} tracking-tight`}>
                {isPositive ? '+' : ''}{formatCurrency(difference)}
              </h2>
            </div>
          )}
          <p className="text-[10px] text-slate-500 mt-2 italic font-medium">vs. Prime Timeline</p>
        </div>
      </div>

      {/* Row 2: Supporting details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Transaction Breakdown */}
        <div className="glass p-5 rounded-2xl border-l-4 border-l-cyan-500 relative overflow-visible">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <i className="fa-solid fa-chart-pie text-4xl"></i>
          </div>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Transactions</p>
          <h2 className="text-3xl font-bold font-heading text-white tracking-tight">
            {branch.events.length}
          </h2>
          <div className="flex gap-3 mt-2">
            <span className="text-[10px] text-emerald-400 font-bold">{incomeCount} income</span>
            <span className="text-[10px] text-rose-400 font-bold">{expenseCount} expense</span>
            <span className="text-[10px] text-blue-400 font-bold">{investmentCount} invest</span>
          </div>
        </div>

        {/* Time Point */}
        <div className="glass p-5 rounded-2xl border-l-4 border-l-purple-500 relative overflow-visible">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <i className="fa-solid fa-clock-rotate-left text-4xl"></i>
          </div>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">
            {isOriginal ? 'Data Range' : 'Divergence Point'}
          </p>
          <h2 className="text-2xl font-bold font-heading text-white tracking-tight">
            {formatMonthLabel(branch.divergenceMonth)}
          </h2>
          <p className="text-[10px] text-slate-500 mt-2 italic font-medium">
            {isOriginal
              ? `${branch.cumulativeBalance.length} months of data`
              : 'When the timeline splits'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default StatCards;
