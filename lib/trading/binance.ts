import ccxt from "ccxt";
import { bybit } from "./bybit";

// Для обратной совместимости - используем Bybit
export const binance = bybit;
console.log("🔧 Trading provider switched to Bybit DEMO");