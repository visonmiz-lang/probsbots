import { generateObject } from "ai";
import { generateMultiSymbolPrompt, tradingPrompt } from "./prompt";
import { getCurrentMarketState } from "../trading/current-market-state";
import { z } from "zod";
import { workingModel } from "./model";
import { getAccountInformationAndPerformance } from "../trading/account-information-and-performance";
import { prisma } from "../prisma";
import { Opeartion, Symbol } from "@prisma/client";
import { getExistingPositions } from "../trading/position-checker";
import { executeOrderWithSLTP, setStopLossOnly, setTakeProfitOnly } from "../trading/order-executor";
import fs from 'fs/promises';
import path from 'path';

// Обновленная схема для AI ответа
const tradingSchema = z.object({
  operation: z.nativeEnum(Opeartion),
  symbol: z.enum(["BTC", "ETH", "SOL", "BNB", "DOGE"]),
  position: z.object({
    pricing: z.number(),
    amount: z.number(),
    leverage: z.number().min(1).max(20),
    stopLoss: z.number().optional(),
    takeProfit: z.number().optional(),
  }).optional(),
  chat: z.string(),
});

// Функция для записи ответа AI в файл
async function saveAIResponseToFile(aiResponse: any, prompt: string) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `ai-response-${timestamp}.json`;
    const filePath = path.join(process.cwd(), 'ai-responses', filename);
    
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    
    const dataToSave = {
      timestamp: new Date().toISOString(),
      aiResponse,
      prompt: prompt.substring(0, 500) + '...'
    };
    
    await fs.writeFile(filePath, JSON.stringify(dataToSave, null, 2));
    console.log(`📝 AI response saved to: ${filename}`);
    
    await appendToAILog(aiResponse);
    
  } catch (error) {
    console.error('❌ Error saving AI response to file:', error);
  }
}

async function appendToAILog(aiResponse: any) {
  try {
    const logFilePath = path.join(process.cwd(), 'ai-responses', 'ai-responses-log.jsonl');
    const logEntry = {
      timestamp: new Date().toISOString(),
      operation: aiResponse.operation,
      symbol: aiResponse.symbol,
      position: aiResponse.position,
      chat: aiResponse.chat?.substring(0, 200) + '...'
    };
    
    await fs.appendFile(logFilePath, JSON.stringify(logEntry) + '\n');
    
  } catch (error) {
    console.error('❌ Error appending to AI log:', error);
  }
}

// Функция валидации ответа AI
function validateAIResponse(object: any): void {
  console.log("🔍 Validating AI response structure...");
  
  if (!object.operation) throw new Error("Missing required field: operation");
  if (!object.symbol) throw new Error("Missing required field: symbol");
  if (!object.chat || object.chat === "<no chat>") throw new Error("Missing required field: chat");

  if (object.operation === "Buy" || object.operation === "Sell") {
    if (!object.position) throw new Error("Missing required field: position");
    if (!object.position.pricing) throw new Error("Missing required field: position.pricing");
    if (!object.position.amount) throw new Error("Missing required field: position.amount");
    if (!object.position.leverage) throw new Error("Missing required field: position.leverage");
    
    // 🔥 ТЕПЕРЬ ПРОВЕРЯЕМ SL/TP ОТ AI
    if (!object.position.stopLoss) throw new Error("Missing required field: position.stopLoss");
    if (!object.position.takeProfit) throw new Error("Missing required field: position.takeProfit");
  }
  
  if (object.operation === "Hold" && object.position) {
    throw new Error("Hold operation should not have position object");
  }
  
  console.log("✅ AI response validation passed");
}

async function executeTradingDecision(decision: z.infer<typeof tradingSchema>, marketStates: any[]) {
  const { operation, symbol, position } = decision;
  
  // Проверяем существующие позиции
  const existingPositions = await getExistingPositions();
  
  if ((operation === Opeartion.Buy || operation === Opeartion.Sell) && position) {
    // ПРОВЕРКА: Не открываем позицию если уже есть
    const hasPosition = existingPositions.some(p => p.symbol === symbol);
    if (hasPosition) {
      console.log(`⏭️ Skipping ${operation} for ${symbol} - position already exists`);
      return null;
    }

    // 🔥 ИСПОЛЬЗУЕМ ТОЧНЫЕ ЗНАЧЕНИЯ ОТ AI БЕЗ ПЕРЕСЧЕТА
    console.log(`💰 ${operation} ${symbol}: $${position.amount} at $${position.pricing}`);
    console.log(`🎯 AI SL/TP (EXACT VALUES): SL=$${position.stopLoss}, TP=$${position.takeProfit}`);

    const tradeResult = await executeOrderWithSLTP({
      symbol,
      operation: operation === Opeartion.Buy ? 'buy' : 'sell',
      position: position // 🔥 ПЕРЕДАЕМ ПОЗИЦИЮ КАК ЕСТЬ ОТ AI
    });

    // Если основной ордер выполнен, но SL/TP не установились, пробуем установить отдельно
    if (tradeResult) {
      console.log('🔄 Checking SL/TP status...');
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      let slSuccess = false;
      let tpSuccess = false;
      
      // 🔥 ИСПОЛЬЗУЕМ ТОЧНЫЕ ЗНАЧЕНИЯ ОТ AI
      if (position.stopLoss) {
        slSuccess = await setStopLossOnly(symbol, position.stopLoss);
        if (!slSuccess) {
          console.log('⚠️ Failed to set stop loss, will retry in next iteration');
        }
      }
      
      if (position.takeProfit) {
        tpSuccess = await setTakeProfitOnly(symbol, position.takeProfit);
        if (!tpSuccess) {
          console.log('⚠️ Failed to set take profit, will retry in next iteration');
        }
      }
      
      if ((position.stopLoss && !slSuccess) || (position.takeProfit && !tpSuccess)) {
        console.log('⚠️ Some SL/TP orders failed, but main order executed successfully');
      } else if (slSuccess && tpSuccess) {
        console.log('✅ All SL/TP orders set successfully with AI values');
      }
    }

    return tradeResult;
  }

  if (operation === Opeartion.Hold) {
    console.log(`🟡 HOLD - no trading action for ${symbol}`);
  }

  return null;
}

export async function run(initialCapital: number) {
  console.log("🤖 STARTING AI TRADING EXECUTION");
  console.log("💰 Initial capital:", initialCapital);
  
  try {
    // Получаем данные для ВСЕХ монет
    const symbols = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "DOGE/USDT"];
    const symbolNames = ["BTC", "ETH", "SOL", "BNB", "DOGE"];
    
    console.log("📊 Fetching market data for all symbols...");
    const marketStates = await Promise.all(
      symbols.map(symbol => getCurrentMarketState(symbol))
    );

    const accountInformationAndPerformance = await getAccountInformationAndPerformance(initialCapital);
    const invocationCount = await prisma.chat.count();
    const existingPositions = await getExistingPositions();

    console.log("📊 Market states loaded for all symbols");
    console.log("📈 Existing positions:", existingPositions.length > 0 ? existingPositions : "No positions");

    // Создаем мульти-символьный промпт
    const multiSymbolPrompt = generateMultiSymbolPrompt({
      marketStates,
      symbols: symbolNames,
      accountInformationAndPerformance,
      existingPositions,
      startTime: new Date(),
      invocationCount,
    });

    console.log("🧠 Sending request to AI with multi-symbol data...");

    await new Promise(resolve => setTimeout(resolve, 2000));

    // 🔥 ИСПРАВЛЕНИЕ: УБИРАЕМ reasoning ИЗ ДЕСТРУКТУРИЗАЦИИ
    const { object } = await generateObject({
      model: workingModel,
      system: tradingPrompt,
      prompt: multiSymbolPrompt,
      output: "object",
      mode: "json",
      schema: tradingSchema,
    });

    // 🔥 СОЗДАЕМ reasoning ИЗ chat (ТАК КАК AI НЕ ВОЗВРАЩАЕТ reasoning)
    const reasoning = object.chat || "No reasoning provided";

    // 🔴 СОЗДАЕМ ПОЛНЫЙ ОТВЕТ AI ДЛЯ ЗАПИСИ
    const fullAIResponse = {
      operation: object.operation,
      symbol: object.symbol,
      position: object.position,
      chat: object.chat,
      reasoning: reasoning, // 🔥 ТЕПЕРЬ reasoning = chat
      rawObject: object
    };

    console.log("🎯 AI RECOMMENDATION:", {
      operation: object.operation,
      symbol: object.symbol,
      position: object.position
    });
    console.log("💭 AI Reasoning:", reasoning); // 🔥 ТЕПЕРЬ БУДЕТ ВЫВОДИТЬСЯ
    console.log("💬 AI Chat:", object.chat);
    console.log("📋 FULL AI RESPONSE:", JSON.stringify(fullAIResponse, null, 2));

    // 🔴 ВАЛИДАЦИЯ ОТВЕТА AI
    validateAIResponse(object);

    // 🔴 ЗАПИСЫВАЕМ ОТВЕТ AI В ФАЙЛ
    await saveAIResponseToFile(fullAIResponse, multiSymbolPrompt);

    // 🔥 FALLBACK: Если AI рекомендует Buy/Sell но не дает SL/TP
    if ((object.operation === Opeartion.Buy || object.operation === Opeartion.Sell) && object.position) {
      if (!object.position.stopLoss || !object.position.takeProfit) {
        console.log(`⚠️ AI recommended ${object.operation} but provided incomplete SL/TP`);
        
        // Используем текущую цену для расчета если AI не дал SL/TP
        const symbolIndex = symbolNames.indexOf(object.symbol);
        const currentPrice = marketStates[symbolIndex]?.current_price || object.position.pricing;
        
        // Простой расчет как запасной вариант
        if (!object.position.stopLoss) {
          object.position.stopLoss = object.operation === 'Buy' 
            ? currentPrice * 0.95 
            : currentPrice * 1.05;
          console.log(`🟡 Calculated fallback stop loss: ${object.position.stopLoss}`);
        }
        
        if (!object.position.takeProfit) {
          object.position.takeProfit = object.operation === 'Buy'
            ? currentPrice * 1.06
            : currentPrice * 0.94;
          console.log(`🟡 Calculated fallback take profit: ${object.position.takeProfit}`);
        }
      }
    }

    console.log(`🎯 Executing trade operation: ${object.operation} for ${object.symbol}`);
    
    // 🔥 ВЫЧИСЛЯЕМ symbolIndex ПЕРЕД СОХРАНЕНИЕМ
    const symbolIndex = symbolNames.indexOf(object.symbol);
    
    // 🔥 ПЕРЕДАЕМ ОБЪЕКТ КАК ЕСТЬ ОТ AI
    const tradeResult = await executeTradingDecision(object, marketStates);
    
    console.log(`✅ Trade result:`, tradeResult);

    // Сохраняем в базу данных ТОЧНЫЕ значения от AI
    await prisma.chat.create({
      data: {
        reasoning: reasoning || "<no reasoning>",
        chat: object.chat || "<no chat>",
        userPrompt: multiSymbolPrompt,
        tradings: {
          create: {
            symbol: object.symbol as Symbol,
            opeartion: object.operation,
            pricing: object.position?.pricing,
            amount: object.position?.amount,
            leverage: object.position?.leverage,
            stopLoss: object.position?.stopLoss,
            takeProfit: object.position?.takeProfit,
            bybitOrderId: tradeResult?.id,

            // 🔥 НОВЫЕ ПОЛЯ ДЛЯ ОБУЧЕНИЯ AI
            technicalIndicatorsAtOpen: {
              rsi: marketStates[symbolIndex]?.current_rsi,
              macd: marketStates[symbolIndex]?.current_macd,
              ema20: marketStates[symbolIndex]?.current_ema20,
              volume: marketStates[symbolIndex]?.volume_24h,
              funding_rate: marketStates[symbolIndex]?.funding_rate,
              open_interest: marketStates[symbolIndex]?.open_interest?.latest
            },
            marketConditionsAtOpen: {
              price: object.position?.pricing,
              trend: marketStates[symbolIndex]?.current_rsi > 60 ? 'bullish' : marketStates[symbolIndex]?.current_rsi < 40 ? 'bearish' : 'neutral',
              volatility: 'medium'
            },
            aiReasoningAtOpen: reasoning, // 🔥 ТЕПЕРЬ ЗАПОЛНИТСЯ!
            positionOutcome: 'open'
          },
        },
      },
    });

    console.log(`✅ Trading execution completed for ${object.symbol}`);
    console.log("💾 Data saved to database with EXACT AI values");

  } catch (error) {
    console.error("❌ CRITICAL ERROR in trading execution:", error);
    
    // 🔥 УПРОЩЕННАЯ ЗАПИСЬ ОШИБКИ
    await prisma.chat.create({
      data: {
        reasoning: "Execution failed - " + (error instanceof Error ? error.message : 'Unknown error'),
        chat: "Trading execution failed",
        userPrompt: "Error occurred during trading execution",
        tradings: {
          create: {
            symbol: Symbol.BTC,
            opeartion: Opeartion.Hold,
            positionOutcome: 'open'
          },
        },
      },
    });
    
    try {
      const errorResponse = {
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      };
      await saveAIResponseToFile(errorResponse, "ERROR");
    } catch (fileError) {
      console.error('❌ Error saving error to file:', fileError);
    }
    
    throw error;
  }
}