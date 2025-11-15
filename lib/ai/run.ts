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
import { TradingHistoryService } from "../trading/trading-history.service";

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

// Функция для обработки BigInt
function cleanBigInt(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return obj.toString();
  if (Array.isArray(obj)) return obj.map(cleanBigInt);
  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      cleaned[key] = cleanBigInt(value);
    }
    return cleaned;
  }
  return obj;
}

// Функция для записи ответа AI в файл
async function saveAIResponseToFile(aiResponse: any, prompt: string) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `ai-response-${timestamp}.json`;
    const filePath = path.join(process.cwd(), 'ai-responses', filename);
    
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    
    const dataToSave = cleanBigInt({
      timestamp: new Date().toISOString(),
      aiResponse: aiResponse,
      prompt: prompt.substring(0, 500) + '...'
    });
    
    await fs.writeFile(filePath, JSON.stringify(dataToSave, null, 2));
    console.log(`📝 AI response saved to: ${filename}`);
    
  } catch (error) {
    console.error('❌ Error saving AI response to file:', error);
  }
}

async function appendToAILog(aiResponse: any) {
  try {
    const logFilePath = path.join(process.cwd(), 'ai-responses', 'ai-responses-log.jsonl');
    
    const logEntry = cleanBigInt({
      timestamp: new Date().toISOString(),
      operation: aiResponse.operation,
      symbol: aiResponse.symbol,
      position: aiResponse.position,
      chat: aiResponse.chat?.substring(0, 200) + '...'
    });
    
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
  
  const existingPositions = await getExistingPositions();
  
  if ((operation === Opeartion.Buy || operation === Opeartion.Sell) && position) {
    const hasPosition = existingPositions.some(p => p.symbol === symbol);
    if (hasPosition) {
      console.log(`⏭️ Skipping ${operation} for ${symbol} - position already exists`);
      return null;
    }

    console.log(`💰 ${operation} ${symbol}: $${position.amount} at $${position.pricing}`);
    console.log(`🎯 AI SL/TP (EXACT VALUES): SL=$${position.stopLoss}, TP=$${position.takeProfit}`);

    const tradeResult = await executeOrderWithSLTP({
      symbol,
      operation: operation === Opeartion.Buy ? 'buy' : 'sell',
      position: position
    });

    console.log(`✅ FULL BYBIT TRADE RESULT:`, JSON.stringify(tradeResult, null, 2));

    let positionData = null;
    if (tradeResult && tradeResult.id) {
      console.log(`🔍 Fetching position data for order ID: ${tradeResult.id}`);
      try {
        const positions = await getExistingPositions();
        positionData = positions.find((p: any) => 
          p.symbol === `${symbol}/USDT:USDT` || 
          p.symbol === symbol || 
          p.info?.symbol?.includes(symbol)
        );
        
        if (positionData) {
          console.log(`📊 Position data fetched:`, JSON.stringify(positionData, null, 2));
        } else {
          console.log(`⚠️ No position data found for symbol: ${symbol}`);
        }
      } catch (error) {
        console.error(`❌ Error fetching position data:`, error);
      }
    }

    if (tradeResult) {
      console.log('🔄 Checking SL/TP status...');
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      let slSuccess = false;
      let tpSuccess = false;
      
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

    return { tradeResult, positionData };
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

    console.log("🔄 Getting trading history from DB...");
    const historyService = new TradingHistoryService();
    const tradingHistory = await historyService.getTradingHistory('BTC');
    
    console.log(`📊 Trading history: ${tradingHistory.isEmpty ? 'EMPTY' : 'FOUND'}`);
    if (!tradingHistory.isEmpty) {
      console.log(`📈 Stats: ${tradingHistory.stats?.total_trades} trades, ${tradingHistory.stats?.win_rate}% win rate`);
      if (tradingHistory.antiPatterns.length > 0) {
        console.log(`🚫 Anti-patterns found: ${tradingHistory.antiPatterns.length}`);
      }
    }

    const multiSymbolPrompt = generateMultiSymbolPrompt({
      marketStates,
      symbols: symbolNames,
      accountInformationAndPerformance,
      existingPositions,
      startTime: new Date(),
      invocationCount,
    }, tradingHistory);

    console.log("🧠 Sending request to AI with multi-symbol data and trading history...");

    await new Promise(resolve => setTimeout(resolve, 2000));

    const { object } = await generateObject({
      model: workingModel,
      system: tradingPrompt,
      prompt: multiSymbolPrompt,
      output: "object",
      mode: "json",
      schema: tradingSchema,
    });

    const reasoning = object.chat || "No reasoning provided";

    const fullAIResponse = {
      operation: object.operation,
      symbol: object.symbol,
      position: object.position,
      chat: object.chat,
      reasoning: reasoning,
      rawObject: object,
      tradingHistoryContext: {
        isEmpty: tradingHistory.isEmpty,
        totalTrades: tradingHistory.stats?.total_trades,
        winRate: tradingHistory.stats?.win_rate
      }
    };

    console.log("🎯 AI RECOMMENDATION:", {
      operation: object.operation,
      symbol: object.symbol,
      position: object.position
    });
    console.log("💭 AI Reasoning:", reasoning);
    console.log("📊 Trading History Context:", {
      isEmpty: tradingHistory.isEmpty,
      totalTrades: tradingHistory.stats?.total_trades,
      winRate: tradingHistory.stats?.win_rate
    });

    validateAIResponse(object);

    await saveAIResponseToFile(fullAIResponse, multiSymbolPrompt);
    await appendToAILog(fullAIResponse);

    if ((object.operation === Opeartion.Buy || object.operation === Opeartion.Sell) && object.position) {
      if (!object.position.stopLoss || !object.position.takeProfit) {
        console.log(`⚠️ AI recommended ${object.operation} but provided incomplete SL/TP`);
        
        const symbolIndex = symbolNames.indexOf(object.symbol);
        const currentPrice = marketStates[symbolIndex]?.current_price || object.position.pricing;
        
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
    
    const symbolIndex = symbolNames.indexOf(object.symbol);
    
    const executionResult = await executeTradingDecision(object, marketStates);
    const tradeResult = executionResult?.tradeResult;
    const positionData = executionResult?.positionData;
    
    console.log(`✅ Trade execution completed with full Bybit response:`, tradeResult);

    await prisma.chat.create({
      data: {
        reasoning: reasoning || "<no reasoning>",
        chat: object.chat || "<no chat>",
        userPrompt: multiSymbolPrompt,
        tradings: {
          create: {
            symbol: object.symbol as Symbol,
            opeartion: object.operation,
            pricing: positionData?.entryPrice || object.position?.pricing,
            amount: positionData?.contracts || object.position?.amount,
            leverage: object.position?.leverage,
            stopLoss: object.position?.stopLoss,
            takeProfit: object.position?.takeProfit,
            bybitOrderId: tradeResult?.id,
            technicalIndicatorsAtOpen: {
              rsi: marketStates[symbolIndex]?.current_rsi,
              macd: marketStates[symbolIndex]?.current_macd,
              ema20: marketStates[symbolIndex]?.current_ema20,
              volume: marketStates[symbolIndex]?.short_term?.current_volume,
              funding_rate: marketStates[symbolIndex]?.funding_rate,
              open_interest: marketStates[symbolIndex]?.open_interest?.latest,
              atr_14: marketStates[symbolIndex]?.short_term?.atr_14
            },
            marketConditionsAtOpen: {
              price: object.position?.pricing,
              current_price: marketStates[symbolIndex]?.current_price,
              ema20: marketStates[symbolIndex]?.current_ema20
            },
            aiReasoningAtOpen: reasoning,
            positionOutcome: 'open'
          },
        },
      },
    });

    console.log(`✅ Trading execution completed for ${object.symbol}`);
    console.log("💾 Data saved to database");

  } catch (error) {
    console.error("❌ CRITICAL ERROR in trading execution:", error);
    
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