
import { FinancialEvent, TimelineBranch } from './types';

export const CURRENT_YEAR = 2025;
export const START_YEAR = 2010;

export const INITIAL_EVENTS: FinancialEvent[] = [
  { year: 2010, label: 'First Job', amount: 45000, type: 'income', description: 'Started as a Junior Analyst.' },
  { year: 2013, label: 'Car Purchase', amount: 25000, type: 'expense', description: 'Bought a reliable sedan.' },
  { year: 2015, label: '401k Start', amount: 5000, type: 'investment', description: 'Began matching employer contributions.' },
  { year: 2018, label: 'MBA Degree', amount: 60000, type: 'expense', description: 'Invested in higher education.' },
  { year: 2021, label: 'Home Deposit', amount: 100000, type: 'expense', description: 'Down payment for a suburban house.' },
  { year: 2023, label: 'Tech Promotion', amount: 130000, type: 'income', description: 'Senior role at a software firm.' }
];

export const MOCK_ORIGINAL_BRANCH: TimelineBranch = {
  id: 'original',
  name: 'Prime Timeline',
  color: '#3b82f6', // blue
  isOriginal: true,
  events: INITIAL_EVENTS,
  marketTrends: [], // Empty implies default 7% growth
  calculatedNetWorth: 420000,
  divergenceYear: 2010
};
