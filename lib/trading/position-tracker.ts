import { prisma } from "../prisma";
import { bybit } from "./bybit";

export async function updateClosedPositions() {
  try {
    console.log("🔍 Checking for closed positions...");
    
    // Получаем текущие позиции из Bybit
    const currentPositions = await bybit.fetchPositions();
    console.log("📊 Current positions from Bybit:", JSON.stringify(currentPositions.map(p => ({
      symbol: p.symbol,
      contracts: p.contracts,
      side: p.side,
      unrealizedPnl: p.unrealizedPnl,
      entryPrice: p.entryPrice
    })), null, 2));
    
    // Находим все открытые позиции в нашей БД
    const openPositionsInDb = await prisma.trading.findMany({
      where: { positionOutcome: 'open' }
    });

    console.log(`📊 Open positions in DB: ${openPositionsInDb.length}`);

    let updatedCount = 0;

    for (const dbPosition of openPositionsInDb) {
      const normalizedSymbol = `${dbPosition.symbol}/USDT:USDT`;
      const bybitSymbol = normalizedSymbol.replace('/USDT:USDT', 'USDT'); // Формат для Bybit API
      
      console.log(`\n🔍 Checking position: ${dbPosition.symbol} (DB ID: ${dbPosition.id})`);
      console.log(`📊 DB Position data: amount=${dbPosition.amount}, pricing=${dbPosition.pricing}`);

      // Ищем соответствующую позицию в Bybit (активную)
      const currentActivePosition = currentPositions.find(
        p => p.symbol === normalizedSymbol && p.contracts && Math.abs(p.contracts) > 0
      );

      console.log(`🔎 Current ACTIVE position in Bybit:`, currentActivePosition ? 'FOUND' : 'NOT FOUND - POSITION CLOSED');

      // Если позиции больше нет в Bybit - значит она закрылась
      if (!currentActivePosition) {
        console.log(`🔄 Position ${dbPosition.symbol} appears to be closed, updating...`);
        
        // 🔥 ИЩЕМ В ИСТОРИИ ПОЗИЦИЙ
        const closeData = await findCloseDataFromPositionsHistory(dbPosition, bybitSymbol);
        
        if (closeData) {
          console.log(`📈 Found close data:`, closeData);
          
          // 🔥 ОБНОВЛЯЕМ ПОЛЯ ДЛЯ ЗАКРЫТОЙ ПОЗИЦИИ
          await prisma.trading.update({
            where: { id: dbPosition.id },
            data: {
              positionOutcome: closeData.finalPnl > 0 ? 'win' : 'loss',
              closedAt: closeData.closedTime,
              exitPrice: closeData.exitPrice,
              finalPnl: closeData.finalPnl,
              exitReasoning: closeData.exitReason
            }
          });
          
          updatedCount++;
          console.log(`✅ Position ${dbPosition.symbol} closed: $${closeData.finalPnl.toFixed(2)} (${closeData.exitReason})`);
        } else {
          console.log(`❌ Could not find close data for ${dbPosition.symbol}`);
        }
      } else {
        console.log(`⏳ Position ${dbPosition.symbol} still open in Bybit`);
      }
    }

    if (updatedCount > 0) {
      console.log(`🎯 Updated ${updatedCount} closed positions`);
    } else {
      console.log("✅ No closed positions found");
    }

  } catch (error) {
    console.error('❌ Error updating closed positions:', error);
  }
}

// 🔥 ПОИСК В ИСТОРИИ ПОЗИЦИЙ - ИЩЕМ В ПЕРВЫХ 2 ПОЗИЦИЯХ
async function findCloseDataFromPositionsHistory(dbPosition: any, bybitSymbol: string): Promise<any> {
  try {
    console.log(`\n📚 Searching positions history for ${bybitSymbol}`);
    console.log(`🔍 DB Position: amount=${dbPosition.amount}, pricing=${dbPosition.pricing}`);
    
    // 🔥 ИСПОЛЬЗУЕМ fetchPositionsHistory ДЛЯ ПОЛУЧЕНИЯ ИСТОРИИ
    let positionsHistory = [];
    try {
      // Получаем историю позиций за последние 7 дней
      const since = Date.now() - (7 * 24 * 60 * 60 * 1000);
      
      console.log(`🔍 Fetching positions history since: ${new Date(since)}`);
      
      // 🔥 ВЫЗЫВАЕМ fetchPositionsHistory
      positionsHistory = await bybit.fetchPositionsHistory([bybitSymbol], since, 10);
      
      console.log(`📊 Found ${positionsHistory.length} historical positions`);
      
    } catch (historyError) {
      console.log('⚠️ Could not fetch positions history:', historyError.message);
      return await fetchPositionsHistoryViaAPI(dbPosition, bybitSymbol);
    }

    // 🔥 ИЩЕМ В ПЕРВЫХ 2 ПОЗИЦИЯХ (САМЫХ НОВЫХ)
    console.log(`🔍 Checking first 2 positions for exact match...`);
    
    for (let i = 0; i < Math.min(2, positionsHistory.length); i++) {
      const position = positionsHistory[i];
      
      if (!position) continue;
      
      // 🔥 ВЫВОДИМ ДЕТАЛЬНУЮ ИНФОРМАЦИЮ О ПОЗИЦИИ
      console.log(`\n🔍 Position ${i + 1}:`, {
        symbol: position.symbol,
        infoSymbol: position.info?.symbol,
        infoClosedPnl: position.info?.closedPnl,
        hasClosedPnl: position.info?.closedPnl !== undefined && position.info?.closedPnl !== null
      });
      
      // Базовые проверки
      const isSameSymbol = position.symbol?.includes(dbPosition.symbol) || 
                          position.info?.symbol?.includes(dbPosition.symbol);
      // 🔥 ИСПРАВЛЯЕМ: проверяем closedPnl в info, а не в корне
      const hasClosedPnl = position.info?.closedPnl !== undefined && position.info?.closedPnl !== null;
      
      console.log(`✅ Symbol check: ${isSameSymbol} (${position.info?.symbol} vs ${dbPosition.symbol})`);
      console.log(`✅ ClosedPnl check: ${hasClosedPnl} (${position.info?.closedPnl})`);
      
      if (!isSameSymbol || !hasClosedPnl) {
        console.log(`❌ Position ${i + 1} skipped - symbol or closedPnl mismatch`);
        continue;
      }
      
      // 🔥 ОСНОВНОЕ: ПРОВЕРКА ПО amount И pricing
      const dbAmount = dbPosition.amount;
      const dbPricing = dbPosition.pricing;
      
      // 🔥 КОНВЕРТИРУЕМ СТРОКИ В ЧИСЛА ДЛЯ СРАВНЕНИЯ
      const historyAmount = parseFloat(position.info?.qty || '0');
      const historyEntryPrice = parseFloat(position.info?.avgEntryPrice || '0');
      
      console.log(`🔍 Comparing: DB(amount=${dbAmount}, pricing=${dbPricing}) vs History(amount=${historyAmount}, entryPrice=${historyEntryPrice})`);
      
      // Проверяем точное соответствие amount и pricing
      const amountMatches = Math.abs(dbAmount - historyAmount) < 0.001;
      const pricingMatches = Math.abs(dbPricing - historyEntryPrice) < 0.01;
      
      console.log(`✅ Amount match: ${amountMatches} (${dbAmount} vs ${historyAmount}), Pricing match: ${pricingMatches} (${dbPricing} vs ${historyEntryPrice})`);
      
      if (amountMatches && pricingMatches) {
        console.log(`🎯 Found matching historical position at index ${i}`);
        
        // 🔥 ЗАПИСЫВАЕМ ДАННЫЕ ИЗ ИСТОРИИ ПОЗИЦИЙ
        const finalPnl = parseFloat(position.info?.closedPnl || '0');
        const exitPrice = parseFloat(position.info?.avgExitPrice || '0');
        const exitReason = determineExitReasonFromHistory(position);
        const closedTime = position.datetime ? new Date(position.datetime) : 
                          position.info?.updatedTime ? new Date(parseInt(position.info.updatedTime)) : 
                          new Date();
        
        return {
          finalPnl,
          exitPrice,
          exitReason,
          closedTime
        };
      } else {
        console.log(`❌ Position ${i + 1} doesn't match exactly`);
      }
    }

    console.log(`❌ No matching historical position found in first ${Math.min(2, positionsHistory.length)} positions`);
    return null;
    
  } catch (error) {
    console.error('❌ Error finding historical position:', error);
    return null;
  }
}

// 🔥 ПРЯМОЙ API ВЫЗОВ ЕСЛИ fetchPositionsHistory НЕ РАБОТАЕТ
async function fetchPositionsHistoryViaAPI(dbPosition: any, bybitSymbol: string): Promise<any> {
  try {
    console.log(`🔧 Using direct API call for positions history...`);
    
    // Прямой вызов API Bybit v5
    const response = await bybit.v5.privateGetPositionClosedPnl({
      symbol: bybitSymbol,
      category: 'linear',
      limit: 10
    });
    
    console.log(`📊 API response:`, JSON.stringify(response, null, 2));
    
    if (response.retCode === 0 && response.result && response.result.list) {
      const positionsHistory = response.result.list;
      console.log(`📊 Found ${positionsHistory.length} positions via API`);
      
      // 🔥 ИЩЕМ В ПЕРВЫХ 2 ПОЗИЦИЯХ (САМЫХ НОВЫХ)
      console.log(`🔍 Checking first 2 positions via API for exact match...`);
      
      for (let i = 0; i < Math.min(2, positionsHistory.length); i++) {
        const position = positionsHistory[i];
        
        const positionTime = parseInt(position.updatedTime || position.createdTime);
        const isSameSymbol = position.symbol === bybitSymbol;
        const isAfterOpen = positionTime >= new Date(dbPosition.createdAt).getTime();
        
        if (!isSameSymbol || !isAfterOpen) continue;
        
        // 🔥 ПРОВЕРКА ПО amount И pricing
        const dbAmount = dbPosition.amount;
        const dbPricing = dbPosition.pricing;
        
        // 🔥 КОНВЕРТИРУЕМ СТРОКИ В ЧИСЛА
        const historyQty = parseFloat(position.qty || position.closedSize);
        const historyEntryPrice = parseFloat(position.avgEntryPrice);
        
        console.log(`🔍 Position ${i + 1} via API: DB(amount=${dbAmount}, pricing=${dbPricing}) vs History(qty=${historyQty}, entryPrice=${historyEntryPrice})`);
        
        const amountMatches = Math.abs(dbAmount - historyQty) < 0.001;
        const pricingMatches = Math.abs(dbPricing - historyEntryPrice) < 0.01;
        
        console.log(`✅ Amount match: ${amountMatches}, Pricing match: ${pricingMatches}`);
        
        if (amountMatches && pricingMatches) {
          console.log(`🎯 Found matching position via API at index ${i}:`, position);
          
          const finalPnl = parseFloat(position.closedPnl) || 0;
          const exitPrice = parseFloat(position.avgExitPrice) || 0;
          const exitReason = determineExitReasonFromHistory(position);
          const closedTime = position.updatedTime ? new Date(parseInt(position.updatedTime)) : new Date();
          
          return {
            finalPnl,
            exitPrice,
            exitReason,
            closedTime
          };
        }
      }
    }
    
    return null;
    
  } catch (error) {
    console.error('❌ Error in direct API call:', error);
    return null;
  }
}

// 🔧 ОПРЕДЕЛЕНИЕ ПРИЧИНЫ ЗАКРЫТИЯ ИЗ ИСТОРИИ
function determineExitReasonFromHistory(position: any): string {
  try {
    console.log(`🔍 Analyzing position history for exit reason:`, {
      closedPnl: position.info?.closedPnl,
      execType: position.info?.execType,
      orderType: position.info?.orderType
    });

    // Анализируем данные из истории
    if (position.info?.execType === 'Trade' && parseFloat(position.info?.closedPnl) < 0) {
      console.log(`🛑 Exit reason: Stop Loss (negative PnL)`);
      return 'stop_loss';
    }
    
    if (position.info?.execType === 'Trade' && parseFloat(position.info?.closedPnl) > 0) {
      console.log(`🎯 Exit reason: Take Profit (positive PnL)`);
      return 'take_profit';
    }
    
    if (position.info?.orderType === 'Market' && position.info?.execType === 'Trade') {
      console.log(`👤 Exit reason: Manual Market Close`);
      return 'manual_close';
    }
    
    if (position.info?.orderType === 'Limit' && position.info?.execType === 'Trade') {
      console.log(`🎯 Exit reason: Limit Order Execution`);
      return 'limit_order';
    }

    console.log(`❓ Exit reason: Unknown from history`);
    return 'unknown';
    
  } catch (error) {
    console.error('❌ Error determining exit reason:', error);
    return 'unknown';
  }
}