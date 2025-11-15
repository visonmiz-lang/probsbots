import { bybit } from "./bybit";

export interface PositionInfo {
  symbol: string;
  contracts: number;
  side: 'long' | 'short';
  unrealizedPnl: number;
  entryPrice: number;
  markPrice: number;
}

export async function getExistingPositions(): Promise<PositionInfo[]> {
  try {
    const positions = await bybit.fetchPositions();
    
    return positions
      .filter(p => p.contracts && p.contracts > 0)
      .map(p => ({
        symbol: p.symbol.replace('/USDT:USDT', '').replace('USDT', ''),
        contracts: p.contracts,
        side: p.side,
        unrealizedPnl: p.unrealizedPnl || 0,
        entryPrice: p.entryPrice || 0,
        markPrice: p.markPrice || 0
      }));
  } catch (error) {
    console.error('Error fetching positions:', error);
    return [];
  }
}

export function hasOpenPosition(positions: PositionInfo[], symbol: string): boolean {
  return positions.some(p => p.symbol === symbol);
}

export function getPositionForSymbol(positions: PositionInfo[], symbol: string): PositionInfo | null {
  return positions.find(p => p.symbol === symbol) || null;
}