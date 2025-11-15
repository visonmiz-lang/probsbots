import { Position } from "ccxt";
import { bybit } from "./bybit";

export interface AccountInformationAndPerformance {
  currentPositionsValue: number;
  contractValue: number;
  totalCashValue: number;
  availableCash: number;
  currentTotalReturn: number;
  positions: Position[];
  sharpeRatio: number;
}

export async function getAccountInformationAndPerformance(
  initialCapital: number
): Promise<AccountInformationAndPerformance> {
  try {
    console.log("📊 Fetching Bybit demo account data...");
    
    const positions = await bybit.fetchPositions();
    const balance = await bybit.fetchBalance();
    
    console.log("💰 Bybit balance structure:", JSON.stringify(balance, null, 2));
    console.log("📈 Bybit positions:", positions);

    // 🔥 ПРАВИЛЬНЫЙ РАСЧЕТ СТОИМОСТИ ПОЗИЦИЙ
    const currentPositionsValue = positions.reduce((acc, position) => {
      // Используем notional (реальная стоимость позиции) или contracts * markPrice
      const positionValue = position.notional || (position.contracts * (position.markPrice || position.entryPrice || 0));
      console.log(`📊 Position ${position.symbol}: contracts=${position.contracts}, markPrice=${position.markPrice}, notional=${position.notional}, calculatedValue=${positionValue}`);
      return acc + positionValue;
    }, 0);
    
    const contractValue = positions.reduce((acc, position) => {
      return acc + (position.contracts || 0);
    }, 0);

    // Bybit структура баланса
    let totalCashValue = initialCapital;
    let availableCash = initialCapital;

    if (balance?.USDT) {
      totalCashValue = balance.USDT.total || initialCapital;
      availableCash = balance.USDT.free || initialCapital;
    } else if (balance?.total?.USDT !== undefined) {
      totalCashValue = balance.total.USDT || initialCapital;
      availableCash = balance.free?.USDT || initialCapital;
    }

    const currentTotalReturn = (totalCashValue - initialCapital) / initialCapital;
    const totalUnrealizedPnl = positions.reduce((acc, position) => acc + (position.unrealizedPnl || 0), 0);
    const sharpeRatio = totalUnrealizedPnl !== 0 ? currentTotalReturn / (totalUnrealizedPnl / initialCapital) : 0;

    console.log("💰 Account Summary:", {
      positionsValue: currentPositionsValue,
      totalCash: totalCashValue,
      availableCash: availableCash,
      totalReturn: currentTotalReturn,
      positionsCount: positions.length
    });

    return {
      currentPositionsValue,
      contractValue,
      totalCashValue,
      availableCash,
      currentTotalReturn,
      positions,
      sharpeRatio,
    };
    
  } catch (error) {
    console.error("❌ Error fetching Bybit account data:", error);
    
    return {
      currentPositionsValue: 0,
      contractValue: 0,
      totalCashValue: initialCapital,
      availableCash: initialCapital,
      currentTotalReturn: 0,
      positions: [],
      sharpeRatio: 0,
    };
  }
}

export function formatAccountPerformance(
  accountPerformance: AccountInformationAndPerformance
) {
  const { currentTotalReturn, availableCash, totalCashValue, positions, currentPositionsValue } =
    accountPerformance;

  const output = `## BYBIT DEMO ACCOUNT INFORMATION & PERFORMANCE
Current Total Return: ${(currentTotalReturn * 100).toFixed(2)}%
Available Cash: $${availableCash.toFixed(2)}
Current Account Value: $${totalCashValue.toFixed(2)}
Positions Value: $${currentPositionsValue.toFixed(2)}
Open Positions: ${positions.length > 0 ? positions
    .map((position) =>
      `Symbol: ${position.symbol}, Side: ${position.side}, Contracts: ${position.contracts}, Entry: $${position.entryPrice}, Current: $${position.markPrice}, PnL: $${position.unrealizedPnl}`
    )
    .join("\n") : "No positions"}`;
    
  return output;
}