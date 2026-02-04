---
name: Strategy Engine
overview: Implement funding rate analysis and strategy engine for entry/exit signal generation.
todos:
  - id: funding-rate-types
    content: Define funding rate types and configuration
    status: pending
  - id: trend-analysis
    content: Implement funding rate trend analysis (moving averages, volatility)
    status: pending
  - id: entry-signals
    content: Implement entry signal generation
    status: pending
  - id: exit-signals
    content: Implement exit signal generation
    status: pending
  - id: strategy-evaluation
    content: Implement main strategy evaluation function
    status: pending
  - id: tests
    content: Add unit tests for strategy engine
    status: pending
  - id: lifecycle-management
    content: Move plan to implemented/ directory after completion (update todos, check validation boxes, update roadmap link, move file, delete from active/)
    status: pending
isProject: false
---

> **Note**: This plan is part of Phase 3 (Core Logic) in [MVP Roadmap](../README.md).

# Strategy Engine

## Overview

Implement the funding rate prediction and strategy engine that:
1. Tracks current and predicted funding rates
2. Analyzes funding rate trends (moving averages, volatility)
3. Detects funding rate regimes (high/stable vs low/volatile)
4. Generates entry/exit signals based on funding rate analysis

The bot's **core alpha** comes from entering when funding is high and exiting before it drops.

Reference: [ADR-0014: Funding Rate Prediction & Strategy](../../../../adrs/0014-funding-rate-strategy.md)

## Tasks

### 1. Funding Rate Types

Create `src/domains/strategy/types.ts`:

```typescript
export interface FundingRateSnapshot {
  symbol: string;
  currentRateBps: bigint;
  predictedRateBps: bigint;
  nextFundingTime: Date;
  lastFundingTime: Date;
  markPrice: bigint;
  indexPrice: bigint;
  timestamp: Date;
  source: "exchange" | "calculated";
}

export interface FundingRateHistory {
  snapshots: FundingRateSnapshot[];
  averageRateBps: bigint;
  volatilityBps: bigint;
  trend: "increasing" | "decreasing" | "stable";
  regime: "high_stable" | "high_volatile" | "low_stable" | "low_volatile";
}

export type TradingIntent =
  | { type: "NOOP" }
  | { type: "ENTER_HEDGE"; params: EnterHedgeParams }
  | { type: "EXIT_HEDGE"; reason: string };

export interface EnterHedgeParams {
  sizeCents: bigint;
  expectedYieldBps: bigint;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}
```

### 2. Trend Analysis

Create `src/domains/strategy/trend-analysis.ts`:

**Recommended**: Use `technicalindicators` library for SMA, EMA, and standard deviation calculations:

```typescript
import { SMA, EMA, SD } from "technicalindicators";

/**
 * Calculate average using technicalindicators SMA
 * For bigint arrays, convert to number for calculation, then back to bigint
 */
export const calculateAverage = (rates: bigint[]): bigint => {
  if (rates.length === 0) return 0n;
  const numbers = rates.map((r) => Number(r));
  const smaResult = SMA.calculate({ period: numbers.length, values: numbers });
  return BigInt(Math.round(smaResult[0] ?? 0));
};

/**
 * Calculate standard deviation using technicalindicators SD
 */
export const calculateStandardDeviation = (rates: bigint[]): bigint => {
  if (rates.length < 2) return 0n;
  const numbers = rates.map((r) => Number(r));
  const sdResult = SD.calculate({ period: numbers.length, values: numbers });
  return BigInt(Math.round(sdResult[0] ?? 0));
};

/**
 * Calculate exponential moving average for trend detection
 */
export const calculateEMA = (rates: bigint[], period: number): bigint => {
  if (rates.length === 0) return 0n;
  const numbers = rates.map((r) => Number(r));
  const emaResult = EMA.calculate({ period, values: numbers });
  const lastEma = emaResult[emaResult.length - 1];
  return BigInt(Math.round(lastEma ?? 0));
};

export const analyzeFundingRateTrend = (
  snapshots: FundingRateSnapshot[],
  window: number = 24,
): FundingRateHistory => {
  if (snapshots.length < window) {
    return {
      snapshots,
      averageRateBps: calculateAverage(snapshots.map((s) => s.currentRateBps)),
      volatilityBps: 0n,
      trend: "stable",
      regime: "low_stable",
    };
  }

  const recent = snapshots.slice(-window);
  const rates = recent.map((s) => s.currentRateBps);
  
  // Use technicalindicators for calculations
  const averageRateBps = calculateAverage(rates);
  const volatilityBps = calculateStandardDeviation(rates);
  
  // Trend: compare first half vs second half using SMA
  const firstHalf = calculateAverage(rates.slice(0, Math.floor(window / 2)));
  const secondHalf = calculateAverage(rates.slice(Math.floor(window / 2)));
  const trend = secondHalf > firstHalf + 5n
    ? "increasing"
    : secondHalf < firstHalf - 5n
    ? "decreasing"
    : "stable";
  
  // Regime classification
  const isHigh = averageRateBps > 10n; // > 0.10%
  const isVolatile = volatilityBps > 5n; // > 0.05% std dev
  
  const regime = isHigh
    ? isVolatile ? "high_volatile" : "high_stable"
    : isVolatile ? "low_volatile" : "low_stable";
  
  return { snapshots: recent, averageRateBps, volatilityBps, trend, regime };
};
```

**Why `technicalindicators`?**
- Battle-tested library with 100+ indicators
- Handles edge cases correctly (empty arrays, NaN values)
- More indicators available if strategy evolves (RSI, MACD, Bollinger Bands)
- Well-maintained with TypeScript types

### 3. Entry Signal Generation

Create `src/domains/strategy/entry-signal.ts`:

```typescript
export interface EntrySignal {
  type: "ENTER";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  reasons: string[];
  fundingRate: FundingRateSnapshot;
  history: FundingRateHistory;
  expectedYieldBps: bigint;
}

export const generateEntrySignal = (
  fundingRate: FundingRateSnapshot,
  history: FundingRateHistory,
  config: StrategyConfig,
): EntrySignal | null => {
  const reasons: string[] = [];
  let confidence: "HIGH" | "MEDIUM" | "LOW" = "LOW";

  // 1. Check current rate threshold
  if (fundingRate.currentRateBps < config.minFundingRateBps) {
    return null;
  }

  // 2. Check predicted rate
  // 3. Check trend
  // 4. Check regime
  // 5. Calculate expected yield

  return {
    type: "ENTER",
    confidence,
    reasons,
    fundingRate,
    history,
    expectedYieldBps,
  };
};
```

### 4. Exit Signal Generation

Create `src/domains/strategy/exit-signal.ts`:

```typescript
export interface ExitSignal {
  type: "EXIT";
  reason: "rate_drop" | "trend_change" | "regime_change" | "target_reached" | "risk";
  fundingRate: FundingRateSnapshot;
  history: FundingRateHistory;
  realizedYieldBps: bigint;
}

export const generateExitSignal = (
  position: Position,
  fundingRate: FundingRateSnapshot,
  history: FundingRateHistory,
  config: StrategyConfig,
): ExitSignal | null => {
  // 1. Check predicted rate drop
  // 2. Check trend change
  // 3. Check regime change
  // 4. Check target yield reached
  
  return null; // No exit signal
};
```

### 5. Strategy Evaluation

Create `src/domains/strategy/evaluate.ts`:

```typescript
export const evaluateStrategy = (
  state: MarketState,
  risk: RiskAssessment,
  config: StrategyConfig,
): TradingIntent => {
  // 1. Check risk first
  if (risk.action === "BLOCK" || risk.action === "EXIT") {
    return { type: "NOOP" };
  }

  // 2. Analyze funding rate trend
  const history = analyzeFundingRateTrend(state.fundingHistory, config.trendWindow);

  // 3. Generate signals
  if (!state.position?.open) {
    const entrySignal = generateEntrySignal(state.fundingRate, history, config);
    if (entrySignal && risk.action === "ALLOW") {
      return {
        type: "ENTER_HEDGE",
        params: {
          sizeCents: calculatePositionSize(risk, config),
          expectedYieldBps: entrySignal.expectedYieldBps,
          confidence: entrySignal.confidence,
        },
      };
    }
    return { type: "NOOP" };
  }

  // 4. Position open: check for exit
  const exitSignal = generateExitSignal(state.position, state.fundingRate, history, config);
  if (exitSignal || risk.action === "EXIT") {
    return {
      type: "EXIT_HEDGE",
      reason: exitSignal?.reason ?? "risk",
    };
  }

  return { type: "NOOP" };
};
```

## Strategy Configuration

```typescript
import * as v from "valibot";

export const StrategyConfigSchema = v.object({
  // Entry thresholds
  minFundingRateBps: v.pipe(v.number(), v.minValue(1), v.maxValue(1000)),
  minPredictedRateBps: v.pipe(v.number(), v.minValue(1), v.maxValue(1000)),
  
  // Exit thresholds
  exitFundingRateBps: v.pipe(v.number(), v.minValue(0), v.maxValue(100)),
  targetYieldBps: v.pipe(v.number(), v.minValue(10), v.maxValue(1000)),
  
  // Trend analysis
  trendWindow: v.pipe(v.number(), v.minValue(6), v.maxValue(48)),
  trendThresholdBps: v.pipe(v.number(), v.minValue(1), v.maxValue(20)),
  
  // Volatility thresholds
  volatilityThresholdBps: v.pipe(v.number(), v.minValue(1), v.maxValue(50)),
});

export type StrategyConfig = v.InferOutput<typeof StrategyConfigSchema>;
```

## File Structure

```
src/domains/strategy/
├── types.ts              # Strategy type definitions
├── config.ts             # Strategy configuration
├── trend-analysis.ts     # Funding rate trend analysis
├── trend-analysis.test.ts
├── entry-signal.ts       # Entry signal generation
├── entry-signal.test.ts
├── exit-signal.ts        # Exit signal generation
├── exit-signal.test.ts
├── evaluate.ts           # Main strategy evaluation
├── evaluate.test.ts
└── index.ts              # Re-exports
```

## Dependencies

```bash
# Recommended: Use battle-tested technical analysis library
pnpm add technicalindicators

# Type definitions (if needed)
pnpm add -D @types/technicalindicators
```

**Why `technicalindicators`?**
- 100+ technical indicators (SMA, EMA, RSI, MACD, Bollinger Bands, etc.)
- Battle-tested with proper edge case handling
- TypeScript support
- Extensible if strategy evolves to use more indicators

## Validation

- [ ] Trend analysis calculates averages correctly
- [ ] **`technicalindicators` library used for SMA/EMA/SD calculations**
- [ ] Regime detection classifies correctly
- [ ] Entry signals generated when conditions met
- [ ] Exit signals generated when conditions met
- [ ] Strategy respects risk assessment
- [ ] Unit tests pass

## References

- [MVP Roadmap](../README.md)
- [ADR-0014: Funding Rate Prediction & Strategy](../../../../adrs/0014-funding-rate-strategy.md)
- [ADR-0013: Risk Management Engine](../../../../adrs/0013-risk-management.md)
