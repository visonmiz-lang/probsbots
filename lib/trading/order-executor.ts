import { bybit } from "./bybit";

export interface OrderParams {
  symbol: string;
  operation: 'buy' | 'sell';
  position: {
    pricing: number;
    amount: number;
    leverage: number;
    stopLoss: number;
    takeProfit: number;
  };
}

// 🔥 ПРОСТАЯ ФУНКЦИЯ ДЛЯ ОКРУГЛЕНИЯ
function roundPrice(price: number): number {
  return Math.round(price * 100) / 100; // Округляем до 2 знаков
}

export async function executeOrderWithSLTP(params: OrderParams): Promise<{ id: string } | null> {
  try {
    const { symbol, operation, position } = params;
    const normalizedSymbol = `${symbol}/USDT:USDT`;

    console.log(`🎯 Executing ${operation.toUpperCase()} order for ${symbol}`, {
      amount: position.amount,
      pricing: position.pricing,
      stopLoss: position.stopLoss,
      takeProfit: position.takeProfit
    });

    // Расчет контрактов
    const contractAmount = position.amount / position.pricing;
    console.log(`💰 Contracts: ${contractAmount}`);

    // Установка плеча
    try {
      await bybit.setLeverage(position.leverage, normalizedSymbol);
    } catch (error) {
      console.log(`⚠️ Leverage already set`);
    }

    // Основной ордер
    const order = await bybit.createOrder(
      normalizedSymbol,
      'market',
      operation,
      contractAmount,
      undefined,
      { leverage: position.leverage }
    );

    console.log(`✅ ${operation.toUpperCase()} order executed:`, order.id);

    // Установка SL/TP
    await setSLTP(normalizedSymbol, position.stopLoss, position.takeProfit);

    return { id: order.id };

  } catch (error) {
    console.error(`❌ Error:`, error);
    throw error;
  }
}

// 🔥 ИСПРАВЛЕННАЯ ФУНКЦИЯ ДЛЯ SL/TP - ПРАВИЛЬНЫЙ ФОРМАТ
async function setSLTP(symbol: string, stopLoss: number, takeProfit: number): Promise<void> {
  try {
    await new Promise(resolve => setTimeout(resolve, 2000)); // Увеличили задержку

    // Получаем позицию
    const positions = await bybit.fetchPositions([symbol]);
    const position = positions.find(p => p.contracts && Math.abs(p.contracts) > 0);
    
    if (!position) {
      console.log('⚠️ No position found');
      return;
    }

    const isLong = position.side === 'long';
    const contracts = Math.abs(position.contracts);
    
    console.log(`📊 Setting SL/TP for ${position.side} position, contracts: ${contracts}, entry price: ${position.entryPrice}`);

    // 🔥 STOP LOSS - ПРАВИЛЬНЫЙ ФОРМАТ ПО ДОКУМЕНТАЦИИ
    if (stopLoss) {
      try {
        const roundedSL = roundPrice(stopLoss);
        
        // 🔥 ПРАВИЛЬНЫЕ ПАРАМЕТРЫ - stopLossPrice вместо вложенного объекта
        const slParams = {
          stopLossPrice: roundedSL, // Прямой параметр
          reduceOnly: true
        };

        console.log(`🔧 Setting stop loss at ${roundedSL} for ${contracts} contracts`);

        const slOrder = await bybit.createOrder(
          symbol,
          'market',
          isLong ? 'sell' : 'buy',
          contracts, // 🔥 ВСЕ контракты
          undefined,
          slParams
        );
        console.log(`✅ Stop loss set at ${roundedSL} for ${contracts} contracts`, slOrder.id);
      } catch (error: any) {
        console.error(`❌ Stop loss failed:`, error.message);
      }
    }

    // 🔥 TAKE PROFIT - ПРАВИЛЬНЫЙ ФОРМАТ ПО ДОКУМЕНТАЦИИ
    if (takeProfit) {
      try {
        const roundedTP = roundPrice(takeProfit);
        
        // 🔥 ПРАВИЛЬНЫЕ ПАРАМЕТРЫ - takeProfitPrice вместо вложенного объекта
        const tpParams = {
          takeProfitPrice: roundedTP, // Прямой параметр
          reduceOnly: true
        };

        console.log(`🔧 Setting take profit at ${roundedTP} for ${contracts} contracts`);

        const tpOrder = await bybit.createOrder(
          symbol,
          'market',
          isLong ? 'sell' : 'buy',
          contracts, // 🔥 ВСЕ контракты
          undefined,
          tpParams
        );
        console.log(`✅ Take profit set at ${roundedTP} for ${contracts} contracts`, tpOrder.id);
      } catch (error: any) {
        console.error(`❌ Take profit failed:`, error.message);
      }
    }

  } catch (error) {
    console.error(`⚠️ SL/TP error:`, error);
  }
}

// 🔥 АЛЬТЕРНАТИВНЫЙ МЕТОД - БОЛЕЕ НАДЕЖНЫЙ
async function setSLTPReliable(symbol: string, stopLoss: number, takeProfit: number): Promise<void> {
  try {
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Получаем позицию
    const positions = await bybit.fetchPositions([symbol]);
    const position = positions.find(p => p.contracts && Math.abs(p.contracts) > 0);
    
    if (!position) {
      console.log('⚠️ No position found');
      return;
    }

    const isLong = position.side === 'long';
    const contracts = Math.abs(position.contracts);
    
    console.log(`📊 Setting reliable SL/TP for ${contracts} contracts`);

    // 🔥 STOP LOSS - Условный ордер
    if (stopLoss) {
      try {
        const roundedSL = roundPrice(stopLoss);
        const slSide = isLong ? 'sell' : 'buy';
        
        const slOrder = await bybit.createOrder(
          symbol,
          'stop', // 🔥 Используем тип 'stop'
          slSide,
          contracts,
          undefined,
          {
            stopPrice: roundedSL,
            reduceOnly: true,
            timeInForce: 'GTC'
          }
        );
        console.log(`✅ Reliable stop loss set at ${roundedSL}`, slOrder.id);
      } catch (error: any) {
        console.error(`❌ Reliable stop loss failed:`, error.message);
      }
    }

    // 🔥 TAKE PROFIT - Лимитный ордер
    if (takeProfit) {
      try {
        const roundedTP = roundPrice(takeProfit);
        const tpSide = isLong ? 'sell' : 'buy';
        
        const tpOrder = await bybit.createOrder(
          symbol,
          'limit', // 🔥 Используем лимитный ордер для TP
          tpSide,
          contracts,
          roundedTP,
          {
            reduceOnly: true,
            timeInForce: 'GTC'
          }
        );
        console.log(`✅ Reliable take profit set at ${roundedTP}`, tpOrder.id);
      } catch (error: any) {
        console.error(`❌ Reliable take profit failed:`, error.message);
      }
    }

  } catch (error) {
    console.error(`⚠️ Reliable SL/TP error:`, error);
  }
}

// 🔥 УПРОЩЕННЫЕ ФУНКЦИИ ДЛЯ ОТДЕЛЬНОЙ УСТАНОВКИ
export async function setStopLossOnly(symbol: string, stopLoss: number): Promise<boolean> {
  try {
    const normalizedSymbol = `${symbol}/USDT:USDT`;
    const positions = await bybit.fetchPositions([normalizedSymbol]);
    const position = positions.find(p => p.contracts && Math.abs(p.contracts) > 0);
    
    if (!position) return false;

    const isLong = position.side === 'long';
    const contracts = Math.abs(position.contracts);
    const roundedSL = roundPrice(stopLoss);

    // 🔥 ПРАВИЛЬНЫЙ ФОРМАТ
    const params = {
      stopLossPrice: roundedSL,
      reduceOnly: true
    };

    const order = await bybit.createOrder(
      normalizedSymbol,
      'market',
      isLong ? 'sell' : 'buy',
      contracts,
      undefined,
      params
    );
    
    console.log(`✅ Stop loss set at ${roundedSL} for ${contracts} contracts`, order.id);
    return true;
  } catch (error: any) {
    console.error(`❌ Stop loss failed:`, error.message);
    return false;
  }
}

export async function setTakeProfitOnly(symbol: string, takeProfit: number): Promise<boolean> {
  try {
    const normalizedSymbol = `${symbol}/USDT:USDT`;
    const positions = await bybit.fetchPositions([normalizedSymbol]);
    const position = positions.find(p => p.contracts && Math.abs(p.contracts) > 0);
    
    if (!position) return false;

    const isLong = position.side === 'long';
    const contracts = Math.abs(position.contracts);
    const roundedTP = roundPrice(takeProfit);

    // 🔥 ПРАВИЛЬНЫЙ ФОРМАТ
    const params = {
      takeProfitPrice: roundedTP,
      reduceOnly: true
    };

    const order = await bybit.createOrder(
      normalizedSymbol,
      'market',
      isLong ? 'sell' : 'buy',
      contracts,
      undefined,
      params
    );
    
    console.log(`✅ Take profit set at ${roundedTP} for ${contracts} contracts`, order.id);
    return true;
  } catch (error: any) {
    console.error(`❌ Take profit failed:`, error.message);
    
    // Запасной вариант
    try {
      const order = await bybit.createOrder(
        normalizedSymbol,
        'limit',
        isLong ? 'sell' : 'buy',
        contracts,
        roundPrice(takeProfit),
        { reduceOnly: true, timeInForce: 'GTC' }
      );
      console.log(`✅ Take profit set via limit at ${takeProfit}`, order.id);
      return true;
    } catch (limitError) {
      return false;
    }
  }
}