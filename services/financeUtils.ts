
import { FinancialEvent, MarketTrend } from '../types';
import { CURRENT_YEAR, START_YEAR } from '../constants';

export const calculateCompoundGrowth = (
  initialValue: number,
  events: FinancialEvent[],
  marketTrends: MarketTrend[] = []
): number => {
  let currentValue = initialValue;
  let currentAnnualIncome = 0;
  
  // We simulate the full timeline from the beginning (2010) to now (2025)
  // to ensure all past salary accumulation is accounted for.
  for (let year = START_YEAR; year <= CURRENT_YEAR; year++) {
    
    // 1. Determine Growth Rate for this year
    // If specific AI historical data exists, use it. Otherwise default to 7%
    const trend = marketTrends.find(t => t.year === year);
    const annualReturn = trend ? trend.growthRate : 0.07;

    // Apply growth to previous year's total
    currentValue *= (1 + annualReturn);
    
    // 2. Process events for this specific year
    const yearEvents = events.filter(e => e.year === year);
    for (const event of yearEvents) {
      if (event.type === 'income') {
        // Income events update the "Annual Salary" state
        // This persists for future years until changed
        currentAnnualIncome = event.amount;
      } else if (event.type === 'expense') {
        currentValue -= event.amount;
      } else if (event.type === 'investment') {
        // Direct injection of extra capital
        currentValue += event.amount;
      }
    }

    // 3. Add Annual Savings (20% of current salary)
    // This ensures that even in years with no events, you are saving money
    if (currentAnnualIncome > 0) {
      currentValue += currentAnnualIncome * 0.2;
    }
  }
  
  // Return rounded value. We allow negative numbers to show debt.
  return Math.round(currentValue);
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
