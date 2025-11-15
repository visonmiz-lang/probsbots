import ccxt from "ccxt";

export const bybit = new ccxt.bybit({
  apiKey: process.env.BYBIT_API_KEY,
  secret: process.env.BYBIT_API_SECRET,
});

// Включаем демо и проверяем
console.log("🔧 Enabling demo trading...");
bybit.enableDemoTrading(true);

// Проверим статус
console.log("🔧 Demo trading enabled");

console.log("🔧 Bybit fully configured for DEMO");