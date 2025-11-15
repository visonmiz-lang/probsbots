import { bybit } from "@/lib/trading/bybit";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const positions = await bybit.fetchPositions();
    
    // Фильтруем только открытые позиции и форматируем данные
    const openPositions = positions
      .filter(position => position.contracts > 0)
      .map(position => ({
        symbol: position.symbol,
        side: position.side,
        contracts: position.contracts,
        entryPrice: position.entryPrice,
        markPrice: position.markPrice,
        unrealizedPnl: position.unrealizedPnl,
        leverage: position.leverage,
        notional: position.notional
      }));

    return NextResponse.json({ positions: openPositions });
  } catch (error) {
    console.error("Error fetching positions:", error);
    return NextResponse.json(
      { error: "Failed to fetch positions" },
      { status: 500 }
    );
  }
}
