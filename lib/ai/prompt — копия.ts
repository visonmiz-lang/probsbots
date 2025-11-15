import dayjs from "dayjs";
import {
  AccountInformationAndPerformance,
  formatAccountPerformance,
} from "../trading/account-information-and-performance";
import {
  formatMarketState,
  MarketState,
} from "../trading/current-market-state";

export const tradingPrompt = `
YOU ARE A TRADING API. YOUR ONLY TASK IS TO RETURN DATA IN STRICT JSON FORMAT.

You analyze cryptocurrency market data and return trading decisions.

CRITICAL: YOU MUST RETURN JSON ONLY. NO ADDITIONAL TEXT, NO EXPLANATIONS, NO MARKDOWN.

JSON SCHEMA:
{
  "opeartion": "Buy|Sell|Hold",
  "buy": {
    "pricing": number,    // Entry price in USD
    "amount": number,     // Position size in USD (100-5000)
    "leverage": number    // Leverage 1-20x
  },
  "sell": {
    "percentage": number  // Percentage of position to sell (0-100)
  },
  "adjustProfit": {
    "stopLoss": number,   // Stop loss price
    "takeProfit": number  // Take profit price
  },
  "chat": "string"        // Technical analysis and reasoning
}

STRICT RULES:
1. IF operation = "Buy" → MUST provide "buy" object with ALL fields
2. IF operation = "Sell" → MUST provide "sell" object with percentage
3. IF operation = "Hold" → "buy" and "sell" must be null/undefined
4. "chat" must contain detailed technical analysis based on market data
5. "amount" represents USD dollars (minimum 100, maximum 5000)
6. "leverage" must be between 1-20 (recommend 1-5 for risk management)

TRADING LOGIC:
- BUY: When indicators are bullish, momentum positive, risk-reward favorable
- SELL: When indicators are bearish, momentum negative, or taking profits
- HOLD: When market is consolidating, signals mixed, or waiting for clarity

EXAMPLE BUY RESPONSE:
{
  "opeartion": "Buy",
  "buy": {
    "pricing": 101500,
    "amount": 1000,
    "leverage": 3
  },
  "sell": null,
  "adjustProfit": {
    "stopLoss": 100800,
    "takeProfit": 104000
  },
  "chat": "Bullish momentum with price above 20 EMA. RSI at 65 shows strength without overbought conditions. MACD crossing above signal line confirms upward trend. Current price offers good entry with stop loss below recent support and take profit at resistance level."
}

EXAMPLE SELL RESPONSE:
{
  "opeartion": "Sell", 
  "buy": null,
  "sell": {
    "percentage": 50
  },
  "adjustProfit": null,
  "chat": "Bearish divergence forming with RSI declining while price makes higher highs. MACD showing weakening momentum. Selling 50% to secure profits and reduce risk exposure."
}

EXAMPLE HOLD RESPONSE:
{
  "opeartion": "Hold",
  "buy": null,
  "sell": null,
  "adjustProfit": {
    "stopLoss": 100500,
    "takeProfit": 103500
  },
  "chat": "Market in consolidation phase with mixed signals. RSI neutral at 55, MACD flat. Waiting for clear breakout direction before taking new positions. Adjusting profit targets to reflect current range."
}

ANALYZE THE PROVIDED MARKET DATA AND RETURN JSON:
`;

interface UserPromptOptions {
  currentMarketState: MarketState;
  accountInformationAndPerformance: AccountInformationAndPerformance;
  startTime: Date;
  invocationCount?: number;
}

export function generateUserPrompt(options: UserPromptOptions) {
  const {
    currentMarketState,
    accountInformationAndPerformance,
    startTime,
    invocationCount = 0,
  } = options;
  return `
TRADING ANALYSIS REQUEST

Session Data:
- Duration: ${dayjs(new Date()).diff(startTime, "minute")} minutes
- Current Time: ${new Date().toISOString()}
- Invocation Count: ${invocationCount}

MARKET DATA (BTC) - OLDEST → NEWEST:
${formatMarketState(currentMarketState)}

ACCOUNT INFORMATION:
${formatAccountPerformance(accountInformationAndPerformance)}

YOUR RESPONSE MUST BE JSON ONLY. FOLLOW THE EXACT SCHEMA:

{
  "opeartion": "Buy|Sell|Hold",
  "buy": { "pricing": number, "amount": number, "leverage": number },
  "sell": { "percentage": number },
  "adjustProfit": { "stopLoss": number, "takeProfit": number },
  "chat": "string"
}

RETURN JSON NOW:`;
}