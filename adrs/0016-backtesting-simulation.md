# ADR 0016: Backtesting & Simulation Framework

- **Status:** Accepted
- **Date:** 2026-02-04
- **Updated:** 2026-02-09
- **Owners:** -
- **Related:**
  - [ADR-0001: Bot Architecture](0001-bot-architecture.md)
  - [ADR-0010: Exchange Adapters](0010-exchange-adapters.md)
  - [ADR-0014: Funding Rate Prediction & Strategy](0014-funding-rate-strategy.md)
  - [ADR-0015: Execution Safety & Slippage Modeling](0015-execution-safety-slippage.md)

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
  initialCapitalQuote: bigint;
  strategyConfig: StrategyConfig;
  riskConfig: RiskConfig;
  slippageConfig: SlippageConfig;
}

export interface BacktestResult {
  initialCapitalQuote: bigint;
  finalCapitalQuote: bigint;
  totalPnLQuote: bigint;
  totalReturnBps: bigint;
  sharpeRatio: number;
  maxDrawdownBps: bigint;
  winRate: number; // % of profitable positions
  totalTrades: number;
  averageHoldTimeHours: number;
  trades: BacktestTrade[];
  dailyPnL: Array<{ date: Date; pnlQuote: bigint }>;
}

export interface BacktestTrade {
  entryTime: Date;
  exitTime: Date;
  entryPrice: bigint;
  exitPrice: bigint;
  sizeQuote: bigint;
  pnlQuote: bigint;
  returnBps: bigint;
  fundingReceivedQuote: bigint;
  slippageCostQuote: bigint;
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
  capitalQuote: bigint;
  position: BacktestPosition | null;
  fundingHistory: FundingRateSnapshot[];
  prices: Map<string, bigint>;
}

export interface BacktestPosition {
  entryTime: Date;
  entryFundingRateBps: bigint;
  spotEntryPrice: bigint;
  perpEntryPrice: bigint;
  sizeQuote: bigint;
  marginUsedQuote: bigint;
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
export const calculateMargin = (sizeQuote: bigint, leverageBps: bigint): bigint => {
  return (sizeQuote * 10000n) / leverageBps;
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

### Event-Driven Backtester (using ReplayAdapter + PaperAdapter)

The backtesting engine is a thin orchestration loop. It does **not** implement its own execution simulation -- instead it delegates to the `PaperAdapter` (which handles fills, slippage, balance/position tracking) with a `ReplayAdapter` as the market data source.

This ensures the same execution code path is tested in both paper trading and backtesting.

```typescript
export interface BacktestEngine {
  run(): Promise<BacktestResult>;
}

export const createBacktestEngine = (
  config: BacktestConfig,
  dataLoader: HistoricalDataLoader,
): BacktestEngine => {
  return {
    run: async (): Promise<BacktestResult> => {
      // 1. Create ReplayAdapter from historical data
      const replayAdapter = createReplayAdapter({
        dataLoader,
        exchange: config.exchange,
        symbol: config.symbol,
        startDate: config.startDate,
        endDate: config.endDate,
      });

      // 2. Create PaperAdapter with replay as market data source
      const paperAdapter = createPaperAdapter({
        marketDataSource: replayAdapter,
        initialBalances: { USDT: config.initialCapitalQuote },
        simulation: {
          baseSlippageBps: config.slippageConfig.baseSlippageBps,
          errorRate: 0,         // No simulated errors in backtesting
          latencyMs: { min: 0, max: 0 }, // No simulated latency
        },
      });

      await paperAdapter.connect();

      // 3. Generate timeline timestamps
      const timestamps = generateTimestamps(
        config.startDate,
        config.endDate,
        config.evaluationIntervalMs ?? 2000,
      );

      // 4. Main loop: advance time, evaluate, execute via paper adapter
      for (const timestamp of timestamps) {
        // Advance replay clock
        replayAdapter.tick(timestamp);

        // Fetch market data (from replay)
        const ticker = await paperAdapter.getTicker(config.symbol);
        const fundingRate = await paperAdapter.getFundingRate(config.symbol);

        // Run strategy evaluation (same logic as live bot)
        const intent = evaluateStrategy(ticker, fundingRate, config.strategyConfig);

        // Execute via paper adapter (handles slippage, fills, positions)
        if (intent.type === "ENTER_HEDGE") {
          await paperAdapter.createOrder({
            symbol: config.symbol,
            side: "SELL",
            type: "MARKET",
            quantityBase: intent.params.quantityBase,
          });
        } else if (intent.type === "EXIT_HEDGE") {
          await paperAdapter.createOrder({
            symbol: config.symbol,
            side: "BUY",
            type: "MARKET",
            quantityBase: intent.params.quantityBase,
          });
        }

        // Process funding payments at funding intervals
        if (isFundingTime(timestamp)) {
          await paperAdapter.processFunding();
        }
      }

      // 5. Close open positions at end
      const openPositions = await paperAdapter.getPositions();
      for (const position of openPositions) {
        await paperAdapter.createOrder({
          symbol: position.symbol,
          side: position.side === "LONG" ? "SELL" : "BUY",
          type: "MARKET",
          quantityBase: position.sizeBase,
        });
      }

      // 6. Calculate metrics from paper adapter state
      const state = paperAdapter.getState();
      return calculateResults(config, state);
    },
  };
};
```

**Key design benefits:**
- **No duplicate simulation logic**: Position tracking, balance management, fill simulation, and slippage are all handled by the paper adapter -- single source of truth
- **Same code path**: The strategy evaluation and execution path is identical between live paper trading and backtesting
- **Testable**: Both the ReplayAdapter and PaperAdapter are independently unit-testable with mocks

### Paper Trading Adapter (Delegating Pattern)

The paper adapter uses a **delegating pattern** (see [ADR-0010](0010-exchange-adapters.md) Section 7): it wraps a real `ExchangeAdapter` for market data and simulates execution locally. The `marketDataSource` slot is pluggable:

| Mode | `marketDataSource` | Data source |
|------|-------------------|-------------|
| Live paper trading | `CoinbaseAdapter` | Real-time exchange API |
| Backtesting | `ReplayAdapter` | Historical data from Postgres |
| Unit testing | Mock adapter | Controlled test data |

```typescript
export const createPaperAdapter = (config: PaperAdapterConfig): PaperAdapter => {
  const state = createPaperState(config.initialBalances);
  const source = config.marketDataSource;

  return {
    // Market data: delegated to source (live or replay)
    getTicker: (symbol) => source.getTicker(symbol),
    getFundingRate: (symbol) => source.getFundingRate(symbol),
    getOrderBook: (symbol, depth) => source.getOrderBook(symbol, depth),

    // Execution: simulated locally against real/replayed prices
    createOrder: async (params) => {
      const ticker = await source.getTicker(params.symbol);
      return simulateMarketOrder(state, params, ticker, simulation);
    },

    // Balances & positions: tracked in memory
    getBalance: async (asset) => state.balances.get(asset) ?? zeroBalance(asset),
    getPositions: async () => Array.from(state.positions.values()),

    // Funding: uses live/replayed rates
    processFunding: async () => { /* fetch rates from source, apply to positions */ },
    // ... other methods
  };
};
```

### ReplayAdapter (for Backtesting)

The `ReplayAdapter` implements `ExchangeAdapter` and replays historical data from Postgres. It serves as the `marketDataSource` for the paper adapter during backtesting:

```typescript
export interface ReplayAdapterConfig {
  dataLoader: HistoricalDataLoader;
  exchange: string;
  symbol: string;
  startDate: Date;
  endDate: Date;
}

export const createReplayAdapter = (config: ReplayAdapterConfig): ReplayAdapter => {
  let currentTimestamp = config.startDate;
  // Pre-load historical data into sorted arrays for fast lookup

  return {
    // Advance replay clock
    tick: (timestamp: Date) => { currentTimestamp = timestamp; },

    // Serve historical data at current replay time
    getTicker: async (symbol) => {
      // Return closest price snapshot at or before currentTimestamp
    },
    getFundingRate: async (symbol) => {
      // Return closest funding rate snapshot at or before currentTimestamp
    },
    getOrderBook: async (symbol, depth) => {
      // Return closest order book snapshot at or before currentTimestamp
    },

    // Connection management (no-op for replay)
    connect: async () => {},
    disconnect: async () => {},
    isConnected: () => true,

    // Not applicable for replay -- throw or no-op
    createOrder: async () => { throw new Error("Use PaperAdapter for order execution"); },
    // ... other read-only methods
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
    initialCapitalQuote: BigInt(options.initialCapital) * 100n,
    strategyConfig: loadStrategyConfig(options.strategyConfig),
    riskConfig: loadRiskConfig(options.riskConfig),
    slippageConfig: loadSlippageConfig(options.slippageConfig),
  };

  const dataLoader = createHistoricalDataLoader(options.exchange);
  const engine = createBacktestEngine(config, dataLoader);

  console.log("Running backtest...");
  const result = await engine.run();

  console.log("\n=== Backtest Results ===");
  console.log(`Initial Capital: $${(result.initialCapitalQuote / 100n).toString()}`);
  console.log(`Final Capital: $${(result.finalCapitalQuote / 100n).toString()}`);
  console.log(`Total P&L: $${(result.totalPnLQuote / 100n).toString()}`);
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

## Architecture Summary

The simulation framework uses three composable components:

```
┌─────────────────────────────────────────────────────┐
│                Backtesting Engine                    │
│  (thin orchestration loop + metrics calculation)     │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │             PaperAdapter                       │  │
│  │  (execution simulation, balance/position mgmt) │  │
│  │                                               │  │
│  │  marketDataSource:                            │  │
│  │    ┌────────────────────────────────────────┐ │  │
│  │    │          ReplayAdapter                  │ │  │
│  │    │  (serves historical data from Postgres) │ │  │
│  │    └────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

For live paper trading, `ReplayAdapter` is replaced with the real `CoinbaseAdapter`. The `PaperAdapter` and strategy evaluation code remain identical.

## Future Considerations

1. **Walk-Forward Analysis**: Optimize parameters on rolling windows
2. **Monte Carlo Simulation**: Test strategy robustness with random market scenarios
3. **Multi-Exchange Backtesting**: Test cross-exchange arbitrage strategies
4. **Machine Learning**: Use ML to optimize strategy parameters

## References

- [ADR-0001: Bot Architecture](0001-bot-architecture.md) — Evaluation loop pattern
- [ADR-0010: Exchange Adapters](0010-exchange-adapters.md) — Paper trading adapter (delegating pattern)
- [ADR-0014: Funding Rate Prediction & Strategy](0014-funding-rate-strategy.md) — Strategy logic
- [ADR-0015: Execution Safety & Slippage Modeling](0015-execution-safety-slippage.md) — Slippage estimation
