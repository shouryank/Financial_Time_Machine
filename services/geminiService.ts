
import { GoogleGenAI, Type } from "@google/genai";
import { FinancialEvent, SimulationScenario } from "../types";
import { CURRENT_YEAR } from "../constants";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

const SYSTEM_INSTRUCTION = `
You are the AI Orchestrator and Financial Historian of the Financial Time Machine.
The user wants to go back in time to change a financial decision.

Your Goal:
1. Analyze the user's request (e.g., "Buy Bitcoin in 2015").
2. Create a realistic "Alternate Timeline".
3. **CRITICAL: PRESERVE THE FUTURE.**
   - The user's life (Job, House, Education) likely continues unless the decision specifically stops it.
   - You MUST copy/regenerate the user's future events (from the provided Context) into 'newEvents' for the years after divergence, unless the new decision logically makes them impossible.
   - If you do not include these future income events, the user will look bankrupt. 

4. **Market Trends**:
   - Generate a "Market Trend" map for the years between the divergence and ${CURRENT_YEAR}.
   - Use REAL historical data (e.g. Crypto boom 2017, Covid crash 2020).
   - If buying a specific asset (e.g. "Buy a Classic Car"), track the value of THAT asset type.
   - IMPORTANT: keep trends asset-class specific.
     - If query is about Bitcoin/crypto, trends should represent crypto behavior only.
     - If query is about stocks/401k/index funds, trends should represent equity market behavior only.
     - Do NOT use crypto swings to imply stock/401k growth rates.
   - For financial assets (Bitcoin/crypto, stocks/ETF/index funds, 401k/retirement), the growthRate MUST be realistic year-by-year market performance.
   - Include negative years where applicable (e.g. crypto crashes, bear markets) and do not smooth volatility.
   - Use annual close-to-close style returns for each calendar year.
   - Narratives should reference the major real-world driver for that year.
   - Keep growthRate within realistic annual bounds for the chosen asset class.

Context of original timeline (User is currently upper-middle class):
- 2010: Junior Analyst job ($45k)
- 2013: Bought a car ($25k)
- 2015: Started 401k ($5k/yr)
- 2018: MBA Degree ($60k cost)
- 2021: House downpayment ($100k)
- 2023: Senior role ($130k)

5. **Relative Date Resolution (MANDATORY):**
   - Assume current year is ${CURRENT_YEAR}.
   - Convert relative phrases to exact years in 'divergenceYear' and events:
     - "3 years ago" => ${CURRENT_YEAR - 3}
     - "a year ago", "one year ago", "last year" => ${CURRENT_YEAR - 1}
     - "this year" => ${CURRENT_YEAR}
   - Always output explicit integer years. Never output relative phrases in year fields.

6. **Intent Fidelity (MANDATORY):**
   - Infer event type from the text itself:
     - Use type = "investment" for purchases that create/retain asset value (bitcoin/crypto, stocks/ETF/index fund, 401k contributions, home purchase, car purchase).
     - Use type = "expense" for rent and recurring/consumption costs (apartment rent, HOA fees, lease payments, maintenance fees, utilities, insurance, subscriptions, taxes).
     - Use type = "income" for salary/payroll/bonus/credits.
   - For rent/HOA/lease/fees, NEVER classify as investment.
   - For financial asset buys, NEVER classify as expense.

Return JSON matching the schema.
For 'marketTrends', provide an entry for EVERY year from the divergenceYear to ${CURRENT_YEAR}.
For 'newEvents', include BOTH the change AND the continuing life events.
`;

export const generateScenario = async (prompt: string): Promise<SimulationScenario> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          divergenceYear: { type: Type.INTEGER },
          newEvents: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                year: { type: Type.INTEGER },
                label: { type: Type.STRING },
                amount: { type: Type.NUMBER },
                type: { type: Type.STRING },
                description: { type: Type.STRING }
              },
              required: ["year", "label", "amount", "type", "description"]
            }
          },
          marketTrends: {
            type: Type.ARRAY,
            description: "Year-by-year growth rates based on historical accuracy for the chosen asset class.",
            items: {
              type: Type.OBJECT,
              properties: {
                year: { type: Type.INTEGER },
                growthRate: { type: Type.NUMBER, description: "e.g. 0.15 for 15%, -0.05 for -5%" },
                narrative: { type: Type.STRING, description: "Short reason e.g. 'Crypto Crash' or 'Tech Boom'" }
              },
              required: ["year", "growthRate", "narrative"]
            }
          },
          branchName: { type: Type.STRING },
          explanation: { type: Type.STRING }
        },
        required: ["divergenceYear", "newEvents", "marketTrends", "branchName", "explanation"]
      }
    }
  });

  try {
    const data = JSON.parse(response.text || '{}');
    if (!data || typeof data !== 'object') {
      throw new Error('Model returned an empty or invalid scenario payload.');
    }

    const divergenceYear = Number((data as any).divergenceYear);
    const branchName = typeof (data as any).branchName === 'string' ? (data as any).branchName : 'Alternate Timeline';
    const explanation = typeof (data as any).explanation === 'string' ? (data as any).explanation : 'Scenario generated.';
    const newEvents = Array.isArray((data as any).newEvents) ? (data as any).newEvents : [];
    const marketTrends = Array.isArray((data as any).marketTrends) ? (data as any).marketTrends : [];

    if (!Number.isFinite(divergenceYear)) {
      throw new Error('Model did not return a valid divergence year.');
    }
    if (newEvents.length === 0) {
      throw new Error('Model returned no new events for this request. Try rephrasing with explicit action, amount, and year.');
    }

    return {
      divergenceYear,
      newEvents,
      marketTrends,
      branchName,
      explanation
    } as SimulationScenario;
  } catch (e) {
    console.error("Failed to parse scenario", e);
    throw new Error(e instanceof Error ? e.message : "Timeline distortion detected. Could not stabilize scenario.");
  }
};
