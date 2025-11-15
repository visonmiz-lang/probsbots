import { run } from "@/lib/ai/run";
import { NextRequest } from "next/server";
import { getExistingPositions } from "@/lib/trading/position-checker";

export const POST = async (request: NextRequest) => {
  // Проверка токена
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token || token !== process.env.CRON_SECRET_KEY) {
    return new Response("Invalid token", { status: 401 });
  }

  console.log("✅ [3-minutes] Token verification successful");

  // 🔥 ПРОСТАЯ ПРОВЕРКА ПОЗИЦИЙ
  const existingPositions = await getExistingPositions();
  
  if (existingPositions.length > 0) {
    console.log(`⏭️ [3-minutes] Skipping - ${existingPositions.length} open positions`);
    return new Response("Skipped - positions already open", { status: 200 });
  }

  console.log("✅ [3-minutes] No open positions - starting AI...");

  await run(Number(process.env.START_MONEY));

  console.log("✅ [3-minutes] AI execution completed");

  return new Response("Process executed successfully");
};