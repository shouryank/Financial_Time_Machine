
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

Rules:
- divergenceMonth MUST be a "YYYY-MM" string.
- Use REAL historical prices for investments (NVIDIA, Bitcoin, Tesla, S&P500, etc.)
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
