
import { GoogleGenAI, Type } from "@google/genai";
import { SimulationScenario } from "../types";
import { CURRENT_MONTH } from "../constants";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

const SYSTEM_INSTRUCTION = `
You are the AI Orchestrator of the Financial Time Machine.
The user has REAL bank transaction data spanning from 2015 to ${CURRENT_MONTH}.
They want to go back to a past date and explore: "What if I had done X differently?"

Three main what-if patterns:

A) **Remove recurring spending**: e.g. "What if I stopped buying coffee in 2020?"
   - Compute the average monthly spend on that category from the user's real data.
   - Return removedSpending with the category and monthlyAmount.
   - totalImpact = monthlyAmount × number of months from divergence to present.
   - monthlyImpact = monthlyAmount (positive, since they save it).
   - Set addedInvestment = null, assetPurchase = null.

B) **Make a past investment (appreciating asset)**: e.g. "What if I invested $5k in NVIDIA in Jan 2020?"
   - Look up the real historical price of that asset at the divergence date and today.
   - Return addedInvestment with asset name, amountInvested, priceAtEntry, priceNow.
   - totalImpact = (priceNow / priceAtEntry) × amountInvested − amountInvested (the gain).
   - monthlyImpact = 0 (it's a lump sum, not recurring).
   - Set removedSpending = null, assetPurchase = null.

C) **Buy a depreciating asset (one-time purchase)**: e.g. "What if I bought a car for $100k in Jan 2019?"
   - This is a CASH OUTFLOW (reduces balance) + creates a depreciating asset with residual value.
   - Return assetPurchase with:
     - asset: name (e.g. "Car", "Boat")
     - purchasePrice: what they paid
     - currentValue: estimated value today after depreciation
     - annualDepreciation: rate as negative decimal (e.g. -0.15 for cars losing ~15%/year)
     - monthlyExpenses: estimated recurring costs (insurance, gas, maintenance). For cars: ~$500-800/mo; boats: ~$300-500/mo; etc.
   - Depreciation rules:
     - Cars: ~15% per year. A $100k car after 7 years ≈ $100k × (1-0.15)^7 ≈ $32k.
     - Luxury cars depreciate faster (~20%/year first 3 years, then ~10%).
     - Boats: ~10-15% per year.
     - Electronics: ~30% per year.
     - Motorcycles: ~10% per year.
   - monthlyImpact = -(monthlyExpenses) — negative because it's additional spending.
   - totalImpact = -(purchasePrice) - (monthlyExpenses × months) + currentValue.
     This represents: lost cash from purchase, lost cash from upkeep, plus the asset's residual value.
   - Set removedSpending = null, addedInvestment = null.

D) **One-time expense / payment (no asset acquired)**: e.g. "What if I had $10k in medical bills?", "What if I donated $5k to charity in 2022?", "What if I paid $20k in legal fees?"
   - This is a pure CASH OUTFLOW with NO asset or investment created.
   - Set removedSpending = null, addedInvestment = null, assetPurchase = null.
   - monthlyImpact = 0 (it's a one-time cost, not recurring).
   - totalImpact = -(expense amount). E.g. for $10k medical bills → totalImpact = -10000.
   - Examples: medical/hospital bills, emergency repairs, legal fees, gifts, donations, tuition payments, wedding costs, funeral costs, fines, tax penalties, moving expenses.
   - If the user mentions ongoing costs (e.g. "medical bills every month"), treat the monthly portion as monthlyImpact and the initial cost as totalImpact.
   - branchName should describe the expense, e.g. "$10K Medical Bills", "$5K Charity Donation".

Supported investment assets (use REAL historical monthly close prices for these):

**Top 20 Stocks:**
| Ticker | Company               | Approx Feb 2026 Price |
|--------|----------------------|----------------------|
| NVDA   | NVIDIA               | ~$135                |
| AAPL   | Apple                | ~$235                |
| MSFT   | Microsoft            | ~$410                |
| AMZN   | Amazon               | ~$225                |
| GOOGL  | Alphabet (Google)    | ~$185                |
| META   | Meta Platforms       | ~$690                |
| TSLA   | Tesla                | ~$355                |
| TSM    | Taiwan Semiconductor | ~$205                |
| AVGO   | Broadcom             | ~$225                |
| JPM    | JPMorgan Chase       | ~$270                |
| V      | Visa                 | ~$340                |
| WMT    | Walmart              | ~$105                |
| MA     | Mastercard           | ~$535                |
| NFLX   | Netflix              | ~$1010               |
| COST   | Costco               | ~$1050               |
| AMD    | AMD                  | ~$115                |
| DIS    | Walt Disney          | ~$110                |
| SPY    | S&P 500 ETF          | ~$605                |
| QQQ    | Nasdaq 100 ETF       | ~$530                |
| VOO    | Vanguard S&P 500 ETF | ~$555                |

**Top 10 Cryptocurrencies:**
| Symbol | Name           | Approx Feb 2026 Price |
|--------|---------------|----------------------|
| BTC    | Bitcoin       | ~$97,000             |
| ETH    | Ethereum      | ~$2,700              |
| SOL    | Solana        | ~$200                |
| BNB    | BNB           | ~$660                |
| XRP    | Ripple        | ~$2.65               |
| ADA    | Cardano       | ~$0.75               |
| DOGE   | Dogecoin      | ~$0.26               |
| DOT    | Polkadot      | ~$5.10               |
| AVAX   | Avalanche     | ~$26                 |
| MATIC  | Polygon       | ~$0.30               |

Use these approximate current prices along with your knowledge of REAL historical prices
for calculating investment returns. For any date, use the actual historical close price
(or your best estimate) for that asset at that month.

Rules:
- divergenceMonth MUST be a "YYYY-MM" string.
- Use REAL historical prices for ALL supported stocks and cryptos listed above.
- Be accurate with stock/crypto prices. Use close-to-close monthly prices.
- Be realistic with depreciation rates and ongoing costs.
- branchName should be short and descriptive, e.g. "No Coffee Since 2020", "NVIDIA Investor", "$100k Car Owner".
- explanation should be 1-2 sentences explaining the outcome.
- Only populate ONE of removedSpending, addedInvestment, or assetPurchase per scenario. The others must be null.
- If the user's request doesn't fit any pattern, do your best to estimate monthlyImpact and totalImpact.
- Current month is ${CURRENT_MONTH}.

Return JSON matching the schema exactly.
`;

export const generateScenario = async (prompt: string): Promise<SimulationScenario> => {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          divergenceMonth: { type: Type.STRING, description: "YYYY-MM format" },
          whatIfDescription: { type: Type.STRING, description: "Human-readable description of the what-if" },
          removedSpending: {
            type: Type.OBJECT,
            nullable: true,
            properties: {
              category: { type: Type.STRING },
              monthlyAmount: { type: Type.NUMBER, description: "Average monthly spend on this category" }
            },
            required: ["category", "monthlyAmount"]
          },
          addedInvestment: {
            type: Type.OBJECT,
            nullable: true,
            properties: {
              asset: { type: Type.STRING, description: "Asset name e.g. NVIDIA, Bitcoin" },
              amountInvested: { type: Type.NUMBER },
              priceAtEntry: { type: Type.NUMBER, description: "Price per share/unit at divergence date" },
              priceNow: { type: Type.NUMBER, description: "Price per share/unit today" }
            },
            required: ["asset", "amountInvested", "priceAtEntry", "priceNow"]
          },
          assetPurchase: {
            type: Type.OBJECT,
            nullable: true,
            properties: {
              asset: { type: Type.STRING, description: "Asset name e.g. Car, Boat, House" },
              purchasePrice: { type: Type.NUMBER, description: "Original purchase price" },
              currentValue: { type: Type.NUMBER, description: "Estimated value today after depreciation" },
              annualDepreciation: { type: Type.NUMBER, description: "Annual depreciation rate as negative decimal e.g. -0.15" },
              monthlyExpenses: { type: Type.NUMBER, description: "Estimated monthly recurring costs (insurance, maintenance, etc.)" }
            },
            required: ["asset", "purchasePrice", "currentValue", "annualDepreciation", "monthlyExpenses"]
          },
          monthlyImpact: { type: Type.NUMBER, description: "Net monthly cash difference (positive = saving more)" },
          totalImpact: { type: Type.NUMBER, description: "Total accumulated difference to present" },
          branchName: { type: Type.STRING },
          explanation: { type: Type.STRING }
        },
        required: ["divergenceMonth", "whatIfDescription", "monthlyImpact", "totalImpact", "branchName", "explanation"]
      }
    }
  });

  try {
    const data = JSON.parse(response.text || '{}');
    if (!data || typeof data !== 'object') {
      throw new Error('Model returned an empty or invalid scenario payload.');
    }

    const divergenceMonth = typeof data.divergenceMonth === 'string' ? data.divergenceMonth : '';
    if (!/^\d{4}-\d{2}$/.test(divergenceMonth)) {
      throw new Error('Model did not return a valid divergence month (YYYY-MM).');
    }

    return {
      divergenceMonth,
      whatIfDescription: data.whatIfDescription || '',
      removedSpending: data.removedSpending || null,
      addedInvestment: data.addedInvestment || null,
      assetPurchase: data.assetPurchase || null,
      monthlyImpact: Number(data.monthlyImpact) || 0,
      totalImpact: Number(data.totalImpact) || 0,
      branchName: data.branchName || 'Alternate Timeline',
      explanation: data.explanation || 'Scenario generated.'
    };
  } catch (e) {
    console.error("Failed to parse scenario", e);
    throw new Error(e instanceof Error ? e.message : "Timeline distortion detected. Could not stabilize scenario.");
  }
};
