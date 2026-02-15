
import { FinancialEvent, MonthlyBalance } from '../types';
import { CURRENT_MONTH, START_MONTH, monthRange } from '../constants';

/**
 * Build a cumulative running balance from a sorted list of financial events.
 * Returns one MonthlyBalance entry per month from the earliest event to CURRENT_MONTH.
 */
export const buildCumulativeBalance = (
  events: FinancialEvent[],
  startMonth?: string
): MonthlyBalance[] => {
  const start = startMonth || (events.length > 0 ? events[0].month : START_MONTH);
  const months = monthRange(start, CURRENT_MONTH);

  // Bucket events by month
  const eventsByMonth = new Map<string, FinancialEvent[]>();
  for (const e of events) {
    const bucket = eventsByMonth.get(e.month) || [];
    bucket.push(e);
    eventsByMonth.set(e.month, bucket);
  }

  let balance = 0;
  const result: MonthlyBalance[] = [];

  for (const m of months) {
    const monthEvents = eventsByMonth.get(m) || [];
    for (const e of monthEvents) {
      if (e.type === 'income') balance += e.amount;
      else balance -= e.amount; // expense & investment reduce cash
    }
    result.push({ month: m, balance: Math.round(balance) });
  }

  return result;
};

/**
 * Apply a what-if delta to a base cumulative balance starting at divergenceMonth.
 * Returns a new cumulative balance array representing the alternate timeline.
 *
 * @param baseBalance    – the prime timeline cumulative balance
 * @param divergenceMonth – when the change starts
 * @param monthlyDelta   – net monthly cash difference (positive = saving more)
 * @param lumpSumDelta   – one-time change at divergence (e.g. investment gain)
 */
export const applyWhatIfDelta = (
  baseBalance: MonthlyBalance[],
  divergenceMonth: string,
  monthlyDelta: number,
  lumpSumDelta: number
): MonthlyBalance[] => {
  let accumulatedDelta = 0;
  let divergenceReached = false;

  return baseBalance.map(entry => {
    if (entry.month >= divergenceMonth) {
      if (!divergenceReached) {
        divergenceReached = true;
        accumulatedDelta += lumpSumDelta;
      }
      accumulatedDelta += monthlyDelta;
      return { month: entry.month, balance: Math.round(entry.balance + accumulatedDelta) };
    }
    return { ...entry };
  });
};

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(amount);
};

export const formatPercentage = (rate: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    maximumFractionDigits: 1
  }).format(rate);
};

/** Annual growth rates by investment category keyword */
const INVESTMENT_GROWTH_RATES: Record<string, number> = {
  'index fund': 0.10,          // ~10% annual (S&P 500 average)
  'etf': 0.10,
  's&p': 0.10,
  'mutual fund': 0.08,
  'private equity': 0.12,      // ~12% annual
  'savings': 0.04,             // ~4% HYSA
  'bond': 0.05,
  'bitcoin': 0.60,             // aggressive crypto avg
  'crypto': 0.40,
  'real estate': 0.07,
  'reit': 0.08,
};
const DEFAULT_GROWTH_RATE = 0.08; // 8% fallback

/** Determine annual growth rate from merchant/category text */
const getGrowthRate = (label: string): number => {
  const lower = label.toLowerCase();
  for (const [keyword, rate] of Object.entries(INVESTMENT_GROWTH_RATES)) {
    if (lower.includes(keyword)) return rate;
  }
  return DEFAULT_GROWTH_RATE;
};

/** Count months between two "YYYY-MM" strings */
const monthsBetween = (from: string, to: string): number => {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
};

export interface InvestmentHolding {
  label: string;
  principal: number;
  currentValue: number;
  growthRate: number;      // annual
  investedMonth: string;
}

/**
 * Calculate the current appreciated/depreciated value of all investment events.
 * Returns individual holdings and the total portfolio value.
 */
export const calculateInvestmentPortfolio = (
  events: FinancialEvent[],
  currentMonth: string
): { holdings: InvestmentHolding[]; totalPortfolioValue: number; totalPrincipal: number } => {
  const investments = events.filter(e => e.type === 'investment');
  const holdings: InvestmentHolding[] = investments.map(inv => {
    const rate = getGrowthRate(inv.label + ' ' + inv.description);
    const months = Math.max(0, monthsBetween(inv.month, currentMonth));
    const monthlyRate = Math.pow(1 + rate, 1 / 12) - 1;
    const currentValue = Math.round(inv.amount * Math.pow(1 + monthlyRate, months));
    return {
      label: inv.label,
      principal: inv.amount,
      currentValue,
      growthRate: rate,
      investedMonth: inv.month,
    };
  });

  const totalPortfolioValue = holdings.reduce((sum, h) => sum + h.currentValue, 0);
  const totalPrincipal = holdings.reduce((sum, h) => sum + h.principal, 0);
  return { holdings, totalPortfolioValue, totalPrincipal };
};
