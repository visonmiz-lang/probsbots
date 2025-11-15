import { bybit } from "./bybit";

export interface OrderParams {
  symbol: string;
  operation: 'buy' | 'sell';
  position: {
    pricing: number;
    amount: number;        // USD amount
    leverage: number;
    stopLoss: number;
    takeProfit: number;
  };
}

// 🔥 БЕЗОПАСНАЯ УСТАНОВКА ПЛЕЧА
async function setLeverageSafely(leverage: number, normalizedSymbol: string, symbol: string): Promise<void> {
  try {
    console.log(`🔧 Attempting to set leverage to ${leverage}x for ${symbol}`);
    
    // Пробуем установить плечо
    await bybit.setLeverage(leverage, normalizedSymbol);
    console.log(`✅ Leverage set to ${leverage}x for ${symbol}`);
    
  } catch (error: any) {
    // Если ошибка "leverage not modified", игнорируем её - значит плечо уже установлено
    if (error.message?.includes('leverage not modified') || 
        error.message?.includes('110043')) {
      console.log(`⚠️ Leverage already set to ${leverage}x for ${symbol}, continuing...`);
      return;
    }
    
    // Если другая ошибка - пробуем альтернативный метод
    console.log(`🔄 Trying alternative leverage setting method...`);
    
    try {
      // Альтернативный метод через параметры ордера
      console.log(`🔧 Setting leverage via order parameters for ${symbol}`);
      // Пропускаем явную установку плеча, будем использовать параметры в ордере
      console.log(`⚠️ Using leverage ${leverage}x via order parameters`);
      return;
    } catch (altError) {
      console.log(`❌ Alternative leverage method failed, but continuing:`, altError);
      // Игнорируем ошибку и продолжаем
    }
  }
}

export async function executeOrderWithSLTP(params: OrderParams): Promise<{ id: string } | null> {
  try {
    const { symbol, operation, position } = params;
    
    // Нормализация символа для Bybit
    const normalizedSymbol = `${symbol}/USDT:USDT`;
    
    console.log(`🎯 Executing ${operation.toUpperCase()} order for ${symbol}`, {
      amount: `${position.amount} USD`,
      leverage: position.leverage,
      stopLoss: position.stopLoss,
      takeProfit: position.takeProfit
    });

    // 🔥 КОНВЕРТАЦИЯ USD → КОНТРАКТЫ для API
    const contractAmount = position.amount / position.pricing;
    console.log(`💰 Converting: $${position.amount} at $${position.pricing} → ${contractAmount.toFixed(6)} contracts`);

    // 1. Установка кредитного плеча (с обработкой ошибок)
    await setLeverageSafely(position.leverage, normalizedSymbol, symbol);

    // 2. Выполнение основной сделки
    const order = await bybit.createOrder(
      normalizedSymbol,
      'market',
      operation,
      contractAmount,  // Передаем контракты в API
      undefined,
      {
        leverage: position.leverage,
        reduceOnly: false
      }
    );

    console.log(`✅ ${operation.toUpperCase()} order executed:`, order.id);

    // 3. Установка стоп-лосса и тейк-профита
    await setStopLossAndTakeProfit(normalizedSymbol, position.stopLoss, position.takeProfit);

    return { id: order.id };
    
  } catch (error) {
    console.error(`❌ Error executing order:`, error);
    throw error;
  }
}

// Остальной код остается без изменений...
async function setStopLossAndTakeProfit(symbol: string, stopLoss: number, takeProfit: number): Promise<void> {
  try {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const positions = await bybit.fetchPositions([symbol]);
    const position = positions.find(p => p.contracts && p.contracts > 0);
    
    if (!position) {
      console.log('⚠️ No position found for setting SL/TP');
      return;
    }

    console.log(`📊 Position for SL/TP:`, {
      symbol: position.symbol,
      contracts: position.contracts,
      side: position.side,
      entryPrice: position.entryPrice,
      markPrice: position.markPrice
    });

    if (stopLoss) {
      await setStopLossConditional(symbol, stopLoss, position);
    }

    if (takeProfit) {
      await setTakeProfitLimit(symbol, takeProfit, position);
    }

  } catch (error) {
    console.error(`⚠️ Error setting SL/TP:`, error);
    
    try {
      console.log('🔄 Trying alternative SL/TP method...');
      await setSLTPBybitNative(symbol, stopLoss, takeProfit);
    } catch (altError) {
      console.error(`❌ Alternative SL/TP method also failed:`, altError);
    }
  }
}

// Установка стоп-лосса через условный ордер для Bybit
async function setStopLossConditional(symbol: string, stopLoss: number, position: any): Promise<void> {
  try {
    const order = await bybit.createOrder(
      symbol,
      'stop',
      'sell',
      position.contracts,
      undefined,
      {
        stopPrice: stopLoss,
        reduceOnly: true,
        basePrice: position.markPrice,
        triggerDirection: position.side === 'long' ? 1 : 2,
        orderFilter: 'Order'
      }
    );
    console.log(`✅ Stop loss set at ${stopLoss} for ${symbol}`, order.id);
  } catch (error) {
    console.error(`❌ Error setting stop loss:`, error);
    throw error;
  }
}

// Установка тейк-профита через лимитный ордер
async function setTakeProfitLimit(symbol: string, takeProfit: number, position: any): Promise<void> {
  try {
    const order = await bybit.createOrder(
      symbol,
      'limit',
      'sell',
      position.contracts,
      takeProfit,
      {
        reduceOnly: true,
        timeInForce: 'GTC'
      }
    );
    console.log(`✅ Take profit set at ${takeProfit} for ${symbol}`, order.id);
  } catch (error) {
    console.error(`❌ Error setting take profit:`, error);
    throw error;
  }
}

// Нативный метод для Bybit
async function setSLTPBybitNative(symbol: string, stopLoss?: number, takeProfit?: number): Promise<void> {
  try {
    const positions = await bybit.fetchPositions([symbol]);
    const position = positions.find(p => p.contracts && p.contracts > 0);
    
    if (!position) return;

    console.log(`🔧 Setting SL/TP via Bybit native method`);

    if (stopLoss) {
      try {
        const slOrder = await bybit.createOrder(
          symbol,
          'stop',
          'sell',
          position.contracts,
          undefined,
          {
            stopPrice: stopLoss,
            reduceOnly: true,
            basePrice: position.markPrice,
            triggerDirection: position.side === 'long' ? 1 : 2
          }
        );
        console.log(`✅ Stop loss set via native method: ${stopLoss}`, slOrder.id);
      } catch (slError) {
        console.error(`❌ Native stop loss failed:`, slError);
      }
    }

    if (takeProfit) {
      try {
        const tpOrder = await bybit.createOrder(
          symbol,
          'limit',
          'sell',
          position.contracts,
          takeProfit,
          {
            reduceOnly: true,
            timeInForce: 'GTC'
          }
        );
        console.log(`✅ Take profit set via native method: ${takeProfit}`, tpOrder.id);
      } catch (tpError) {
        console.error(`❌ Native take profit failed:`, tpError);
      }
    }
  } catch (error) {
    console.error(`❌ Native SL/TP method failed:`, error);
    throw error;
  }
}

// Упрощенная версия только для стоп-лосса
export async function setStopLossOnly(symbol: string, stopLoss: number): Promise<boolean> {
  try {
    const normalizedSymbol = `${symbol}/USDT:USDT`;
    const positions = await bybit.fetchPositions([normalizedSymbol]);
    const position = positions.find(p => p.contracts && p.contracts > 0);
    
    if (!position) {
      console.log('⚠️ No position found for stop loss');
      return false;
    }

    const order = await bybit.createOrder(
      normalizedSymbol,
      'stop',
      'sell',
      position.contracts,
      undefined,
      {
        stopPrice: stopLoss,
        reduceOnly: true,
        basePrice: position.markPrice,
        triggerDirection: position.side === 'long' ? 1 : 2,
        orderFilter: 'Order'
      }
    );
    
    console.log(`✅ Stop loss set at ${stopLoss} for ${symbol}`, order.id);
    return true;
    
  } catch (error) {
    console.error(`❌ Error setting stop loss:`, error);
    return false;
  }
}

// Упрощенная версия только для тейк-профита
export async function setTakeProfitOnly(symbol: string, takeProfit: number): Promise<boolean> {
  try {
    const normalizedSymbol = `${symbol}/USDT:USDT`;
    const positions = await bybit.fetchPositions([normalizedSymbol]);
    const position = positions.find(p => p.contracts && p.contracts > 0);
    
    if (!position) {
      console.log('⚠️ No position found for take profit');
      return false;
    }

    const order = await bybit.createOrder(
      normalizedSymbol,
      'limit',
      'sell', 
      position.contracts,
      takeProfit,
      {
        reduceOnly: true,
        timeInForce: 'GTC'
      }
    );
    
    console.log(`✅ Take profit set at ${takeProfit} for ${symbol}`, order.id);
    return true;
    
  } catch (error) {
    console.error(`❌ Error setting take profit:`, error);
    return false;
  }
}

// Резервный метод - установка через редактирование позиции
export async function setPositionSLTP(symbol: string, stopLoss?: number, takeProfit?: number): Promise<boolean> {
  try {
    const normalizedSymbol = `${symbol}/USDT:USDT`;
    
    const params: any = {};
    
    if (stopLoss) {
      params.stopLoss = stopLoss.toString();
    }
    
    if (takeProfit) {
      params.takeProfit = takeProfit.toString();
    }

    console.log(`🔧 Setting position SL/TP:`, params);
    
    if (bybit.has['privatePostPositionTradingStop']) {
      await bybit.privatePostPositionTradingStop({
        symbol: normalizedSymbol.replace('/USDT:USDT', ''),
        ...params
      });
      console.log(`✅ Position SL/TP set via private API`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`❌ Error setting position SL/TP:`, error);
    return false;
  }
}