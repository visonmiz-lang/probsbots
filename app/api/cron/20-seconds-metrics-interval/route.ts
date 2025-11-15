import { NextRequest } from "next/server";
import { getAccountInformationAndPerformance } from "@/lib/trading/account-information-and-performance";
import { prisma } from "@/lib/prisma";
import { ModelType } from "@prisma/client";
import { InputJsonValue, JsonValue } from "@prisma/client/runtime/library";

const MAX_METRICS_COUNT = 100;

function uniformSampleWithBoundaries<T>(data: T[], maxSize: number): T[] {
  if (data.length <= maxSize) {
    return data;
  }

  const result: T[] = [];
  const step = (data.length - 1) / (maxSize - 1);

  for (let i = 0; i < maxSize; i++) {
    const index = Math.round(i * step);
    result.push(data[index]);
  }

  return result;
}

export const POST = async (request: NextRequest) => {
  // Extract token from Authorization header
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  console.log("🔐 [DEBUG] Received token:", token);
  console.log("🔐 [DEBUG] Expected token from env:", process.env.CRON_SECRET_KEY);

  if (!token) {
    console.log("❌ [DEBUG] No token provided");
    return new Response("Token is required", { status: 400 });
  }

  // Простая проверка строки вместо JWT
  if (token !== process.env.CRON_SECRET_KEY) {
    console.log("❌ [DEBUG] Token mismatch");
    return new Response("Invalid token", { status: 401 });
  }

  console.log("✅ [DEBUG] Token verification successful");
  console.log("📊 [DEBUG] Starting metrics collection...");

  try {
    const accountInformationAndPerformance =
      await getAccountInformationAndPerformance(Number(process.env.START_MONEY));

    console.log("📊 [DEBUG] Account info retrieved");

    let existMetrics = await prisma.metrics.findFirst({
      where: {
        model: ModelType.Deepseek,
      },
    });

    console.log("📊 [DEBUG] Existing metrics found:", !!existMetrics);

    if (!existMetrics) {
      console.log("📊 [DEBUG] Creating new metrics record...");
      existMetrics = await prisma.metrics.create({
        data: {
          name: "20-seconds-metrics",
          metrics: [],
          model: ModelType.Deepseek,
        },
      });
    }

    // add new metrics
    const newMetrics = [
      ...((existMetrics?.metrics || []) as JsonValue[]),
      {
        accountInformationAndPerformance,
        createdAt: new Date().toISOString(),
      },
    ] as JsonValue[];

    console.log("📊 [DEBUG] New metrics count:", newMetrics.length);

    // if the metrics count exceeds the maximum limit, uniformly sample the metrics
    let finalMetrics = newMetrics;
    if (newMetrics.length > MAX_METRICS_COUNT) {
      console.log("📊 [DEBUG] Sampling metrics...");
      finalMetrics = uniformSampleWithBoundaries(newMetrics, MAX_METRICS_COUNT);
    }

    await prisma.metrics.update({
      where: {
        id: existMetrics?.id,
      },
      data: {
        metrics: finalMetrics as InputJsonValue[],
      },
    });

    console.log("✅ [DEBUG] Metrics update completed");

    return new Response(
      `Process executed successfully. Metrics count: ${finalMetrics.length}`
    );
  } catch (error) {
    console.log("❌ [DEBUG] Error in metrics collection:", error);
    return new Response("Internal server error", { status: 500 });
  }
};