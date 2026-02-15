
export interface FinancialEvent {
  month: string;          // "YYYY-MM" e.g. "2023-06"
  label: string;
  amount: number;
  type: 'income' | 'expense' | 'investment';
  description: string;
}

export interface MarketTrend {
  month: string;          // "YYYY-MM"
  growthRate: number;     // monthly rate e.g. 0.02 for 2%
  narrative: string;
}

export interface TimelineBranch {
  id: string;
  parentId?: string;
  hierarchyCode: string;
  name: string;
  color: string;
  isOriginal: boolean;
  events: FinancialEvent[];
  marketTrends: MarketTrend[];
  cumulativeBalance: MonthlyBalance[];   // running balance per month for chart
  calculatedNetWorth: number;            // final balance at present month
  divergenceMonth: string;               // "YYYY-MM"
}

/** Pre-computed running balance for charting */
export interface MonthlyBalance {
  month: string;   // "YYYY-MM"
  balance: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface SimulationScenario {
  divergenceMonth: string;           // "YYYY-MM"
  whatIfDescription: string;         // human-readable description
  removedSpending: RemovedSpending | null;
  addedInvestment: AddedInvestment | null;
  assetPurchase: AssetPurchase | null;
  monthlyImpact: number;            // net monthly cash difference
  totalImpact: number;              // total accumulated difference to present
  branchName: string;
  explanation: string;
}

/** Describes recurring spending the user wants to eliminate */
export interface RemovedSpending {
  category: string;       // e.g. "Coffee"
  monthlyAmount: number;  // average monthly spend
}

/** Describes an investment the user wishes they had made */
export interface AddedInvestment {
  asset: string;          // e.g. "NVIDIA", "Bitcoin"
  amountInvested: number;
  priceAtEntry: number;
  priceNow: number;
}

/** Describes a one-time purchase of a depreciating (or appreciating) asset */
export interface AssetPurchase {
  asset: string;              // e.g. "Car", "Boat", "House"
  purchasePrice: number;      // what they paid
  currentValue: number;       // estimated value today
  annualDepreciation: number; // e.g. -0.15 for 15% annual depreciation
  monthlyExpenses: number;    // recurring costs (insurance, maintenance, gas)
}
