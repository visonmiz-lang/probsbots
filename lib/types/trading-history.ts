export interface TradingStats {
  total_trades: number;
  win_rate: number;
  avg_profit_percent: number;
  avg_loss_percent: number;
  high_leverage_trades: number;
  avg_tp_percent: number;
  avg_sl_percent: number;
}

export interface AntiPattern {
  setup_pattern: string;
  trade_count: number;
  avg_pnl: number;
  losses: number;
}

export interface RecentTrade {
  symbol: string;
  operation: string;
  leverage: number;
  sl_percent: number;
  tp_percent: number;
  positionOutcome: string;
  pnl_percent: number;
  aiReasoningAtOpen: string;
  // 🔥 ДОБАВЛЯЕМ РЫНОЧНЫЕ ДАННЫЕ
  rsi_at_open: string;
  macd_at_open: string;
  ema20_at_open: string;
  atr_at_open: string;
  entry_price: string;
}

export interface TradingHistory {
  stats: TradingStats | null;
  antiPatterns: AntiPattern[];
  recentTrades: RecentTrade[];
  isEmpty: boolean;
}