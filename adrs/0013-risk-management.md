# ADR 0013: Risk Management Engine

- **Status:** Accepted
- **Date:** 2026-02-04
- **Owners:** -
- **Related:**
  - [ADR-0001: Bot Architecture](0001-bot-architecture.md)
  - [ADR-0012: State Machines](0012-state-machines.md)
  - [ADR-0010: Exchange Adapters](0010-exchange-adapters.md)

## Context

A trading bot managing real capital requires **hard safety rails** to prevent catastrophic losses. Without formal risk management:

- Position sizes can grow unbounded
- Leverage can exceed safe limits
- Drawdowns can accumulate without circuit breakers
- Margin calls can trigger liquidations
- Funding rate flips can turn profitable positions into losses

Risk management is not optional—it is the **most critical component** of a production trading system.

## Decision

**Implement a comprehensive Risk Management Engine** that evaluates risk before every trading decision and enforces hard limits.

### Risk Assessment Levels

```typescript
export type RiskLevel = "SAFE" | "CAUTION" | "WARNING" | "DANGER" | "BLOCKED";

export interface RiskAssessment {
  level: RiskLevel;
  action: "ALLOW" | "PAUSE" | "EXIT" | "BLOCK";
  reasons: string[];
  metrics: {
    positionSizeUsd: bigint;
    leverageBps: bigint;
    marginUtilizationBps: bigint;
    liquidationDistanceBps: bigint;
    dailyPnLCents: bigint;
    totalDrawdownBps: bigint;
  };
}
```

### Hard Limits (Cannot Be Exceeded)

| Limit | Default | Purpose |
|-------|---------|---------|
| **Max Position Size** | $10,000 USD | Prevent over-concentration |
| **Max Leverage** | 3x (30,000 bps) | Limit margin risk |
| **Max Daily Loss** | -$500 USD | Stop trading after bad day |
| **Max Total Drawdown** | -10% (-1000 bps) | Preserve capital |
| **Min Liquidation Buffer** | 20% (2000 bps) | Prevent liquidation risk |
| **Max Margin Utilization** | 80% (8000 bps) | Reserve margin for volatility |

### Soft Limits (Warnings Only)

| Limit | Default | Purpose |
|-------|---------|---------|
| **Warning Position Size** | $7,500 USD | Alert before hard limit |
| **Warning Margin Utilization** | 70% (7000 bps) | Alert before margin call risk |
| **Warning Liquidation Buffer** | 30% (3000 bps) | Alert before liquidation risk |

### Margin Mode: Isolated Margin

**Use Isolated Margin for MVP** (safer than Cross Margin):

- Position risk is isolated to allocated margin
- Liquidation of one position doesn't affect others
- Easier to reason about risk per position
- Can upgrade to Cross Margin later if needed

### Type Definitions

```typescript
// Bot state type (referenced in ADR-0001: Bot Architecture)
export interface BotState {
  account: {
    equityCents: bigint;
    marginUsedCents: bigint;
    dailyPnLCents?: bigint;
    totalDrawdownBps?: bigint;
  };
  position: Position | null;
  market: {
    markPrice: bigint;
    liquidationPrice?: bigint;
  };
}

// Position type (referenced in ADR-0012: State Machines)
export interface Position {
  sizeCents: bigint;
  side: "LONG" | "SHORT";
  entryTime?: Date;
  entryFundingRateBps?: bigint;
}
```

### Helper Functions

```typescript
// Calculate risk metrics from bot state
export const calculateRiskMetrics = (state: BotState): RiskAssessment["metrics"] => {
  const positionSizeUsd = state.position?.sizeCents ? state.position.sizeCents / 100n : 0n;
  const leverageBps = state.position
    ? (state.position.sizeCents * 10000n) / (state.account.equityCents || 1n)
    : 0n;
  const marginUtilizationBps = state.account.equityCents > 0n
    ? (state.account.marginUsedCents * 10000n) / state.account.equityCents
    : 0n;
  const liquidationDistanceBps = state.position && state.market.liquidationPrice
    ? calculateLiquidationDistance(state.position, state.market.markPrice, state.market.liquidationPrice)
    : 10000n; // 100% buffer if no position

  return {
    positionSizeUsd,
    leverageBps,
    marginUtilizationBps,
    liquidationDistanceBps,
    dailyPnLCents: state.account.dailyPnLCents ?? 0n,
    totalDrawdownBps: state.account.totalDrawdownBps ?? 0n,
  };
};
```

### Risk Evaluation Flow

```typescript
export const evaluateRisk = (
  state: BotState,
  config: RiskConfig,
): RiskAssessment => {
  const metrics = calculateRiskMetrics(state);
  const reasons: string[] = [];
  let level: RiskLevel = "SAFE";
  let action: "ALLOW" | "PAUSE" | "EXIT" | "BLOCK" = "ALLOW";

  // Convert config values to bigint for comparison
  const maxPositionSizeUsdCents = BigInt(config.maxPositionSizeUsd) * 100n;
  const maxLeverageBps = BigInt(config.maxLeverageBps);
  const maxDailyLossCents = BigInt(Math.abs(config.maxDailyLossCents));
  const maxDrawdownBps = BigInt(config.maxDrawdownBps);
  const minLiquidationBufferBps = BigInt(config.minLiquidationBufferBps);
  const maxMarginUtilizationBps = BigInt(config.maxMarginUtilizationBps);
  const warningPositionSizeUsdCents = BigInt(config.warningPositionSizeUsd) * 100n;
  const warningMarginUtilizationBps = BigInt(config.warningMarginUtilizationBps);
  const warningLiquidationBufferBps = BigInt(config.warningLiquidationBufferBps);

  // 1. Check hard limits (BLOCK if exceeded)
  if (metrics.positionSizeUsd > maxPositionSizeUsdCents) {
    reasons.push(`Position size ${metrics.positionSizeUsd} exceeds max ${maxPositionSizeUsdCents}`);
    level = "BLOCKED";
    action = "BLOCK";
  }

  if (metrics.leverageBps > maxLeverageBps) {
    reasons.push(`Leverage ${metrics.leverageBps}bps exceeds max ${maxLeverageBps}bps`);
    level = "BLOCKED";
    action = "BLOCK";
  }

  if (metrics.dailyPnLCents < -maxDailyLossCents) {
    reasons.push(`Daily P&L ${metrics.dailyPnLCents} exceeds max loss ${-maxDailyLossCents}`);
    level = "DANGER";
    action = "EXIT";
  }

  if (metrics.totalDrawdownBps < -maxDrawdownBps) {
    reasons.push(`Total drawdown ${metrics.totalDrawdownBps}bps exceeds max ${-maxDrawdownBps}bps`);
    level = "DANGER";
    action = "EXIT";
  }

  // 2. Check liquidation buffer (EXIT if too close)
  if (metrics.liquidationDistanceBps < minLiquidationBufferBps) {
    reasons.push(`Liquidation buffer ${metrics.liquidationDistanceBps}bps below min ${minLiquidationBufferBps}bps`);
    level = "DANGER";
    action = "EXIT";
  }

  // 3. Check margin utilization (PAUSE if high)
  if (metrics.marginUtilizationBps > maxMarginUtilizationBps) {
    reasons.push(`Margin utilization ${metrics.marginUtilizationBps}bps exceeds max ${maxMarginUtilizationBps}bps`);
    level = level === "SAFE" ? "WARNING" : level;
    action = action === "ALLOW" ? "PAUSE" : action;
  }

  // 4. Check soft limits (warnings)
  if (metrics.positionSizeUsd > warningPositionSizeUsdCents) {
    reasons.push(`Position size approaching limit`);
    level = level === "SAFE" ? "CAUTION" : level;
  }

  if (metrics.marginUtilizationBps > warningMarginUtilizationBps) {
    reasons.push(`Margin utilization approaching limit`);
    level = level === "SAFE" ? "CAUTION" : level;
  }

  return { level, action, reasons, metrics };
};
```

### Two-Phase Risk Check

Risk is evaluated **twice** per execution:

1. **At evaluation time** (ADR-0001): Determines if intent should be generated
2. **Right before sending orders**: Re-checks because state changes between decision and action

```typescript
const executeEnterHedge = async (sizeCents: bigint) => {
  // Re-check risk immediately before execution
  const risk = evaluateRisk(state, config);
  if (risk.action === "BLOCK" || risk.action === "EXIT") {
    await alertService.send({
      type: "EXECUTION_BLOCKED",
      reason: risk.reasons.join(", "),
    });
    return { aborted: true, reason: risk.reasons };
  }

  // Proceed with execution...
};
```

### Emergency Actions

#### Kill Switch

If risk level is `DANGER` or `BLOCKED`:

1. **Immediately exit all positions** (reduce-only orders)
2. **Stop accepting new intents** (pause evaluation loop)
3. **Send critical alert** (Discord + Telegram)
4. **Log emergency state** to audit log

#### Reduce-Only Mode

When margin utilization is high but not critical:

1. **Allow exits** (close positions)
2. **Block entries** (no new positions)
3. **Continue monitoring** (wait for margin to free up)

### Position Sizing Logic

Position size is calculated based on:

1. **Available capital** (equity - margin used)
2. **Risk limits** (max position size, max leverage)
3. **Liquidity** (order book depth for slippage estimation)

```typescript
export const calculateMaxPositionSize = (
  state: BotState,
  config: RiskConfig,
): bigint => {
  const availableCapital = state.account.equityCents - state.account.marginUsedCents;
  const maxLeverageBps = BigInt(config.maxLeverageBps);
  const maxByCapital = (availableCapital * maxLeverageBps) / 10000n;
  const maxByLimit = BigInt(config.maxPositionSizeUsd) * 100n; // Convert to cents

  return maxByCapital < maxByLimit ? maxByCapital : maxByLimit;
};
```

### Liquidation Distance Calculation

```typescript
export const calculateLiquidationDistance = (
  position: Position,
  markPrice: bigint,
  liquidationPrice: bigint,
): bigint => {
  if (!liquidationPrice || liquidationPrice === 0n) {
    return 10000n; // 100% buffer if no liquidation price (shouldn't happen)
  }

  const distanceBps = position.side === "SHORT"
    ? ((markPrice - liquidationPrice) * 10000n) / markPrice
    : ((liquidationPrice - markPrice) * 10000n) / markPrice;

  return distanceBps;
};
```

## Implementation

### Risk Configuration Schema

```typescript
import * as v from "valibot";

export const RiskConfigSchema = v.object({
  // Hard limits
  maxPositionSizeUsd: v.pipe(v.number(), v.minValue(100), v.maxValue(1000000)),
  maxLeverageBps: v.pipe(v.number(), v.minValue(10000), v.maxValue(100000)), // 1x to 10x
  maxDailyLossCents: v.pipe(v.number(), v.minValue(0), v.transform((v) => -Math.abs(v))), // Negative
  maxDrawdownBps: v.pipe(v.number(), v.minValue(0), v.maxValue(5000)), // 0% to 50%
  minLiquidationBufferBps: v.pipe(v.number(), v.minValue(1000), v.maxValue(5000)), // 10% to 50%
  maxMarginUtilizationBps: v.pipe(v.number(), v.minValue(5000), v.maxValue(9500)), // 50% to 95%

  // Soft limits (warnings)
  warningPositionSizeUsd: v.pipe(v.number(), v.minValue(100)),
  warningMarginUtilizationBps: v.pipe(v.number(), v.minValue(5000), v.maxValue(9000)),
  warningLiquidationBufferBps: v.pipe(v.number(), v.minValue(2000), v.maxValue(4000)),
});

export type RiskConfig = v.InferOutput<typeof RiskConfigSchema>;
```

### Risk Engine Interface

```typescript
export interface RiskEngine {
  evaluate(state: BotState, config: RiskConfig): RiskAssessment;
  calculateMaxPositionSize(state: BotState, config: RiskConfig): bigint;
  calculateLiquidationDistance(position: Position, markPrice: bigint, liquidationPrice: bigint): bigint;
}
```

### Integration with Strategy Engine

```typescript
// src/domains/strategy/strategy.ts

// Trading intent type (referenced in ADR-0001: Bot Architecture)
export type TradingIntent =
  | { type: "NOOP" }
  | { type: "ENTER_HEDGE"; params: { sizeCents: bigint } }
  | { type: "EXIT_HEDGE"; reason: string };

export interface MarketState {
  position: { open: boolean } | null;
  fundingRate: FundingRateSnapshot; // Defined in ADR-0014
  fundingHistory: FundingRateSnapshot[]; // Defined in ADR-0014
}

export const evaluateStrategy = (
  state: MarketState,
  risk: RiskAssessment, // Risk already evaluated
  config: StrategyConfig, // Defined in ADR-0014
): TradingIntent => {
  // Strategy respects risk assessment
  if (risk.action === "BLOCK" || risk.action === "EXIT") {
    return { type: "NOOP" };
  }

  if (risk.action === "PAUSE") {
    // Only allow exits, not entries
    if (state.position?.open) {
      return { type: "EXIT_HEDGE", reason: "risk_pause" };
    }
    return { type: "NOOP" };
  }

  // Normal strategy logic...
};
```

## Consequences

### Positive

1. **Capital Preservation**: Hard limits prevent catastrophic losses
2. **Early Warning**: Soft limits alert before hitting hard limits
3. **Deterministic**: Same state always produces same risk assessment
4. **Auditable**: All risk evaluations logged for post-mortem analysis
5. **Testable**: Pure functions, easily unit tested

### Negative

1. **Conservative**: May miss opportunities when limits are hit
2. **Configuration Overhead**: Requires tuning limits for each capital level
3. **False Positives**: May trigger exits during temporary volatility spikes

### Risks

| Risk | Mitigation |
|------|------------|
| Limits too tight | Start conservative, relax based on performance data |
| Limits too loose | Start with industry-standard defaults, tighten based on drawdowns |
| Liquidation price incorrect | Validate against exchange API, add safety buffer |
| Margin calculation drift | Reconcile margin calculations with exchange REST API |

## Future Considerations

1. **Dynamic Limits**: Adjust limits based on volatility (VIX-like indicator)
2. **Portfolio Risk**: When supporting multiple positions, add portfolio-level risk limits
3. **Stress Testing**: Simulate extreme market moves to validate liquidation buffers
4. **Risk Attribution**: Track which risk checks triggered most often for optimization

## References

- [ADR-0001: Bot Architecture](0001-bot-architecture.md) — Two-phase risk check
- [ADR-0012: State Machines](0012-state-machines.md) — Position state transitions
- [ADR-0010: Exchange Adapters](0010-exchange-adapters.md) — Margin and liquidation price APIs
