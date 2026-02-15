
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

Supported investment assets with SPLIT-ADJUSTED historical prices and current prices.
IMPORTANT: All stock prices below are SPLIT-ADJUSTED. Use ONLY these prices — do NOT use your own memory of stock prices.
When calculating returns, look up the entry price from the historical column closest to (but not after) the user's divergence date.

**Top 20 Stocks (split-adjusted monthly close prices):**
| Ticker | Company               | Jan 2015 | Jan 2016 | Jan 2017 | Jan 2018 | Jan 2019 | Jan 2020 | Jan 2021 | Jan 2022 | Jan 2023 | Jan 2024 | Jan 2025 | Feb 2026 (Now) |
|--------|-----------------------|----------|----------|----------|----------|----------|----------|----------|----------|----------|----------|----------|----------------|
| NVDA   | NVIDIA                | $0.51    | $0.80    | $2.74    | $6.06    | $3.68    | $5.92    | $13.10   | $61.40   | $19.44   | $61.50   | $117.10  | $135           |
| AAPL   | Apple                 | $27.30   | $24.15   | $30.80   | $42.10   | $39.30   | $77.40   | $131.70  | $175.80  | $143.20  | $184.40  | $232.00  | $235           |
| MSFT   | Microsoft             | $46.50   | $52.30   | $65.80   | $95.00   | $104.40  | $170.20  | $231.60  | $310.20  | $248.20  | $397.60  | $415.30  | $410           |
| AMZN   | Amazon                | $15.30   | $29.40   | $40.80   | $69.50   | $83.50   | $94.50   | $163.50  | $164.30  | $103.40  | $155.90  | $220.00  | $225           |
| GOOGL  | Alphabet (Google)     | $26.60   | $37.40   | $41.90   | $55.90   | $53.10   | $72.20   | $88.50   | $136.50  | $99.10   | $141.00  | $191.60  | $185           |
| META   | Meta Platforms        | $76.10   | $94.50   | $130.00  | $187.80  | $150.40  | $209.90  | $265.40  | $323.60  | $148.10  | $390.40  | $620.40  | $690           |
| TSLA   | Tesla                 | $14.60   | $8.10    | $16.60   | $23.50   | $20.60   | $32.40   | $264.50  | $312.00  | $113.10  | $187.30  | $378.00  | $355           |
| TSM    | Taiwan Semiconductor  | $23.80   | $23.30   | $29.40   | $43.90   | $37.00   | $58.70   | $127.00  | $122.80  | $82.50   | $106.70  | $197.70  | $205           |
| AVGO   | Broadcom              | $10.60   | $14.20   | $21.10   | $25.30   | $24.10   | $32.30   | $43.40   | $62.90   | $59.00   | $123.00  | $224.80  | $225           |
| JPM    | JPMorgan Chase        | $57.20   | $56.60   | $86.30   | $113.50  | $98.60   | $135.00  | $134.90  | $150.20  | $139.60  | $184.50  | $260.30  | $270           |
| V      | Visa                  | $61.80   | $72.40   | $86.00   | $119.80  | $132.00  | $193.00  | $198.20  | $226.80  | $221.10  | $275.30  | $318.70  | $340           |
| WMT    | Walmart               | $85.30   | $63.70   | $68.80   | $106.60  | $95.10   | $114.50  | $144.80  | $140.60  | $144.20  | $163.50  | $91.50   | $105           |
| MA     | Mastercard            | $86.70   | $88.50   | $113.80  | $172.80  | $195.50  | $317.50  | $316.90  | $375.50  | $365.10  | $444.50  | $519.00  | $535           |
| NFLX   | Netflix               | $48.80   | $91.30   | $128.70  | $260.60  | $336.50  | $342.50  | $532.40  | $427.10  | $363.00  | $567.50  | $942.30  | $1010          |
| COST   | Costco                | $142.50  | $152.40  | $166.50  | $190.60  | $213.00  | $303.40  | $362.00  | $498.30  | $500.00  | $677.60  | $920.90  | $1050          |
| AMD    | AMD                   | $2.63    | $1.89    | $11.20   | $12.40   | $22.60   | $49.10   | $91.70   | $121.50  | $69.40   | $160.40  | $119.10  | $115           |
| DIS    | Walt Disney           | $94.10   | $96.60   | $110.00  | $111.00  | $110.00  | $140.60  | $170.90  | $155.30  | $107.60  | $95.30   | $112.80  | $110           |
| SPY    | S&P 500 ETF           | $199.50  | $193.70  | $227.50  | $281.80  | $249.90  | $324.90  | $383.80  | $449.20  | $406.30  | $482.90  | $590.50  | $605           |
| QQQ    | Nasdaq 100 ETF        | $103.30  | $105.10  | $131.10  | $174.50  | $158.80  | $218.30  | $320.90  | $371.00  | $291.10  | $408.10  | $517.20  | $530           |
| VOO    | Vanguard S&P 500 ETF  | $183.50  | $178.00  | $209.10  | $259.30  | $229.80  | $299.00  | $353.30  | $413.40  | $373.80  | $444.60  | $543.50  | $555           |

**Top 10 Cryptocurrencies (monthly close prices):**
| Symbol | Name           | Jan 2015 | Jan 2016 | Jan 2017 | Jan 2018 | Jan 2019 | Jan 2020 | Jan 2021 | Jan 2022 | Jan 2023 | Jan 2024 | Jan 2025 | Feb 2026 (Now) |
|--------|---------------|----------|----------|----------|----------|----------|----------|----------|----------|----------|----------|----------|----------------|
| BTC    | Bitcoin       | $217     | $378     | $970     | $10,100  | $3,460   | $9,350   | $33,100  | $38,500  | $23,100  | $42,600  | $102,000 | $97,000        |
| ETH    | Ethereum      | —        | $1.00    | $10.50   | $1,120   | $107     | $173     | $1,370   | $2,540   | $1,580   | $2,280   | $3,300   | $2,700         |
| SOL    | Solana        | —        | —        | —        | —        | —        | $0.22    | $1.60    | $103     | $24.30   | $97.70   | $210     | $200           |
| BNB    | BNB           | —        | —        | —        | $12.60   | $6.20    | $14.60   | $44.30   | $369     | $305     | $317     | $690     | $660           |
| XRP    | Ripple        | $0.015   | $0.006   | $0.006   | $1.10    | $0.29    | $0.24    | $0.31    | $0.61    | $0.41    | $0.55    | $3.04    | $2.65          |
| ADA    | Cardano       | —        | —        | —        | $0.50    | $0.04    | $0.04    | $0.35    | $1.07    | $0.38    | $0.55    | $1.01    | $0.75          |
| DOGE   | Dogecoin      | $0.0002  | $0.0002  | $0.0009  | $0.007   | $0.002   | $0.003   | $0.04    | $0.15    | $0.09    | $0.08    | $0.35    | $0.26          |
| DOT    | Polkadot      | —        | —        | —        | —        | —        | —        | $8.80    | $22.30   | $6.30    | $7.40    | $6.10    | $5.10          |
| AVAX   | Avalanche     | —        | —        | —        | —        | —        | —        | $3.60    | $75.50   | $18.30   | $35.30   | $36.10   | $26            |
| MATIC  | Polygon       | —        | —        | —        | —        | $0.01    | $0.02    | $0.04    | $1.80    | $1.08    | $0.80    | $0.46    | $0.30          |

CRITICAL INSTRUCTIONS FOR INVESTMENT CALCULATIONS:
1. ALWAYS look up the entry price from the table above for the divergence month. Use the closest earlier column.
2. ALWAYS use the "Feb 2026 (Now)" column for the current price.
3. Calculate: shares_bought = amountInvested / priceAtEntry. currentValue = shares_bought × priceNow.
4. totalImpact = currentValue - amountInvested (the net gain/loss).
5. priceAtEntry and priceNow in the response MUST match the table values.
6. Example: "$5000 in NVDA Jan 2020" → priceAtEntry = $5.92, priceNow = $135, shares = 844.6, value = $114,020, gain = $109,020.
   (NVDA had a 10:1 split in Jun 2024 — all prices above are already split-adjusted.)

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
