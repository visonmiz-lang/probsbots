import { run } from "@/lib/ai/run";
import { NextRequest } from "next/server";
import { getExistingPositions } from "@/lib/trading/position-checker";
import { updateClosedPositions } from "@/lib/trading/position-tracker"; // 🔥 ИМПОРТ

export const POST = async (request: NextRequest) => {
  // Extract token from Authorization header
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  console.log("🔐 [3-minutes] Received token:", token);
  console.log("🔐 [3-minutes] Expected token:", process.env.CRON_SECRET_KEY);

  if (!token) {
    console.log("❌ [3-minutes] No token provided");
    return new Response("Token is required", { status: 400 });
  }

  // Простая проверка строки вместо JWT
  if (token !== process.env.CRON_SECRET_KEY) {
    console.log("❌ [3-minutes] Token mismatch");
    return new Response("Invalid token", { status: 401 });
  }

  console.log("✅ [3-minutes] Token verification successful");

  // 🔥 1. СНАЧАЛА ОБНОВЛЯЕМ ЗАКРЫТЫЕ ПОЗИЦИИ
  console.log("🔍 [3-minutes] Updating closed positions...");
  await updateClosedPositions();

  // 🔥 2. ПОТОМ ПРОВЕРЯЕМ ОТКРЫТЫЕ ПОЗИЦИИ
  console.log("🔍 [3-minutes] Checking for existing positions...");
  const existingPositions = await getExistingPositions();
  
  if (existingPositions.length > 0) {
    console.log(`⏭️ [3-minutes] Skipping AI execution - ${existingPositions.length} open positions:`);
    existingPositions.forEach(p => {
      console.log(`   - ${p.symbol}: ${p.contracts} contracts (${p.side}) - PnL: $${p.unrealizedPnl.toFixed(2)}`);
    });
    
    return new Response("Skipped - positions already open", { status: 200 });
  }

  console.log("✅ [3-minutes] No open positions - starting AI trading execution...");

  await run(Number(process.env.START_MONEY));

  console.log("✅ [3-minutes] AI trading execution completed");

  return new Response("Process executed successfully");
};