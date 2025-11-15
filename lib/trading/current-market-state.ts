import { EMA, MACD, RSI, ATR } from "technicalindicators";
import { bybit } from "./bybit";

export interface MarketState {
  // Current indicators
  current_price: number;
  current_ema20: number;
  current_macd: number;
  current_rsi: number;

  // Open Interest
  open_interest: {
    latest: number;
    average: number;
  };

  // Funding Rate
  funding_rate: number;

  // Intraday series (by minute) - для 1-часового анализа
  intraday: {
    mid_prices: number[];
    ema_20: number[];
    macd: number[];
    rsi_7: number[];
    rsi_14: number[];
  };

  // Краткосрочный контекст (1-часовой timeframe)
  short_term: {
    ema_20: number;
    ema_50: number;
    atr_3: number;
    atr_14: number;
    current_volume: number;
    average_volume: number;
    macd: number[];
    rsi_14: number[];
  };
}

/**
 * Calculate EMA (Exponential Moving Average)
 */
function calculateEMA(values: number[], period: number): number[] {
  const emaValues = EMA.calculate({ values, period });
  return emaValues;
}

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 */
function calculateMACD(
  values: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): number[] {
  const macdValues = MACD.calculate({
    values,
    fastPeriod,
    slowPeriod,
    signalPeriod,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  return macdValues.map((v) => v.MACD || 0);
}

/**
 * Calculate RSI (Relative Strength Index)
 */
function calculateRSI(values: number[], period: number): number[] {
  const rsiValues = RSI.calculate({ values, period });
  return rsiValues;
}

/**
 * Calculate ATR (Average True Range)
 */
function calculateATR(
  high: number[],
  low: number[],
  close: number[],
  period: number
): number[] {
  const atrValues = ATR.calculate({ high, low, close, period });
  return atrValues;
}

/**
 * Fetch current market state for a given coin symbol
 * @param symbol - Trading pair symbol (e.g., 'BTC/USDT')
 * @returns Market state with all technical indicators
 */
export async function getCurrentMarketState(
  symbol: string
): Promise<MarketState> {
  try {
    // Bybit формат для perpetual contracts
    const normalizedSymbol = symbol.includes("/") ? symbol : `${symbol}/USDT:USDT`;

    // Fetch 1-minute OHLCV data (last 100 candles для внутридневного анализа)
    const ohlcv1m = await bybit.fetchOHLCV(
      normalizedSymbol,
      "1m",
      undefined,
      100
    );

    // Fetch 1-hour OHLCV data (last 100 candles для краткосрочного контекста)
    const ohlcv1h = await bybit.fetchOHLCV(
      normalizedSymbol,
      "1h",
      undefined,
      100
    );

    // Extract price data from 1-minute candles
    const closes1m = ohlcv1m.map((candle) => Number(candle[4])); // Close prices

    // Extract price data from 1-hour candles
    const closes1h = ohlcv1h.map((candle) => Number(candle[4]));
    const highs1h = ohlcv1h.map((candle) => Number(candle[2]));
    const lows1h = ohlcv1h.map((candle) => Number(candle[3]));
    const volumes1h = ohlcv1h.map((candle) => Number(candle[5]));

    // Calculate intraday indicators (1-minute timeframe)
    const ema20_1m = calculateEMA(closes1m, 20);
    const macd_1m = calculateMACD(closes1m);
    const rsi7_1m = calculateRSI(closes1m, 7);
    const rsi14_1m = calculateRSI(closes1m, 14);

    // Calculate short-term indicators (1-hour timeframe)
    const ema20_1h = calculateEMA(closes1h, 20);
    const ema50_1h = calculateEMA(closes1h, 50);
    const atr3_1h = calculateATR(highs1h, lows1h, closes1h, 3);
    const atr14_1h = calculateATR(highs1h, lows1h, closes1h, 14);
    const macd_1h = calculateMACD(closes1h);
    const rsi14_1h = calculateRSI(closes1h, 14);

    // Get last 10 values for intraday series
    const last10MidPrices = closes1m.slice(-10);
    const last10EMA20 = ema20_1m.slice(-10).map((v) => Number(v) || 0);
    const last10MACD = macd_1m.slice(-10).map((v) => Number(v) || 0);
    const last10RSI7 = rsi7_1m.slice(-10).map((v) => Number(v) || 0);
    const last10RSI14 = rsi14_1m.slice(-10).map((v) => Number(v) || 0);

    // Get last 10 MACD and RSI values for 1-hour timeframe
    const last10MACD1h = macd_1h.slice(-10).map((v) => Number(v) || 0);
    const last10RSI14_1h = rsi14_1h.slice(-10).map((v) => Number(v) || 0);

    // Current values (latest)
    const current_price = Number(closes1m[closes1m.length - 1]) || 0;
    const current_ema20 = Number(ema20_1m[ema20_1m.length - 1]) || 0;
    const current_macd = Number(macd_1m[macd_1m.length - 1]) || 0;
    const current_rsi = Number(rsi7_1m[rsi7_1m.length - 1]) || 0;

    // Fetch open interest and funding rate for perpetual futures
    const openInterestData = { latest: 0, average: 0 };
    let fundingRate = 0;

    try {
      // Open interest и funding rate используют perpSymbol (BTCUSDT)
      const perpSymbol = normalizedSymbol.replace("/", "").replace(":USDT", "");
      
      // Open interest для Bybit
      const openInterest = await bybit.fetchOpenInterest(perpSymbol, 'swap');

      if (openInterest && typeof openInterest.openInterestAmount === "number") {
        openInterestData.latest = openInterest.openInterestAmount;
        openInterestData.average = openInterest.openInterestAmount;
      }

      // Funding rate использует ТОТ ЖЕ perpSymbol (BTCUSDT)
      const fundingRates = await bybit.fetchFundingRate(perpSymbol);

      if (fundingRates && typeof fundingRates.fundingRate === "number") {
        fundingRate = fundingRates.fundingRate;
      }
    } catch (error) {
      // Continue with default values
    }

    // Calculate average volume for 1-hour timeframe
    const averageVolume1h =
      volumes1h.reduce((sum, vol) => sum + vol, 0) / volumes1h.length;
    const currentVolume1h = volumes1h[volumes1h.length - 1];

    const marketState = {
      current_price,
      current_ema20,
      current_macd,
      current_rsi,
      open_interest: openInterestData,
      funding_rate: fundingRate,
      intraday: {
        mid_prices: last10MidPrices,
        ema_20: last10EMA20,
        macd: last10MACD,
        rsi_7: last10RSI7,
        rsi_14: last10RSI14,
      },
      short_term: {
        ema_20: Number(ema20_1h[ema20_1h.length - 1]) || 0,
        ema_50: Number(ema50_1h[ema50_1h.length - 1]) || 0,
        atr_3: Number(atr3_1h[atr3_1h.length - 1]) || 0,
        atr_14: Number(atr14_1h[atr14_1h.length - 1]) || 0,
        current_volume: currentVolume1h,
        average_volume: averageVolume1h,
        macd: last10MACD1h,
        rsi_14: last10RSI14_1h,
      },
    };

    return marketState;
    
  } catch (error) {
    throw error;
  }
}

/**
 * Format market state as a human-readable string
 */
export function formatMarketState(state: MarketState): string {
  return `
Current Market State (Bybit):
current_price = ${
    state.current_price
  }, current_ema20 = ${state.current_ema20.toFixed(
    3
  )}, current_macd = ${state.current_macd.toFixed(
    3
  )}, current_rsi (7 period) = ${state.current_rsi.toFixed(3)}

Open Interest: Latest: ${state.open_interest.latest.toFixed(
    2
  )} Average: ${state.open_interest.average.toFixed(2)}

Funding Rate: ${state.funding_rate.toExponential(2)}

Intraday series (by minute, oldest → latest):

Mid prices: [${state.intraday.mid_prices.map((v) => v.toFixed(1)).join(", ")}]

EMA indicators (20‑period): [${state.intraday.ema_20
    .map((v) => v.toFixed(3))
    .join(", ")}]

MACD indicators: [${state.intraday.macd.map((v) => v.toFixed(3)).join(", ")}]

RSI indicators (7‑Period): [${state.intraday.rsi_7
    .map((v) => v.toFixed(3))
    .join(", ")}]

RSI indicators (14‑Period): [${state.intraday.rsi_14
    .map((v) => v.toFixed(3))
    .join(", ")}]

Short‑term context (1‑hour timeframe):

20‑Period EMA: ${state.short_term.ema_20.toFixed(
    3
  )} vs. 50‑Period EMA: ${state.short_term.ema_50.toFixed(3)}

3‑Period ATR: ${state.short_term.atr_3.toFixed(
    3
  )} vs. 14‑Period ATR: ${state.short_term.atr_14.toFixed(3)}

Current Volume: ${state.short_term.current_volume.toFixed(
    3
  )} vs. Average Volume: ${state.short_term.average_volume.toFixed(3)}

MACD indicators: [${state.short_term.macd.map((v) => v.toFixed(3)).join(", ")}]

RSI indicators (14‑Period): [${state.short_term.rsi_14
    .map((v) => v.toFixed(3))
    .join(", ")}]
`.trim();
}