---
name: Backtesting Engine
overview: Implement event-driven backtesting engine for strategy validation.
todos:
  - id: backtest-types
    content: Define backtest configuration and result types
    status: pending
  - id: event-generator
    content: Implement event generation from historical data
    status: pending
  - id: backtest-engine
    content: Implement main backtesting engine
    status: pending
  - id: performance-metrics
    content: Implement performance metrics calculation (Sharpe, drawdown, win rate)
    status: pending
  - id: tests
    content: Add unit tests for backtesting engine
    status: pending
  - id: lifecycle-management
    content: Move plan to implemented/ directory after completion (update todos, check validation boxes, update roadmap link, move file, delete from active/)
    status: pending
isProject: false
---

> **Note**: This plan is part of Phase 4 (Simulation) in [MVP Roadmap](../README.md).

# Backtesting Engine

## Overview

Implement an event-driven backtesting engine that:
1. Loads historical funding rate and price data
2. Simulates the bot's decision-making process
3. Tracks trades and P&L
4. Calculates performance metrics (Sharpe ratio, max drawdown, win rate)

Backtesting proves the strategy works in past market conditions before risking real capital.

Reference: [ADR-0016: Backtesting & Simulation](../../../../../adrs/0016-backtesting-simulation.md)

## Tasks

### 1. Backtest Types

Create `src/lib/backtest/types.ts`:

```typescript
export interface BacktestConfig {
  startDate: Date;
  endDate: Date;
  initialCapitalCents: bigint;
  exchange: string;
  symbol: string;
  strategyConfig: StrategyConfig;
  riskConfig: RiskConfig;
  slippageConfig: SlippageConfig;
  evaluationIntervalMs: number; // Default: 2000 (2s)
}

export interface BacktestResult {
  config: BacktestConfig;
  initialCapitalCents: bigint;
  finalCapitalCents: bigint;
  totalPnLCents: bigint;
  totalReturnBps: bigint;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdownBps: bigint;
  winRate: number;
  totalTrades: number;
  averageHoldTimeHours: number;
  trades: BacktestTrade[];
  dailyPnL: DailyPnL[];
  metrics: PerformanceMetrics;
}

export interface BacktestTrade {
  id: string;
  entryTime: Date;
  exitTime: Date;
  entryPrice: bigint;
  exitPrice: bigint;
  sizeCents: bigint;
  side: "LONG" | "SHORT";
  pnlCents: bigint;
  returnBps: bigint;
  fundingReceivedCents: bigint;
  slippageCostCents: bigint;
  reason: string;
}

export interface DailyPnL {
  date: Date;
  pnlCents: bigint;
  cumulativePnLCents: bigint;
  drawdownBps: bigint;
}

export interface PerformanceMetrics {
  totalReturnBps: bigint;
  annualizedReturnBps: bigint;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdownBps: bigint;
  volatilityBps: bigint;
  winRate: number;
  averageWinBps: bigint;
  averageLossBps: bigint;
  profitFactor: number;
  averageSlippageBps: bigint;
  averageHoldTimeHours: number;
}
```

### 2. Event Generator

Create `src/lib/backtest/event-generator.ts`:

```typescript
export interface BacktestEvent {
  timestamp: Date;
  fundingRateBps: bigint;
  spotPrice: bigint;
  perpPrice: bigint;
}

export const generateEvents = (
  fundingRates: FundingRateSnapshot[],
  prices: PriceSnapshot[],
  config: BacktestConfig,
): BacktestEvent[] => {
  const events: BacktestEvent[] = [];
  const startTime = config.startDate.getTime();
  const endTime = config.endDate.getTime();
  const intervalMs = config.evaluationIntervalMs;

  for (let time = startTime; time <= endTime; time += intervalMs) {
    const timestamp = new Date(time);
    
    // Find closest funding rate and price snapshots
    const fundingRate = findClosestSnapshot(fundingRates, timestamp);
    const price = findClosestSnapshot(prices, timestamp);

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

const findClosestSnapshot = <T extends { timestamp: Date }>(
  snapshots: T[],
  timestamp: Date,
): T | null => {
  // Binary search for closest snapshot at or before timestamp
  let left = 0;
  let right = snapshots.length - 1;
  let result: T | null = null;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (snapshots[mid].timestamp <= timestamp) {
      result = snapshots[mid];
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return result;
};
```

### 3. Backtesting Engine

Create `src/lib/backtest/engine.ts`:

```typescript
export interface BacktestEngine {
  run(): Promise<BacktestResult>;
}

export interface BacktestState {
  capitalCents: bigint;
  position: BacktestPosition | null;
  fundingHistory: FundingRateSnapshot[];
  trades: BacktestTrade[];
  dailyPnL: Map<string, bigint>;
  peakCapital: bigint;
  currentDrawdown: bigint;
}

export interface BacktestPosition {
  id: string;
  entryTime: Date;
  entryFundingRateBps: bigint;
  spotEntryPrice: bigint;
  perpEntryPrice: bigint;
  sizeCents: bigint;
  side: "SHORT";
  marginUsedCents: bigint;
}

export const createBacktestEngine = (
  config: BacktestConfig,
  dataLoader: HistoricalDataLoader,
): BacktestEngine => {
  let state: BacktestState = {
    capitalCents: config.initialCapitalCents,
    position: null,
    fundingHistory: [],
    trades: [],
    dailyPnL: new Map(),
    peakCapital: config.initialCapitalCents,
    currentDrawdown: 0n,
  };

  const processEvent = async (event: BacktestEvent): Promise<void> => {
    // 1. Update funding history
    state.fundingHistory.push({
      symbol: config.symbol,
      currentRateBps: event.fundingRateBps,
      predictedRateBps: event.fundingRateBps,
      nextFundingTime: new Date(event.timestamp.getTime() + 8 * 60 * 60 * 1000),
      lastFundingTime: event.timestamp,
      markPrice: event.perpPrice,
      indexPrice: event.spotPrice,
      timestamp: event.timestamp,
      source: "exchange",
    });

    // Keep only last 48 snapshots for trend analysis
    if (state.fundingHistory.length > 48) {
      state.fundingHistory = state.fundingHistory.slice(-48);
    }

    // 2. Build market state for strategy evaluation
    const marketState: MarketState = {
      position: state.position ? { open: true, ...state.position } : { open: false },
      fundingRate: state.fundingHistory[state.fundingHistory.length - 1],
      fundingHistory: state.fundingHistory,
    };

    // 3. Build bot state for risk evaluation
    const botState: BotState = {
      account: {
        equityCents: state.capitalCents,
        marginUsedCents: state.position?.marginUsedCents ?? 0n,
      },
      position: state.position ? {
        sizeCents: state.position.sizeCents,
        side: state.position.side,
      } : null,
      market: {
        markPrice: event.perpPrice,
      },
    };

    // 4. Evaluate risk
    const risk = evaluateRisk(botState, config.riskConfig);

    // 5. Evaluate strategy
    const intent = evaluateStrategy(marketState, risk, config.strategyConfig);

    // 6. Execute intent (simulated)
    if (intent.type === "ENTER_HEDGE" && !state.position) {
      await simulateEntry(intent.params, event);
    } else if (intent.type === "EXIT_HEDGE" && state.position) {
      await simulateExit(intent.reason, event);
    }

    // 7. Update daily P&L tracking
    updateDailyPnL(event.timestamp);
  };

  const simulateEntry = async (
    params: EnterHedgeParams,
    event: BacktestEvent,
  ): Promise<void> => {
    // Get order book for slippage estimation (if available)
    const orderBook = await dataLoader.loadOrderBook(
      config.exchange,
      config.symbol,
      event.timestamp,
    );

    let slippageBps = config.slippageConfig.maxSlippageBps / 2n; // Default slippage
    if (orderBook) {
      const estimate = estimateSlippage(
        orderBook,
        "BUY",
        params.sizeCents,
        config.slippageConfig.maxSlippageBps,
      );
      if (!estimate.canExecute) {
        return; // Skip entry due to slippage
      }
      slippageBps = estimate.slippageBps;
    }

    // Calculate entry prices with slippage
    const spotEntryPrice = event.spotPrice + (event.spotPrice * slippageBps) / 10000n;
    const perpEntryPrice = event.perpPrice - (event.perpPrice * slippageBps) / 10000n;

    // Calculate margin requirement
    const marginRequired = (params.sizeCents * 10000n) / BigInt(config.riskConfig.maxLeverageBps);

    // Create position
    state.position = {
      id: `bt-${event.timestamp.getTime()}`,
      entryTime: event.timestamp,
      entryFundingRateBps: event.fundingRateBps,
      spotEntryPrice,
      perpEntryPrice,
      sizeCents: params.sizeCents,
      side: "SHORT",
      marginUsedCents: marginRequired,
    };

    state.capitalCents -= marginRequired;
  };

  const simulateExit = async (
    reason: string,
    event: BacktestEvent,
  ): Promise<void> => {
    if (!state.position) return;

    const position = state.position;

    // Get order book for slippage
    const orderBook = await dataLoader.loadOrderBook(
      config.exchange,
      config.symbol,
      event.timestamp,
    );

    let slippageBps = config.slippageConfig.maxSlippageBps / 2n;
    if (orderBook) {
      const estimate = estimateSlippage(
        orderBook,
        "SELL",
        position.sizeCents,
        config.slippageConfig.maxSlippageBps,
      );
      slippageBps = estimate.slippageBps;
    }

    // Calculate exit prices with slippage
    const spotExitPrice = event.spotPrice - (event.spotPrice * slippageBps) / 10000n;
    const perpExitPrice = event.perpPrice + (event.perpPrice * slippageBps) / 10000n;

    // Calculate P&L components
    const spotPnL = ((spotExitPrice - position.spotEntryPrice) * position.sizeCents) 
      / position.spotEntryPrice;
    const perpPnL = ((position.perpEntryPrice - perpExitPrice) * position.sizeCents) 
      / position.perpEntryPrice;

    // Calculate funding received
    const holdTimeHours = (event.timestamp.getTime() - position.entryTime.getTime()) 
      / (1000 * 60 * 60);
    const fundingPeriods = Math.floor(holdTimeHours / 8);
    const fundingReceivedCents = (position.sizeCents * position.entryFundingRateBps 
      * BigInt(fundingPeriods)) / 10000n;

    // Calculate slippage cost
    const entrySlippageCost = (position.sizeCents * slippageBps) / 10000n;
    const exitSlippageCost = (position.sizeCents * slippageBps) / 10000n;
    const totalSlippageCost = entrySlippageCost + exitSlippageCost;

    // Net P&L
    const tradePnL = fundingReceivedCents - totalSlippageCost + spotPnL + perpPnL;

    // Record trade
    const trade: BacktestTrade = {
      id: position.id,
      entryTime: position.entryTime,
      exitTime: event.timestamp,
      entryPrice: position.spotEntryPrice,
      exitPrice: spotExitPrice,
      sizeCents: position.sizeCents,
      side: position.side,
      pnlCents: tradePnL,
      returnBps: (tradePnL * 10000n) / position.sizeCents,
      fundingReceivedCents,
      slippageCostCents: totalSlippageCost,
      reason,
    };

    state.trades.push(trade);

    // Update capital
    state.capitalCents += position.marginUsedCents + tradePnL;

    // Update peak and drawdown
    if (state.capitalCents > state.peakCapital) {
      state.peakCapital = state.capitalCents;
    }
    state.currentDrawdown = ((state.peakCapital - state.capitalCents) * 10000n) 
      / state.peakCapital;

    // Clear position
    state.position = null;
  };

  const updateDailyPnL = (timestamp: Date): void => {
    const dateKey = timestamp.toISOString().slice(0, 10);
    const existingPnL = state.dailyPnL.get(dateKey) ?? 0n;
    const todayPnL = state.trades
      .filter((t) => t.exitTime.toISOString().slice(0, 10) === dateKey)
      .reduce((sum, t) => sum + t.pnlCents, 0n);
    state.dailyPnL.set(dateKey, existingPnL + todayPnL);
  };

  const calculateResults = (): BacktestResult => {
    const totalPnL = state.capitalCents - config.initialCapitalCents;
    const totalReturnBps = (totalPnL * 10000n) / config.initialCapitalCents;

    // Calculate Sharpe ratio
    const returns = state.trades.map((t) => Number(t.returnBps) / 10000);
    const avgReturn = returns.length > 0 
      ? returns.reduce((sum, r) => sum + r, 0) / returns.length 
      : 0;
    const variance = returns.length > 0
      ? returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
      : 0;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;

    // Calculate Sortino ratio (only downside deviation)
    const negativeReturns = returns.filter((r) => r < 0);
    const downsideVariance = negativeReturns.length > 0
      ? negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negativeReturns.length
      : 0;
    const downsideStdDev = Math.sqrt(downsideVariance);
    const sortinoRatio = downsideStdDev > 0 ? avgReturn / downsideStdDev : 0;

    // Calculate max drawdown
    let peak = config.initialCapitalCents;
    let maxDrawdown = 0n;
    let runningCapital = config.initialCapitalCents;

    for (const trade of state.trades) {
      runningCapital += trade.pnlCents;
      if (runningCapital > peak) {
        peak = runningCapital;
      }
      const drawdown = ((peak - runningCapital) * 10000n) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    // Calculate win rate
    const winningTrades = state.trades.filter((t) => t.pnlCents > 0n).length;
    const winRate = state.trades.length > 0 ? winningTrades / state.trades.length : 0;

    // Calculate average hold time
    const totalHoldTime = state.trades.reduce(
      (sum, t) => sum + (t.exitTime.getTime() - t.entryTime.getTime()),
      0,
    );
    const averageHoldTimeHours = state.trades.length > 0
      ? totalHoldTime / (state.trades.length * 1000 * 60 * 60)
      : 0;

    // Build daily P&L array
    const dailyPnLArray: DailyPnL[] = [];
    let cumulativePnL = 0n;
    let dailyPeak = 0n;

    for (const [date, pnl] of state.dailyPnL.entries()) {
      cumulativePnL += pnl;
      if (cumulativePnL > dailyPeak) {
        dailyPeak = cumulativePnL;
      }
      const drawdown = dailyPeak > 0n
        ? ((dailyPeak - cumulativePnL) * 10000n) / dailyPeak
        : 0n;

      dailyPnLArray.push({
        date: new Date(date),
        pnlCents: pnl,
        cumulativePnLCents: cumulativePnL,
        drawdownBps: drawdown,
      });
    }

    return {
      config,
      initialCapitalCents: config.initialCapitalCents,
      finalCapitalCents: state.capitalCents,
      totalPnLCents: totalPnL,
      totalReturnBps,
      sharpeRatio,
      sortinoRatio,
      maxDrawdownBps: maxDrawdown,
      winRate,
      totalTrades: state.trades.length,
      averageHoldTimeHours,
      trades: state.trades,
      dailyPnL: dailyPnLArray,
      metrics: {
        totalReturnBps,
        annualizedReturnBps: totalReturnBps * 365n / BigInt(
          Math.ceil((config.endDate.getTime() - config.startDate.getTime()) / (1000 * 60 * 60 * 24))
        ),
        sharpeRatio,
        sortinoRatio,
        maxDrawdownBps: maxDrawdown,
        volatilityBps: BigInt(Math.round(stdDev * 10000)),
        winRate,
        averageWinBps: calculateAverageWin(state.trades),
        averageLossBps: calculateAverageLoss(state.trades),
        profitFactor: calculateProfitFactor(state.trades),
        averageSlippageBps: calculateAverageSlippage(state.trades),
        averageHoldTimeHours,
      },
    };
  };

  return {
    run: async (): Promise<BacktestResult> => {
      // 1. Load historical data
      const fundingRates = await dataLoader.loadFundingRates(
        config.exchange,
        config.symbol,
        config.startDate,
        config.endDate,
      );
      const prices = await dataLoader.loadPrices(
        config.exchange,
        config.symbol,
        config.startDate,
        config.endDate,
      );

      // 2. Generate events
      const events = generateEvents(fundingRates, prices, config);

      // 3. Process each event
      for (const event of events) {
        await processEvent(event);
      }

      // 4. Close any open position at end
      if (state.position) {
        const lastEvent = events[events.length - 1];
        if (lastEvent) {
          await simulateExit("backtest_end", lastEvent);
        }
      }

      // 5. Calculate results
      return calculateResults();
    },
  };
};
```

### 4. Performance Metrics Helpers

```typescript
const calculateAverageWin = (trades: BacktestTrade[]): bigint => {
  const wins = trades.filter((t) => t.pnlCents > 0n);
  if (wins.length === 0) return 0n;
  return wins.reduce((sum, t) => sum + t.returnBps, 0n) / BigInt(wins.length);
};

const calculateAverageLoss = (trades: BacktestTrade[]): bigint => {
  const losses = trades.filter((t) => t.pnlCents < 0n);
  if (losses.length === 0) return 0n;
  return losses.reduce((sum, t) => sum + t.returnBps, 0n) / BigInt(losses.length);
};

const calculateProfitFactor = (trades: BacktestTrade[]): number => {
  const totalWins = trades
    .filter((t) => t.pnlCents > 0n)
    .reduce((sum, t) => sum + Number(t.pnlCents), 0);
  const totalLosses = Math.abs(trades
    .filter((t) => t.pnlCents < 0n)
    .reduce((sum, t) => sum + Number(t.pnlCents), 0));
  return totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;
};

const calculateAverageSlippage = (trades: BacktestTrade[]): bigint => {
  if (trades.length === 0) return 0n;
  const totalSlippage = trades.reduce(
    (sum, t) => sum + (t.slippageCostCents * 10000n) / t.sizeCents,
    0n,
  );
  return totalSlippage / BigInt(trades.length);
};
```

## File Structure

```
src/lib/backtest/
├── types.ts              # Backtest type definitions
├── event-generator.ts    # Event generation from historical data
├── event-generator.test.ts
├── engine.ts             # Main backtesting engine
├── engine.test.ts
├── metrics.ts            # Performance metrics calculation
├── metrics.test.ts
└── index.ts              # Re-exports
```

## Dependencies

No new dependencies required.

## Validation

- [ ] Events generated correctly from historical data
- [ ] Entries and exits simulated correctly
- [ ] Funding payments calculated correctly
- [ ] Slippage costs applied correctly
- [ ] Sharpe ratio calculated correctly
- [ ] Max drawdown calculated correctly
- [ ] Win rate calculated correctly
- [ ] Unit tests pass

## References

- [MVP Roadmap](../README.md)
- [ADR-0016: Backtesting & Simulation](../../../../../adrs/0016-backtesting-simulation.md)
- [ADR-0014: Funding Rate Strategy](../../../../../adrs/0014-funding-rate-strategy.md)
