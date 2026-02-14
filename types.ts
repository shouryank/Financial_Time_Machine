
export interface FinancialEvent {
  year: number;
  label: string;
  amount: number;
  type: 'income' | 'expense' | 'investment';
  description: string;
}

export interface MarketTrend {
  year: number;
  growthRate: number; // e.g. 0.20 for 20% growth, -0.05 for 5% loss
  narrative: string; // "Crypto bull run" or "Housing market crash"
}

export interface TimelineBranch {
  id: string;
  parentId?: string; // ID of the branch this one diverged from
  name: string;
  color: string;
  isOriginal: boolean;
  events: FinancialEvent[];
  marketTrends: MarketTrend[]; // Historical performance data for this timeline
  calculatedNetWorth: number; // Final worth at current year (2025)
  divergenceYear: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface SimulationScenario {
  divergenceYear: number;
  newEvents: FinancialEvent[];
  branchName: string;
  explanation: string;
  marketTrends: MarketTrend[];
}
