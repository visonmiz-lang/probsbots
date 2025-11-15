import { TradingHistory, TradingStats, AntiPattern, RecentTrade } from '../types/trading-history';
import { prisma } from '../prisma';
import { Symbol, Opeartion } from '@prisma/client';

export class TradingHistoryService {
  async getTradingHistory(symbol: string = 'BTC'): Promise<TradingHistory> {
    try {
      // Запрос 1: Общая статистика (последние 30 дней)
      const statsResult = await prisma.$queryRaw<TradingStats[]>`
        SELECT 
          COUNT(*) as total_trades,
          ROUND((AVG(CASE WHEN "positionOutcome" = 'win' THEN 1.0 ELSE 0.0 END) * 100.0)::numeric, 1) as win_rate,
          ROUND(AVG(CASE WHEN "positionOutcome" = 'win' THEN "finalPnl" ELSE NULL END)::numeric, 3) as avg_profit_percent,
          ROUND(AVG(CASE WHEN "positionOutcome" = 'loss' THEN "finalPnl" ELSE NULL END)::numeric, 3) as avg_loss_percent,
          COUNT(CASE WHEN leverage > 5 THEN 1 END) as high_leverage_trades,
          ROUND((AVG(CASE WHEN "positionOutcome" = 'win' THEN ("takeProfit"/"pricing" - 1) * 100 ELSE NULL END))::numeric, 2) as avg_tp_percent,
          ROUND((AVG(CASE WHEN "positionOutcome" = 'loss' THEN ("stopLoss"/"pricing" - 1) * 100 ELSE NULL END))::numeric, 2) as avg_sl_percent
        FROM "Trading" 
        WHERE "opeartion" IN ('Buy', 'Sell') 
          AND "positionOutcome" IN ('win', 'loss')
          AND "symbol" = ${symbol}::"Symbol"
          AND "createdAt" >= NOW() - INTERVAL '30 days'
      `;

      // Запрос 2: Анти-паттерны
      const antiPatternsResult = await prisma.$queryRaw<AntiPattern[]>`
        SELECT 
          CONCAT(
            'Leverage: ', leverage::text, 'x, ',
            'SL: ', ROUND((("stopLoss"/"pricing" - 1) * 100)::numeric, 1)::text, '%, ',
            'TP: ', ROUND((("takeProfit"/"pricing" - 1) * 100)::numeric, 1)::text, '%'
          ) as setup_pattern,
          COUNT(*) as trade_count,
          ROUND(AVG("finalPnl")::numeric, 3) as avg_pnl,
          SUM(CASE WHEN "positionOutcome" = 'loss' THEN 1 ELSE 0 END) as losses
        FROM "Trading" 
        WHERE "opeartion" IN ('Buy', 'Sell') 
          AND "positionOutcome" IN ('win', 'loss')
          AND "finalPnl" < 0
          AND "symbol" = ${symbol}::"Symbol"
        GROUP BY leverage, ROUND((("stopLoss"/"pricing" - 1) * 100)::numeric, 1), ROUND((("takeProfit"/"pricing" - 1) * 100)::numeric, 1)
        ORDER BY avg_pnl ASC 
        LIMIT 3
      `;

      // Запрос 3: Последние сделки с рыночными данными
      const recentTradesResult = await prisma.$queryRaw<RecentTrade[]>`
        SELECT 
          symbol,
          "opeartion" as operation,
          leverage,
          ROUND((("stopLoss"/"pricing" - 1) * 100)::numeric, 2) as sl_percent,
          ROUND((("takeProfit"/"pricing" - 1) * 100)::numeric, 2) as tp_percent,
          "positionOutcome",
          ROUND("finalPnl"::numeric, 3) as pnl_percent,
          "aiReasoningAtOpen",
          -- 🔥 ДОБАВЛЯЕМ РЫНОЧНЫЕ ДАННЫЕ НА МОМЕНТ ОТКРЫТИЯ
          "technicalIndicatorsAtOpen"->>'rsi' as rsi_at_open,
          "technicalIndicatorsAtOpen"->>'macd' as macd_at_open,
          "technicalIndicatorsAtOpen"->>'ema20' as ema20_at_open,
          "technicalIndicatorsAtOpen"->>'atr_14' as atr_at_open,
          "marketConditionsAtOpen"->>'price' as entry_price
        FROM "Trading" 
        WHERE "opeartion" IN ('Buy', 'Sell') 
          AND "positionOutcome" IN ('win', 'loss')
          AND "symbol" = ${symbol}::"Symbol"
        ORDER BY "closedAt" DESC NULLS LAST, "createdAt" DESC
        LIMIT 5
      `;

      const isEmpty = !statsResult[0]?.total_trades && recentTradesResult.length === 0;

      return {
        stats: statsResult[0] || null,
        antiPatterns: antiPatternsResult,
        recentTrades: recentTradesResult,
        isEmpty
      };
      
    } catch (error) {
      console.error('Error fetching trading history:', error);
      return {
        stats: null,
        antiPatterns: [],
        recentTrades: [],
        isEmpty: true
      };
    }
  }
}