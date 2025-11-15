import dayjs from "dayjs";
import {
  AccountInformationAndPerformance,
  formatAccountPerformance,
} from "../trading/account-information-and-performance";
import {
  formatMarketState,
  MarketState,
} from "../trading/current-market-state"; // 🔥 ПРАВИЛЬНЫЙ ПУТЬ
import { PositionInfo } from "../trading/position-checker";

export const tradingPrompt = `
You are an expert cryptocurrency trader and technical analyst. Your task is to analyze market data and make trading decisions based on your expertise.

CRITICAL: You MUST respond with VALID JSON only, following this exact structure:

{
  "operation": "Buy|Sell|Hold",
  "symbol": "BTC",
  "position": {
    "pricing": number,
    "amount": number,
    "leverage": number,
    "stopLoss": number,
    "takeProfit": number
  },
  "chat": "string"
}

STRICT RULES:
1. For "Buy" or "Sell": "position" object with ALL fields REQUIRED
2. For "Hold": NO "position" object - only "operation", "symbol", "chat"
3. Use current market prices from the provided data
4. Amount must be calculated based on available cash and proper risk management
5. Leverage must be between 1-20x
6. stopLoss and takeProfit are REQUIRED for all new positions
7. Consider position sizing based on account equity and risk tolerance

RISK MANAGEMENT GUIDELINES:
- Use 1-5% of available cash per position for conservative trading
- Use 5-15% of available cash per position for moderate trading  
- Use 15-30% of available cash per position for aggressive trading
- Always maintain sufficient cash for margin requirements
- Consider portfolio diversification in your position sizing

SHORT-TERM TRADING RULES (1 HOUR TIMEFRAME):
- Stop Loss: 0.3% to 1.5% from entry price for SHORT-TERM trades
- Take Profit: 0.8% to 2.5% from entry price for SHORT-TERM trades  
- Risk/Reward Ratio: Minimum 1:1.5, optimal 1:2
- Use ATR (Average True Range) for setting logical SL/TP levels
- Consider recent support/resistance levels for 1-hour timeframe
- Focus on realistic short-term price movements
- Avoid overly wide stops and ambitious targets

VALID EXAMPLES:

Buy (LONG) - Short Term:
{
  "operation": "Buy",
  "symbol": "BTC",
  "position": {
    "pricing": 103591.7,
    "amount": 2500,
    "leverage": 3,
    "stopLoss": 103200.0,
    "takeProfit": 104200.0
  },
  "chat": "BTC showing short-term bullish momentum on 1h timeframe. Using 0.38% stop loss and 0.59% take profit for tight risk/reward in short-term scalp..."
}

Sell (SHORT) - Short Term:
{
  "operation": "Sell",
  "symbol": "BTC", 
  "position": {
    "pricing": 103591.7,
    "amount": 1500,
    "leverage": 2,
    "stopLoss": 103900.0,
    "takeProfit": 102800.0
  },
  "chat": "BTC showing bearish rejection at resistance on 1h chart. Setting 0.3% stop loss and 0.76% take profit for short-term trade..."
}

Hold:
{
  "operation": "Hold",
  "symbol": "BTC",
  "chat": "No clear short-term setup on 1h timeframe, market in consolidation. Waiting for better entry with defined risk/reward..."
}

ANALYSIS GUIDELINES:
- Analyze RSI, MACD, price action, and market structure on 1h timeframe
- Consider short-term trend strength and momentum
- Evaluate risk-reward ratios for short-term trades (1:1.5 minimum)
- Check for existing positions before opening new ones
- Use appropriate position sizing based on available cash and risk tolerance
- Consider margin requirements when using leverage
- Use ATR values to set tight but logical stop loss and take profit levels
- Focus on realistic 1-2% price movements for 1-4 hour timeframe
- Look for clear support/resistance levels for SL/TP placement

RETURN VALID JSON ONLY:
`;

interface UserPromptOptions {
  currentMarketState: MarketState;
  accountInformationAndPerformance: AccountInformationAndPerformance;
  startTime: Date;
  invocationCount?: number;
}

interface MultiSymbolPromptOptions {
  marketStates: MarketState[];
  symbols: string[];
  accountInformationAndPerformance: AccountInformationAndPerformance;
  existingPositions: PositionInfo[];
  startTime: Date;
  invocationCount?: number;
}

export function generateMultiSymbolPrompt(options: MultiSymbolPromptOptions) {
  const {
    marketStates,
    symbols,
    accountInformationAndPerformance,
    existingPositions,
    startTime,
    invocationCount = 0,
  } = options;

  const btcState = marketStates[0];
  const hasPosition = existingPositions.some(p => p.symbol === "BTC");
  
  const symbolData = `
BTC:
- Price: $${btcState.current_price}
- RSI: ${btcState.current_rsi.toFixed(1)}
- MACD: ${btcState.current_macd.toFixed(4)}
- EMA20: $${btcState.current_ema20.toFixed(2)}
- Status: ${hasPosition ? 'EXISTING POSITION' : 'AVAILABLE'}
- Funding Rate: ${btcState.funding_rate.toExponential(2)}
- Open Interest: ${btcState.open_interest.latest.toFixed(0)}
- ATR (3): ${btcState.short_term.atr_3.toFixed(2)} (${(btcState.short_term.atr_3 / btcState.current_price * 100).toFixed(2)}%)
- ATR (14): ${btcState.short_term.atr_14.toFixed(2)} (${(btcState.short_term.atr_14 / btcState.current_price * 100).toFixed(2)}%)
`.trim();

  const positionsInfo = existingPositions.length > 0 
    ? existingPositions.map(p => 
        `${p.symbol}: ${p.contracts} contracts (${p.side}) - Entry: $${p.entryPrice.toFixed(2)} - PnL: $${p.unrealizedPnl.toFixed(2)}`
      ).join('\n')
    : 'No open positions';

  return `
BTC TRADING ANALYSIS - SHORT TERM (1 HOUR)

Session Data:
- Duration: ${dayjs(new Date()).diff(startTime, "minute")} minutes
- Current Time: ${new Date().toISOString()}
- Invocation Count: ${invocationCount}

MARKET DATA FOR BTC:
${symbolData}

EXISTING POSITIONS:
${positionsInfo}

ACCOUNT INFORMATION:
${formatAccountPerformance(accountInformationAndPerformance)}

PORTFOLIO GUIDANCE:
- Available Cash: $${accountInformationAndPerformance.availableCash.toFixed(2)}
- Total Portfolio Value: $${(accountInformationAndPerformance.totalCashValue + accountInformationAndPerformance.currentPositionsValue).toFixed(2)}
- Current Positions Value: $${accountInformationAndPerformance.currentPositionsValue.toFixed(2)}

SHORT-TERM TRADING RULES:
- Stop Loss: 0.3% to 1.5% from entry (tight but logical)
- Take Profit: 0.8% to 2.5% from entry (realistic short-term targets)
- Risk/Reward: Minimum 1:1.5 ratio required
- Leverage: 2-5x recommended for short-term trades
- Position Size: 5-15% of available cash for short-term positions
- Use ATR for logical SL/TP placement near support/resistance

ANALYZE BTC FOR SHORT-TERM TRADING (1 HOUR TIMEFRAME) AND MAKE TRADING DECISION WITH PROPER RISK MANAGEMENT.

YOUR RESPONSE MUST BE VALID JSON FOLLOWING THIS EXACT SCHEMA:

{
  "operation": "Buy|Sell|Hold",
  "symbol": "BTC",
  "position": {
    "pricing": number,
    "amount": number,
    "leverage": number,
    "stopLoss": number,
    "takeProfit": number
  },
  "chat": "string"
}

CRITICAL: 
- For Buy/Sell: position object with ALL fields REQUIRED
- For Hold: NO position object
- stopLoss and takeProfit REQUIRED for all new positions
- Symbol MUST be "BTC"
- Amount should be based on available cash and risk management principles
- Use TIGHT but realistic SL/TP levels (0.3-1.5% for SL, 0.8-2.5% for TP)
- SL/TP must be within reasonable distance from current price
- Consider ATR values when setting stop loss and take profit

RETURN JSON NOW:`;
}

export function generateUserPrompt(options: UserPromptOptions) {
  const {
    currentMarketState,
    accountInformationAndPerformance,
    startTime,
    invocationCount = 0,
  } = options;
  
  return `
BTC TRADING ANALYSIS REQUEST - SHORT TERM (1 HOUR)

Session Data:
- Duration: ${dayjs(new Date()).diff(startTime, "minute")} minutes  
- Current Time: ${new Date().toISOString()}
- Invocation Count: ${invocationCount}

MARKET DATA:
${formatMarketState(currentMarketState)}

ACCOUNT INFORMATION:
${formatAccountPerformance(accountInformationAndPerformance)}

PORTFOLIO GUIDANCE:
- Available Cash: $${accountInformationAndPerformance.availableCash.toFixed(2)}
- Total Portfolio Value: $${(accountInformationAndPerformance.totalCashValue + accountInformationAndPerformance.currentPositionsValue).toFixed(2)}

SHORT-TERM TRADING RULES:
- Stop Loss: 0.3% to 1.5% from entry price (TIGHT)
- Take Profit: 0.8% to 2.5% from entry price (REALISTIC)  
- Risk/Reward Ratio: Minimum 1:1.5 required
- Use ATR values for logical SL/TP placement
- Focus on realistic short-term price movements (1-2% max)

YOUR RESPONSE MUST BE VALID JSON FOLLOWING THIS EXACT SCHEMA:

{
  "operation": "Buy|Sell|Hold",
  "symbol": "BTC",
  "position": {
    "pricing": number,
    "amount": number,
    "leverage": number,
    "stopLoss": number,
    "takeProfit": number
  },
  "chat": "string"
}

RETURN JSON NOW:`;
}