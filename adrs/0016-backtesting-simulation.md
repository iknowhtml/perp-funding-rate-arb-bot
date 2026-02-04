# ADR 0016: Backtesting & Simulation Framework

- **Status:** Accepted
- **Date:** 2026-02-04
- **Owners:** -
- **Related:**
  - [ADR-0001: Bot Architecture](0001-bot-architecture.md)
  - [ADR-0010: Exchange Adapters](0010-exchange-adapters.md)
  - [ADR-0014: Funding Rate Prediction & Strategy](0014-funding-rate-strategy.md)

## Context

Before deploying capital, we must **validate the strategy** against historical data:

- **Backtesting** proves the strategy works in past market conditions
- **Paper trading** validates execution logic without real money
- **Simulation** tests edge cases and failure modes
- **Performance metrics** (Sharpe ratio, max drawdown) quantify risk-adjusted returns

Without proper validation:
- Strategy may be unprofitable (negative expected value)
- Execution logic may have bugs (slippage, order handling)
- Risk management may be insufficient (drawdowns exceed limits)
- Edge cases may cause catastrophic failures

## Decision

**Implement a comprehensive backtesting and simulation framework** that:
1. Ingests historical funding rate and price data
2. Simulates the bot's decision-making process
3. Tracks performance metrics (PnL, Sharpe, drawdown)
4. Validates execution logic with paper trading adapter
5. Tests edge cases and failure scenarios

### Historical Data Schema

Store historical data in Postgres for backtesting:

```sql
-- Historical funding rate data
CREATE TABLE historical_funding_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange TEXT NOT NULL,
  symbol TEXT NOT NULL,
  funding_rate_bps BIGINT NOT NULL,
  predicted_rate_bps BIGINT,
  mark_price_quote BIGINT NOT NULL,
  index_price_quote BIGINT NOT NULL,
  snapshot_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Historical price data (for slippage estimation)
CREATE TABLE historical_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange TEXT NOT NULL,
  symbol TEXT NOT NULL,
  price_quote BIGINT NOT NULL,
  volume_24h BIGINT,
  snapshot_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Historical order book snapshots (for slippage backtesting)
CREATE TABLE historical_order_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange TEXT NOT NULL,
  symbol TEXT NOT NULL,
  bids JSONB NOT NULL, -- Array of {price, quantity}
  asks JSONB NOT NULL,
  snapshot_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for time-series queries
CREATE INDEX idx_historical_funding_rates_symbol_snapshot ON historical_funding_rates(exchange, symbol, snapshot_at DESC);
CREATE INDEX idx_historical_prices_symbol_snapshot ON historical_prices(exchange, symbol, snapshot_at DESC);
CREATE INDEX idx_historical_order_books_symbol_snapshot ON historical_order_books(exchange, symbol, snapshot_at DESC);
```

### Backtesting Engine Architecture

```typescript
export interface BacktestConfig {
  startDate: Date;
  endDate: Date;
  initialCapitalCents: bigint;
  strategyConfig: StrategyConfig;
  riskConfig: RiskConfig;
  slippageConfig: SlippageConfig;
}

export interface BacktestResult {
  initialCapitalCents: bigint;
  finalCapitalCents: bigint;
  totalPnLCents: bigint;
  totalReturnBps: bigint;
  sharpeRatio: number;
  maxDrawdownBps: bigint;
  winRate: number; // % of profitable positions
  totalTrades: number;
  averageHoldTimeHours: number;
  trades: BacktestTrade[];
  dailyPnL: Array<{ date: Date; pnlCents: bigint }>;
}

export interface BacktestTrade {
  entryTime: Date;
  exitTime: Date;
  entryPrice: bigint;
  exitPrice: bigint;
  sizeCents: bigint;
  pnlCents: bigint;
  returnBps: bigint;
  fundingReceivedCents: bigint;
  slippageCostCents: bigint;
  reason: string;
}
```

### Type Definitions

```typescript
// Historical data loader interface
export interface HistoricalDataLoader {
  loadFundingRates(startDate: Date, endDate: Date): Promise<FundingRateSnapshot[]>;
  loadPrices(startDate: Date, endDate: Date): Promise<PriceSnapshot[]>;
  loadOrderBook(timestamp: Date): Promise<OrderBookSnapshot | null>;
}

export interface PriceSnapshot {
  symbol: string;
  price: bigint;
  timestamp: Date;
}

export interface BacktestState {
  capitalCents: bigint;
  position: BacktestPosition | null;
  fundingHistory: FundingRateSnapshot[];
  prices: Map<string, bigint>;
}

export interface BacktestPosition {
  entryTime: Date;
  entryFundingRateBps: bigint;
  spotEntryPrice: bigint;
  perpEntryPrice: bigint;
  sizeCents: bigint;
  marginUsedCents: bigint;
}

export interface BacktestEvent {
  timestamp: Date;
  fundingRateBps: bigint;
  spotPrice: bigint;
  perpPrice: bigint;
}
```

### Helper Functions

```typescript
// Calculate margin requirement
export const calculateMargin = (sizeCents: bigint, leverageBps: bigint): bigint => {
  return (sizeCents * 10000n) / leverageBps;
};

// Calculate mid price from order book
export const calculateMidPrice = (orderBook: OrderBookSnapshot): bigint => {
  if (orderBook.bids.length === 0 || orderBook.asks.length === 0) {
    throw new Error("Order book has no bids or asks");
  }
  const bestBid = orderBook.bids[0].price;
  const bestAsk = orderBook.asks[0].price;
  return (bestBid + bestAsk) / 2n;
};

// Factory function to create historical data loader
export const createHistoricalDataLoader = (
  exchange: string,
): HistoricalDataLoader => {
  // Implementation loads data from Postgres tables
  // See database schema in this ADR for table structure
  return {
    loadFundingRates: async (startDate: Date, endDate: Date) => {
      // Query historical_funding_rates table
      // Implementation details...
      return [];
    },
    loadPrices: async (startDate: Date, endDate: Date) => {
      // Query historical_prices table
      // Implementation details...
      return [];
    },
    loadOrderBook: async (timestamp: Date) => {
      // Query historical_order_books table for closest snapshot
      // Implementation details...
      return null;
    },
  };
};
```

### Event-Driven Backtester

Use functional pattern with closure for state management:

```typescript
export interface BacktestEngine {
  run(): Promise<BacktestResult>;
}

export const createBacktestEngine = (
  config: BacktestConfig,
  dataLoader: HistoricalDataLoader,
): BacktestEngine => {
  let state: BacktestState = {
    capitalCents: config.initialCapitalCents,
    position: null,
    fundingHistory: [],
    prices: new Map(),
  };

  const trades: BacktestTrade[] = [];
  const dailyPnL: Map<string, bigint> = new Map();

  const processEvent = async (event: BacktestEvent): Promise<void> => {
    // Update state with event data
    state = {
      ...state,
      prices: new Map(state.prices).set("spot", event.spotPrice).set("perp", event.perpPrice),
      fundingHistory: [...state.fundingHistory, {
        symbol: config.strategyConfig.symbol ?? "BTC-USDT",
        currentRateBps: event.fundingRateBps,
        predictedRateBps: event.fundingRateBps,
        nextFundingTime: new Date(event.timestamp.getTime() + 8 * 60 * 60 * 1000),
        lastFundingTime: event.timestamp,
        markPrice: event.perpPrice,
        indexPrice: event.spotPrice,
        timestamp: event.timestamp,
        source: "exchange",
      }],
    };

    // Run evaluation (same logic as live bot)
    const risk = evaluateRisk(state, config.riskConfig);
    const intent = evaluateStrategy(state, risk, config.strategyConfig);

    // Execute intent (simulated)
    if (intent.type === "ENTER_HEDGE") {
      await simulateEntry(intent, event);
    } else if (intent.type === "EXIT_HEDGE" && state.position) {
      await simulateExit(intent, event);
    }
  };

  const simulateEntry = async (
    intent: TradingIntent,
    event: BacktestEvent,
  ): Promise<void> => {
    // 1. Estimate slippage (using historical order book if available)
    const orderBook = await dataLoader.loadOrderBook(event.timestamp);
    if (!orderBook) {
      return; // Skip if no order book data
    }
    const slippageEstimate = estimateSlippage(orderBook, "BUY", intent.params.sizeCents, config.slippageConfig.maxSlippageBps);

    if (!slippageEstimate.canExecute) {
      return; // Skip entry due to slippage
    }

    // 2. Calculate execution prices (with slippage)
    const spotEntryPrice = event.spotPrice + (event.spotPrice * slippageEstimate.slippageBps) / 10000n;
    const perpEntryPrice = event.perpPrice - (event.perpPrice * slippageEstimate.slippageBps) / 10000n;

    // 3. Calculate margin requirement
    const marginRequired = calculateMargin(intent.params.sizeCents, config.riskConfig.maxLeverageBps);

    // 4. Update state
    state = {
      ...state,
      position: {
        entryTime: event.timestamp,
        entryFundingRateBps: event.fundingRateBps,
        spotEntryPrice,
        perpEntryPrice,
        sizeCents: intent.params.sizeCents,
        marginUsedCents: marginRequired,
      },
      capitalCents: state.capitalCents - marginRequired,
    };
  };

  const simulateExit = async (
    intent: TradingIntent,
    event: BacktestEvent,
  ): Promise<void> => {
    if (!state.position) {
      return;
    }

    const position = state.position;

    // 1. Estimate slippage
    const orderBook = await dataLoader.loadOrderBook(event.timestamp);
    if (!orderBook) {
      return; // Skip if no order book data
    }
    const slippageEstimate = estimateSlippage(orderBook, "SELL", position.sizeCents, config.slippageConfig.maxSlippageBps);

    // 2. Calculate execution prices
    const spotExitPrice = event.spotPrice - (event.spotPrice * slippageEstimate.slippageBps) / 10000n;
    const perpExitPrice = event.perpPrice + (event.perpPrice * slippageEstimate.slippageBps) / 10000n;

    // 3. Calculate P&L
    const spotPnL = (spotExitPrice - position.spotEntryPrice) * position.sizeCents / position.spotEntryPrice;
    const perpPnL = (position.perpEntryPrice - perpExitPrice) * position.sizeCents / position.perpEntryPrice;
    const netPnL = spotPnL + perpPnL; // Should be ~0 (delta-neutral)

    // 4. Calculate funding received
    const holdTimeHours = (event.timestamp.getTime() - position.entryTime.getTime()) / (1000 * 60 * 60);
    const fundingReceivedCents = (position.sizeCents * position.entryFundingRateBps * BigInt(Math.floor(holdTimeHours))) / (10000n * 8n);

    // 5. Calculate slippage cost
    const entrySlippageCost = (position.sizeCents * slippageEstimate.slippageBps) / 10000n;
    const exitSlippageCost = (position.sizeCents * slippageEstimate.slippageBps) / 10000n;
    const totalSlippageCost = entrySlippageCost + exitSlippageCost;

    // 6. Net P&L
    const tradePnL = fundingReceivedCents - totalSlippageCost;

    // 7. Record trade
    const trade: BacktestTrade = {
      entryTime: position.entryTime,
      exitTime: event.timestamp,
      entryPrice: position.spotEntryPrice,
      exitPrice: spotExitPrice,
      sizeCents: position.sizeCents,
      pnlCents: tradePnL,
      returnBps: (tradePnL * 10000n) / position.sizeCents,
      fundingReceivedCents,
      slippageCostCents: totalSlippageCost,
      reason: intent.reason ?? "unknown",
    };

    trades.push(trade);

    // 8. Update state
    state = {
      ...state,
      capitalCents: state.capitalCents + position.marginUsedCents + tradePnL,
      position: null,
    };
  };

  const calculateResults = (): BacktestResult => {
    const totalPnL = trades.reduce((sum, t) => sum + t.pnlCents, 0n);
    const finalCapital = config.initialCapitalCents + totalPnL;
    const totalReturnBps = (totalPnL * 10000n) / config.initialCapitalCents;

    // Calculate Sharpe ratio (simplified: annualized return / volatility)
    const returns = trades.map((t) => Number(t.returnBps) / 10000);
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;

    // Calculate max drawdown
    let peak = config.initialCapitalCents;
    let maxDrawdown = 0n;
    let currentCapital = config.initialCapitalCents;

    for (const trade of trades) {
      currentCapital += trade.pnlCents;
      if (currentCapital > peak) {
        peak = currentCapital;
      }
      const drawdown = ((peak - currentCapital) * 10000n) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    // Calculate win rate
    const winningTrades = trades.filter((t) => t.pnlCents > 0n).length;
    const winRate = trades.length > 0 ? winningTrades / trades.length : 0;

    // Calculate average hold time
    const totalHoldTime = trades.reduce(
      (sum, t) => sum + (t.exitTime.getTime() - t.entryTime.getTime()),
      0,
    );
    const averageHoldTimeHours = trades.length > 0
      ? totalHoldTime / (trades.length * 1000 * 60 * 60)
      : 0;

    return {
      initialCapitalCents: config.initialCapitalCents,
      finalCapitalCents: finalCapital,
      totalPnLCents: totalPnL,
      totalReturnBps,
      sharpeRatio,
      maxDrawdownBps: maxDrawdown,
      winRate,
      totalTrades: trades.length,
      averageHoldTimeHours,
      trades,
      dailyPnL: Array.from(dailyPnL.entries()).map(([date, pnl]) => ({
        date: new Date(date),
        pnlCents: pnl,
      })),
    };
  };

  const generateEvents = (
    fundingRates: FundingRateSnapshot[],
    prices: PriceSnapshot[],
  ): BacktestEvent[] => {
    // Generate events every 2 seconds (per ADR-0001 evaluation tick)
    const events: BacktestEvent[] = [];
    const startTime = config.startDate.getTime();
    const endTime = config.endDate.getTime();
    const intervalMs = 2000; // 2 seconds

    for (let time = startTime; time <= endTime; time += intervalMs) {
      const timestamp = new Date(time);
      // Find closest funding rate and price snapshots
      const fundingRate = fundingRates.find((fr) => fr.timestamp <= timestamp) ?? fundingRates[0];
      const price = prices.find((p) => p.timestamp <= timestamp) ?? prices[0];

      if (fundingRate && price) {
        events.push({
          timestamp,
          fundingRateBps: fundingRate.currentRateBps,
          spotPrice: price.price,
          perpPrice: price.price, // Simplified: use same price for perp
        });
      }
    }

    return events;
  };

  return {
    run: async (): Promise<BacktestResult> => {
      // 1. Load historical data
      const fundingRates = await dataLoader.loadFundingRates(
        config.startDate,
        config.endDate,
      );
      const prices = await dataLoader.loadPrices(
        config.startDate,
        config.endDate,
      );

      // 2. Simulate evaluation loop (every 2 seconds, per ADR-0001)
      const events = generateEvents(fundingRates, prices);

      for (const event of events) {
        await processEvent(event);
      }

      // 3. Calculate metrics
      return calculateResults();
    },
  };
};
```

### Paper Trading Adapter

Use the same adapter interface (ADR-0010) for paper trading:

```typescript
### Paper Trading Helper Functions

```typescript
// Update balances after order fill
export const updateBalances = (
  balances: Map<string, bigint>,
  params: OrderParams,
  fillPrice: bigint,
): void => {
  const baseAsset = params.symbol.split("-")[0];
  const quoteAsset = params.symbol.split("-")[1];

  if (params.side === "BUY") {
    // Spend quote asset, receive base asset
    const quoteSpent = (params.quantity * fillPrice) / 100n; // Assuming price is in cents
    const currentQuote = balances.get(quoteAsset) ?? 0n;
    const currentBase = balances.get(baseAsset) ?? 0n;
    balances.set(quoteAsset, currentQuote - quoteSpent);
    balances.set(baseAsset, currentBase + params.quantity);
  } else {
    // Spend base asset, receive quote asset
    const quoteReceived = (params.quantity * fillPrice) / 100n;
    const currentQuote = balances.get(quoteAsset) ?? 0n;
    const currentBase = balances.get(baseAsset) ?? 0n;
    balances.set(quoteAsset, currentQuote + quoteReceived);
    balances.set(baseAsset, currentBase - params.quantity);
  }
};

// Create filled order result
export const createFilledOrder = (
  params: OrderParams,
  fillPrice: bigint,
): OrderResult => {
  return {
    orderId: `paper-${Date.now()}`,
    status: "FILLED",
    filledQuantity: params.quantity,
    averagePrice: fillPrice,
  };
};
```

### Paper Trading Adapter

Use the same adapter interface (ADR-0010) for paper trading:

```typescript
export interface PaperConfig {
  initialBalances: Array<[string, bigint]>;
  defaultPrice: bigint;
  slippageBps: number; // Base slippage in basis points
  slippageVolatilityBps: number; // Volatility around base slippage
}

export const createPaperAdapter = (config: PaperConfig): ExchangeAdapter => {
  const balances = new Map<string, bigint>(config.initialBalances);
  const positions: Position[] = [];
  let orderBook: OrderBookSnapshot | null = null;

  return {
    placeSpotOrder: async (params) => {
      // Simulate fill with slippage
      const midPrice = orderBook ? calculateMidPrice(orderBook) : config.defaultPrice;
      // Generate random slippage (convert to bigint properly)
      const randomOffset = (Math.random() - 0.5) * config.slippageVolatilityBps;
      const slippageBpsNum = config.slippageBps + randomOffset;
      const slippageBps = BigInt(Math.round(slippageBpsNum));
      const fillPrice = params.side === "BUY"
        ? midPrice + (midPrice * slippageBps) / 10000n
        : midPrice - (midPrice * slippageBps) / 10000n;

      // Update balances
      updateBalances(balances, params, fillPrice);

      return createFilledOrder(params, fillPrice);
    },

    getBalances: async () => {
      return Array.from(balances.entries()).map(([asset, amount]) => ({
        asset,
        free: amount,
        locked: 0n,
      }));
    },

    getPositions: async () => {
      return positions;
    },

    // ... other methods
  };
};
```

### Performance Metrics

```typescript
export interface PerformanceMetrics {
  // Returns
  totalReturnBps: bigint;
  annualizedReturnBps: bigint;
  
  // Risk
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdownBps: bigint;
  volatilityBps: bigint;
  
  // Trade statistics
  totalTrades: number;
  winRate: number;
  averageWinBps: bigint;
  averageLossBps: bigint;
  profitFactor: number; // Average win / Average loss
  
  // Execution quality
  averageSlippageBps: bigint;
  averageHoldTimeHours: number;
}
```

### Backtesting CLI

```typescript
// src/commands/backtest.ts

// Export results to CSV
export const exportResultsToCSV = async (
  result: BacktestResult,
  outputPath: string,
): Promise<void> => {
  // Implementation for CSV export
  // Implementation details...
};

export interface BacktestOptions {
  startDate: string;
  endDate: string;
  initialCapital: number;
  strategyConfig: string;
  riskConfig: string;
  slippageConfig: string;
  exchange: string;
  output?: string;
}

export const backtestCommand = async (options: BacktestOptions): Promise<void> => {
  const config: BacktestConfig = {
    startDate: new Date(options.startDate),
    endDate: new Date(options.endDate),
    initialCapitalCents: BigInt(options.initialCapital) * 100n,
    strategyConfig: loadStrategyConfig(options.strategyConfig),
    riskConfig: loadRiskConfig(options.riskConfig),
    slippageConfig: loadSlippageConfig(options.slippageConfig),
  };

  const dataLoader = createHistoricalDataLoader(options.exchange);
  const engine = createBacktestEngine(config, dataLoader);

  console.log("Running backtest...");
  const result = await engine.run();

  console.log("\n=== Backtest Results ===");
  console.log(`Initial Capital: $${(result.initialCapitalCents / 100n).toString()}`);
  console.log(`Final Capital: $${(result.finalCapitalCents / 100n).toString()}`);
  console.log(`Total P&L: $${(result.totalPnLCents / 100n).toString()}`);
  console.log(`Total Return: ${(result.totalReturnBps / 100n).toString()}%`);
  console.log(`Sharpe Ratio: ${result.sharpeRatio.toFixed(2)}`);
  console.log(`Max Drawdown: ${(result.maxDrawdownBps / 100n).toString()}%`);
  console.log(`Win Rate: ${(result.winRate * 100).toFixed(2)}%`);
  console.log(`Total Trades: ${result.totalTrades}`);

  // Export results to CSV
  if (options.output) {
    await exportResultsToCSV(result, options.output);
  }
};
```

## Consequences

### Positive

1. **Strategy Validation**: Proves strategy works before risking capital
2. **Parameter Optimization**: Tune strategy parameters based on historical performance
3. **Risk Assessment**: Quantifies max drawdown and volatility
4. **Bug Detection**: Catches execution logic errors before deployment

### Negative

1. **Data Requirements**: Requires historical data ingestion and storage
2. **Look-Ahead Bias**: Must ensure backtester doesn't use future data
3. **Overfitting Risk**: Optimizing parameters too much can reduce live performance
4. **Execution Simulation**: Paper trading may not perfectly simulate real exchange behavior

### Risks

| Risk | Mitigation |
|------|------------|
| Look-ahead bias | Use event-driven simulation, process events in chronological order |
| Overfitting | Use out-of-sample testing, validate on multiple time periods |
| Execution simulation inaccurate | Compare paper trading results with small live capital deployment |
| Data quality issues | Validate historical data, handle missing data gracefully |

## Future Considerations

1. **Walk-Forward Analysis**: Optimize parameters on rolling windows
2. **Monte Carlo Simulation**: Test strategy robustness with random market scenarios
3. **Multi-Exchange Backtesting**: Test cross-exchange arbitrage strategies
4. **Machine Learning**: Use ML to optimize strategy parameters

## References

- [ADR-0001: Bot Architecture](0001-bot-architecture.md) — Evaluation loop pattern
- [ADR-0010: Exchange Adapters](0010-exchange-adapters.md) — Paper trading adapter
- [ADR-0014: Funding Rate Prediction & Strategy](0014-funding-rate-strategy.md) — Strategy logic
