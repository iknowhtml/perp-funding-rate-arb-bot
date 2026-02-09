# ADR 0014: Funding Rate Prediction & Strategy

- **Status:** Accepted
- **Date:** 2026-02-04
- **Owners:** -
- **Related:**
  - [ADR-0001: Bot Architecture](0001-bot-architecture.md)
  - [ADR-0012: State Machines](0012-state-machines.md)
  - [ADR-0013: Risk Management Engine](0013-risk-management.md)

## Context

Funding rates are **not fixed**—they change every 8 hours (most exchanges) and can flip direction:

- **Predicted funding rate** is announced before settlement (usually 1 hour before)
- **Actual funding rate** is applied at settlement time
- **Rate direction changes** can turn profitable positions into losses
- **Rate volatility** affects entry/exit timing

The bot's **core alpha** comes from:
1. **Entering** when funding rate is high and predicted to stay high
2. **Exiting** before funding rate drops or flips negative
3. **Avoiding** positions when funding rate is volatile or declining

Without proper funding rate analysis:
- May enter positions right before rate drops
- May exit positions right before rate increases
- No visibility into funding rate trends

## Decision

**Implement comprehensive funding rate prediction and strategy** that:
1. Tracks current and predicted funding rates
2. Analyzes funding rate trends (moving averages, volatility)
3. Detects funding rate regimes (high/stable vs low/volatile)
4. Generates entry/exit signals based on funding rate analysis
5. Monitors funding rate changes during position lifecycle

### Funding Rate Data Model

```typescript
export interface FundingRateSnapshot {
  symbol: string;
  currentRateBps: bigint;           // Current funding rate (basis points)
  predictedRateBps: bigint;         // Predicted next funding rate
  nextFundingTime: Date;            // Next funding settlement time
  lastFundingTime: Date;             // Last funding settlement time
  markPrice: bigint;                 // Mark price at snapshot
  indexPrice: bigint;                // Index price at snapshot
  timestamp: Date;
  source: "exchange" | "calculated";
}

export interface FundingRateHistory {
  snapshots: FundingRateSnapshot[];
  averageRateBps: bigint;           // Average over period
  volatilityBps: bigint;             // Standard deviation
  trend: "increasing" | "decreasing" | "stable";
  regime: "high_stable" | "high_volatile" | "low_stable" | "low_volatile";
}
```

### Type Definitions

```typescript
// Position type (referenced in ADR-0012: State Machines)
export interface Position {
  open: boolean;
  entryTime: Date;
  entryFundingRateBps: bigint;
  entryTrend: "increasing" | "decreasing" | "stable";
  entryRegime: "high_stable" | "high_volatile" | "low_stable" | "low_volatile";
  sizeQuote: bigint;
  side: "LONG" | "SHORT";
}
```

### Helper Functions

SMA and standard deviation are trivial calculations — implement them as pure bigint functions
to avoid an external dependency and the lossy `bigint → number → bigint` round-trip:

```typescript
// Parse funding rate string to basis points (bigint)
export const parseRateToBps = (rate: string): bigint => {
  const rateNum = Number.parseFloat(rate);
  return BigInt(Math.round(rateNum * 10000)); // Convert to basis points
};

// Parse price string to bigint (in smallest quote unit)
export const parsePrice = (price: string): bigint => {
  const priceNum = Number.parseFloat(price);
  // Convert to smallest quote unit (e.g., USD cents)
  return BigInt(Math.round(priceNum * 100));
};

// Integer square root via Newton's method (used by calculateStdDev)
export const bigintSqrt = (value: bigint): bigint => {
  if (value < 0n) throw new Error("Square root of negative number");
  if (value < 2n) return value;
  let x = value;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + value / x) / 2n;
  }
  return x;
};

// Simple moving average over bigint values (no precision loss)
export const calculateSma = (values: readonly bigint[]): bigint => {
  if (values.length === 0) return 0n;
  const sum = values.reduce((acc, val) => acc + val, 0n);
  return sum / BigInt(values.length);
};

// Population standard deviation over bigint values (in same unit as input)
export const calculateStdDev = (values: readonly bigint[]): bigint => {
  if (values.length < 2) return 0n;
  const mean = calculateSma(values);
  const squaredDiffs = values.reduce((acc, v) => acc + (v - mean) ** 2n, 0n);
  const variance = squaredDiffs / BigInt(values.length);
  return bigintSqrt(variance);
};
```

**Note**: These are pure bigint implementations — no conversion to `number` and back, so no
precision loss. The integer square root uses Newton's method which converges in O(log n) steps.

### Funding Rate Prediction

Most exchanges provide **predicted funding rate** via API:

```typescript
export const fetchFundingRate = async (
  adapter: ExchangeAdapter,
  symbol: string,
): Promise<FundingRateSnapshot> => {
  const response = await adapter.getFundingRate(symbol);

  return {
    symbol,
    currentRateBps: parseRateToBps(response.lastFundingRate),
    predictedRateBps: parseRateToBps(response.predictedFundingRate ?? response.lastFundingRate),
    nextFundingTime: new Date(response.nextFundingTime),
    lastFundingTime: new Date(response.lastFundingTime),
    markPrice: parsePrice(response.markPrice),
    indexPrice: parsePrice(response.indexPrice),
    timestamp: new Date(),
    source: "exchange",
  };
};
```

### Funding Rate Trend Analysis

Calculate simple moving averages and volatility:

```typescript
export const analyzeFundingRateTrend = (
  snapshots: FundingRateSnapshot[],
  window: number = 24, // 24 snapshots = 8 hours * 3 (if polling every 8 hours)
): FundingRateHistory => {
  if (snapshots.length < window) {
    return {
      snapshots,
      averageRateBps: calculateSma(snapshots.map((s) => s.currentRateBps)),
      volatilityBps: 0n,
      trend: "stable",
      regime: "low_stable",
    };
  }

  const recent = snapshots.slice(-window);
  const rates = recent.map((s) => s.currentRateBps);
  
  const averageRateBps = calculateSma(rates);
  const volatilityBps = calculateStdDev(rates);
  
  // Trend: compare first half vs second half
  const firstHalf = calculateSma(rates.slice(0, Math.floor(window / 2)));
  const secondHalf = calculateSma(rates.slice(Math.floor(window / 2)));
  const trend = secondHalf > firstHalf + 5n
    ? "increasing"
    : secondHalf < firstHalf - 5n
    ? "decreasing"
    : "stable";
  
  // Regime: high/low based on average, stable/volatile based on volatility
  const isHigh = averageRateBps > 10n; // > 0.10%
  const isVolatile = volatilityBps > 5n; // > 0.05% std dev
  
  const regime = isHigh
    ? isVolatile
      ? "high_volatile"
      : "high_stable"
    : isVolatile
    ? "low_volatile"
    : "low_stable";
  
  return {
    snapshots: recent,
    averageRateBps,
    volatilityBps,
    trend,
    regime,
  };
};
```

### Entry Signal Generation

Enter position when:

1. **Current funding rate** > minimum threshold (e.g., 10 bps)
2. **Predicted funding rate** > current rate OR predicted > threshold
3. **Trend** is "stable" or "increasing" (not "decreasing")
4. **Regime** is "high_stable" or "high_volatile" (not "low_*")
5. **Risk assessment** allows entry (ADR-0013)

```typescript
export interface EntrySignal {
  type: "ENTER";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  reasons: string[];
  fundingRate: FundingRateSnapshot;
  history: FundingRateHistory;
  expectedYieldBps: bigint; // Expected funding yield over position duration
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
    return null; // Below threshold
  }
  reasons.push(`Current rate ${fundingRate.currentRateBps}bps exceeds min ${config.minFundingRateBps}bps`);

  // 2. Check predicted rate
  if (fundingRate.predictedRateBps < fundingRate.currentRateBps) {
    reasons.push(`Predicted rate ${fundingRate.predictedRateBps}bps is lower than current`);
    confidence = "LOW";
  } else {
    reasons.push(`Predicted rate ${fundingRate.predictedRateBps}bps is higher than current`);
    confidence = "HIGH";
  }

  // 3. Check trend
  if (history.trend === "decreasing") {
    reasons.push(`Trend is decreasing`);
    confidence = confidence === "HIGH" ? "MEDIUM" : "LOW";
  } else if (history.trend === "increasing") {
    reasons.push(`Trend is increasing`);
    confidence = "HIGH";
  }

  // 4. Check regime
  if (history.regime === "low_stable" || history.regime === "low_volatile") {
    return null; // Low funding regime
  }
  if (history.regime === "high_stable") {
    reasons.push(`Regime is high_stable`);
    confidence = "HIGH";
  } else if (history.regime === "high_volatile") {
    reasons.push(`Regime is high_volatile`);
    confidence = confidence === "HIGH" ? "MEDIUM" : "LOW";
  }

  // 5. Calculate expected yield
  const positionDurationHours = 8; // Assume 8-hour position (one funding period)
  const expectedYieldBps = (fundingRate.predictedRateBps * BigInt(positionDurationHours)) / 8n;

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

### Exit Signal Generation

Exit position when:

1. **Predicted funding rate** drops below threshold (e.g., 5 bps)
2. **Trend** changes to "decreasing"
3. **Regime** changes to "low_*"
4. **Risk assessment** requires exit (ADR-0013)
5. **Target yield** reached (configurable)

```typescript
export interface ExitSignal {
  type: "EXIT";
  reason: "rate_drop" | "trend_change" | "regime_change" | "target_reached" | "risk";
  fundingRate: FundingRateSnapshot;
  history: FundingRateHistory;
  realizedYieldBps: bigint; // Actual yield since entry
}

// Calculate realized yield since position entry
export const calculateRealizedYield = (
  position: Position,
  currentFundingRate: FundingRateSnapshot,
): bigint => {
  const holdTimeMs = currentFundingRate.timestamp.getTime() - position.entryTime.getTime();
  const holdTimeHours = holdTimeMs / (1000 * 60 * 60);
  // Funding is paid every 8 hours, so calculate how many periods
  const fundingPeriods = Math.floor(holdTimeHours / 8);
  // Use entry funding rate for calculation
  return (position.sizeQuote * position.entryFundingRateBps * BigInt(fundingPeriods)) / 10000n;
};

export const generateExitSignal = (
  position: Position,
  fundingRate: FundingRateSnapshot,
  history: FundingRateHistory,
  config: StrategyConfig,
): ExitSignal | null => {
  // 1. Check predicted rate drop
  if (fundingRate.predictedRateBps < config.exitFundingRateBps) {
    return {
      type: "EXIT",
      reason: "rate_drop",
      fundingRate,
      history,
      realizedYieldBps: calculateRealizedYield(position, fundingRate),
    };
  }

  // 2. Check trend change
  if (history.trend === "decreasing" && position.entryTrend !== "decreasing") {
    return {
      type: "EXIT",
      reason: "trend_change",
      fundingRate,
      history,
      realizedYieldBps: calculateRealizedYield(position, fundingRate),
    };
  }

  // 3. Check regime change
  if ((history.regime === "low_stable" || history.regime === "low_volatile") &&
      position.entryRegime.startsWith("high")) {
    return {
      type: "EXIT",
      reason: "regime_change",
      fundingRate,
      history,
      realizedYieldBps: calculateRealizedYield(position, fundingRate),
    };
  }

  // 4. Check target yield
  const realizedYieldBps = calculateRealizedYield(position, fundingRate);
  if (realizedYieldBps >= config.targetYieldBps) {
    return {
      type: "EXIT",
      reason: "target_reached",
      fundingRate,
      history,
      realizedYieldBps,
    };
  }

  return null;
};
```

### Strategy Configuration

```typescript
import * as v from "valibot";

export const StrategyConfigSchema = v.object({
  // Entry thresholds
  minFundingRateBps: v.pipe(v.number(), v.minValue(1), v.maxValue(1000)), // 0.01% to 10%
  minPredictedRateBps: v.pipe(v.number(), v.minValue(1), v.maxValue(1000)),
  
  // Exit thresholds
  exitFundingRateBps: v.pipe(v.number(), v.minValue(0), v.maxValue(100)), // 0% to 1%
  targetYieldBps: v.pipe(v.number(), v.minValue(10), v.maxValue(1000)), // 0.10% to 10%
  
  // Trend analysis
  trendWindow: v.pipe(v.number(), v.minValue(6), v.maxValue(48)), // 6 to 48 snapshots
  trendThresholdBps: v.pipe(v.number(), v.minValue(1), v.maxValue(20)), // 0.01% to 0.20%
  
  // Volatility thresholds
  volatilityThresholdBps: v.pipe(v.number(), v.minValue(1), v.maxValue(50)), // 0.01% to 0.50%
});

export type StrategyConfig = v.InferOutput<typeof StrategyConfigSchema>;
```

### Integration with Evaluation Loop

```typescript
// src/domains/strategy/strategy.ts

export const evaluateStrategy = (
  state: MarketState,
  risk: RiskAssessment,
  config: StrategyConfig,
): TradingIntent => {
  // 1. Check risk first (ADR-0013)
  if (risk.action === "BLOCK" || risk.action === "EXIT") {
    return { type: "NOOP" };
  }

  // 2. Analyze funding rate trend
  const history = analyzeFundingRateTrend(state.fundingHistory, config.trendWindow);

  // 3. Generate signals
  if (!state.position.open) {
    // No position: check for entry
    const entrySignal = generateEntrySignal(state.fundingRate, history, config);
    if (entrySignal && risk.action === "ALLOW") {
      // Calculate position size (helper function - see ADR-0013 for risk-based sizing)
      const maxPositionSizeQuote = risk.metrics.positionSizeUsd * 100n; // Convert to smallest quote unit
      return {
        type: "ENTER_HEDGE",
        params: {
          sizeQuote: maxPositionSizeQuote,
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

### Funding Rate Monitoring During Position

Monitor funding rate changes while position is open:

```typescript
export const monitorFundingRate = (
  position: Position,
  currentFundingRate: FundingRateSnapshot,
  config: StrategyConfig,
): { alert: boolean; message: string } => {
  // Check if predicted rate dropped significantly
  if (currentFundingRate.predictedRateBps < position.entryFundingRateBps / 2n) {
    return {
      alert: true,
      message: `Predicted funding rate dropped from ${position.entryFundingRateBps}bps to ${currentFundingRate.predictedRateBps}bps`,
    };
  }

  // Check if rate flipped negative
  if (currentFundingRate.predictedRateBps < 0n && position.entryFundingRateBps > 0n) {
    return {
      alert: true,
      message: `Funding rate flipped negative: ${currentFundingRate.predictedRateBps}bps`,
    };
  }

  return { alert: false, message: "" };
};
```

## Consequences

### Positive

1. **Alpha Generation**: Enters positions when funding rates are high and stable
2. **Early Exit**: Exits before funding rates drop significantly
3. **Trend Awareness**: Avoids positions during declining funding rate trends
4. **Regime Detection**: Adapts strategy based on funding rate volatility

### Negative

1. **Complexity**: Requires funding rate history and trend analysis
2. **False Signals**: May miss opportunities or exit too early
3. **Data Dependency**: Relies on exchange providing predicted funding rates

### Risks

| Risk | Mitigation |
|------|------------|
| Predicted rate incorrect | Use current rate as fallback, validate against historical accuracy |
| Trend analysis lag | Use shorter windows for faster detection, tune based on backtesting |
| Regime misclassification | Validate regime detection against historical performance |
| Exchange API changes | Version funding rate API calls, alert on schema changes |

## Future Considerations

1. **Machine Learning**: Train ML model to predict funding rate changes
2. **Cross-Exchange**: Compare funding rates across exchanges for arbitrage
3. **Funding Rate Forecasting**: Predict funding rates multiple periods ahead
4. **Market Regime Detection**: Incorporate broader market conditions (volatility, volume)

## Dependencies

No external dependencies. SMA and standard deviation are implemented as pure bigint functions
(see Helper Functions above). This avoids:
- A stale dependency (`technicalindicators` last published 2020)
- Lossy `bigint → number → bigint` conversion
- Pulling in 50+ unused indicators for two trivial calculations

If more advanced indicators (EMA, MACD, Bollinger Bands) are needed in the future, reassess
whether a library is warranted at that point.

## References

- [ADR-0001: Bot Architecture](0001-bot-architecture.md) — Evaluation loop
- [ADR-0012: State Machines](0012-state-machines.md) — Position lifecycle
- [ADR-0013: Risk Management Engine](0013-risk-management.md) — Risk assessment integration