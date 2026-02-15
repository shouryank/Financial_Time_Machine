
import { TimelineBranch } from './types';

export const CURRENT_MONTH = '2026-02';   // present month
export const START_MONTH = '2015-01';     // earliest data in Atlas

// Keep legacy year constants for anything that still references them during migration
export const CURRENT_YEAR = 2026;
export const START_YEAR = 2015;

/** Generate an ordered array of "YYYY-MM" strings between two months (inclusive). */
export const monthRange = (from: string, to: string): string[] => {
  const months: string[] = [];
  const [startY, startM] = from.split('-').map(Number);
  const [endY, endM] = to.split('-').map(Number);
  let y = startY;
  let m = startM;
  while (y < endY || (y === endY && m <= endM)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
};

/** Format "YYYY-MM" to a short human label like "Jan '15" */
export const formatMonthLabel = (month: string): string => {
  const [y, m] = month.split('-').map(Number);
  const labels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${labels[m - 1]} '${String(y).slice(-2)}`;
};

/** Visually distinct branch colors – original uses #3b82f6 (blue), these avoid it. */
export const BRANCH_COLORS: string[] = [
  '#f97316', // orange
  '#a855f7', // purple
  '#14b8a6', // teal
  '#ef4444', // red
  '#eab308', // yellow
  '#ec4899', // pink
  '#22c55e', // green
  '#06b6d4', // cyan
  '#f43f5e', // rose
  '#8b5cf6', // violet
  '#84cc16', // lime
  '#d946ef', // fuchsia
];

export const MOCK_ORIGINAL_BRANCH: TimelineBranch = {
  id: 'original',
  hierarchyCode: '1',
  name: 'Prime Timeline',
  color: '#3b82f6',
  isOriginal: true,
  events: [],
  marketTrends: [],
  cumulativeBalance: [],
  calculatedNetWorth: 0,
  divergenceMonth: START_MONTH
};
