# ADR 0013: Risk Management Engine

- **Status:** Accepted
- **Date:** 2026-02-04
- **Updated:** 2026-02-09
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

export type RiskAction = "ALLOW" | "PAUSE" | "EXIT" | "BLOCK";

export interface RiskAssessment {
  level: RiskLevel;
  action: RiskAction;
  reasons: string[];
  metrics: RiskMetrics;
}

export interface RiskMetrics {
  notionalQuote: bigint;
  leverageBps: bigint;
  marginUtilizationBps: bigint;
  liquidationDistanceBps: bigint;
  dailyPnlQuote: bigint;
  drawdownBps: bigint;
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

### Risk Snapshot (Input Type)

The risk engine operates on a purpose-built `RiskSnapshot`, **not** the worker's `BotState` directly. This keeps the risk engine pure, testable, and decoupled from the state store implementation.

The caller constructs a `RiskSnapshot` from the actual `BotState`, `Position`, and `Balance` data.

```typescript
/**
 * Input snapshot for risk evaluation.
 *
 * Uses *Quote suffix for amounts in quote currency smallest units,
 * matching the codebase convention from src/adapters/types.ts.
 */
export interface RiskSnapshot {
  equityQuote: bigint;
  marginUsedQuote: bigint;
  position: {
    side: "LONG" | "SHORT";
    notionalQuote: bigint;
    leverageBps: bigint;
    markPriceQuote: bigint;
    liquidationPriceQuote: bigint | null;
  } | null;
  dailyPnlQuote: bigint;
  peakEquityQuote: bigint;
}
```

**Design rationale:**
- `equityQuote` / `marginUsedQuote`: Derived from `Balance` data (sum of quote-denominated balances)
- `position`: Extracted from `Position` (adapter type), which already has `leverageBps`, `marginQuote`, `markPriceQuote`, `liquidationPriceQuote`
- `dailyPnlQuote` / `peakEquityQuote`: Tracked externally over time (not available from a single exchange snapshot)

### Risk Metrics Calculation

Reuses existing pure functions from `src/domains/position/metrics.ts`:
- `calculateMarginUtilizationBps(marginUsedQuote, equityQuote)`
- `calculateLiquidationDistanceBps(markPriceQuote, liquidationPriceQuote, side)`

```typescript
const BPS_PER_UNIT = 10000n;

export const calculateRiskMetrics = (snapshot: RiskSnapshot): RiskMetrics => {
  const notionalQuote = snapshot.position?.notionalQuote ?? 0n;
  const leverageBps = snapshot.position?.leverageBps ?? 0n;

  const marginUtilizationBps = calculateMarginUtilizationBps(
    snapshot.marginUsedQuote,
    snapshot.equityQuote,
  );

  const liquidationDistanceBps = snapshot.position
    ? calculateLiquidationDistanceBps(
        snapshot.position.markPriceQuote,
        snapshot.position.liquidationPriceQuote,
        snapshot.position.side,
      )
    : BPS_PER_UNIT; // 100% buffer if no position

  const drawdownBps = snapshot.peakEquityQuote > 0n
    ? ((snapshot.peakEquityQuote - snapshot.equityQuote) * BPS_PER_UNIT)
        / snapshot.peakEquityQuote
    : 0n;

  return {
    notionalQuote,
    leverageBps,
    marginUtilizationBps,
    liquidationDistanceBps,
    dailyPnlQuote: snapshot.dailyPnlQuote,
    drawdownBps,
  };
};
```

### Risk Evaluation Flow

Uses monotonic escalation helpers to prevent accidentally downgrading severity:

```typescript
export const escalateRiskLevel = (
  current: RiskLevel,
  next: RiskLevel,
): RiskLevel =>
  RISK_LEVEL_SEVERITY[next] > RISK_LEVEL_SEVERITY[current] ? next : current;

export const escalateRiskAction = (
  current: RiskAction,
  next: RiskAction,
): RiskAction =>
  RISK_ACTION_SEVERITY[next] > RISK_ACTION_SEVERITY[current] ? next : current;

export const evaluateRisk = (
  snapshot: RiskSnapshot,
  config: RiskConfig,
): RiskAssessment => {
  const metrics = calculateRiskMetrics(snapshot);
  const reasons: string[] = [];
  let level: RiskLevel = "SAFE";
  let action: RiskAction = "ALLOW";

  // Convert config USD values to quote units
  const quoteScale = 10n ** BigInt(config.quoteDecimals);
  const maxPositionSizeQuote = BigInt(config.maxPositionSizeUsd) * quoteScale;
  const maxLeverageBps = BigInt(config.maxLeverageBps);
  const maxDailyLossQuote = BigInt(config.maxDailyLossUsd) * quoteScale;
  const maxDrawdownBps = BigInt(config.maxDrawdownBps);
  const minLiquidationBufferBps = BigInt(config.minLiquidationBufferBps);
  const maxMarginUtilizationBps = BigInt(config.maxMarginUtilizationBps);
  const warningPositionSizeQuote = BigInt(config.warningPositionSizeUsd) * quoteScale;
  const warningMarginUtilizationBps = BigInt(config.warningMarginUtilizationBps);
  const warningLiquidationBufferBps = BigInt(config.warningLiquidationBufferBps);

  // 1. Check hard limits (BLOCK if exceeded)
  if (metrics.notionalQuote > maxPositionSizeQuote) {
    reasons.push("Position size exceeds maximum");
    level = escalateRiskLevel(level, "BLOCKED");
    action = escalateRiskAction(action, "BLOCK");
  }

  if (metrics.leverageBps > maxLeverageBps) {
    reasons.push("Leverage exceeds maximum");
    level = escalateRiskLevel(level, "BLOCKED");
    action = escalateRiskAction(action, "BLOCK");
  }

  // 2. Check danger limits (EXIT)
  if (metrics.dailyPnlQuote < -maxDailyLossQuote) {
    reasons.push("Daily loss exceeds maximum");
    level = escalateRiskLevel(level, "DANGER");
    action = escalateRiskAction(action, "EXIT");
  }

  if (metrics.drawdownBps > maxDrawdownBps) {
    reasons.push("Drawdown exceeds maximum");
    level = escalateRiskLevel(level, "DANGER");
    action = escalateRiskAction(action, "EXIT");
  }

  if (metrics.liquidationDistanceBps < minLiquidationBufferBps) {
    reasons.push("Liquidation buffer below minimum");
    level = escalateRiskLevel(level, "DANGER");
    action = escalateRiskAction(action, "EXIT");
  }

  // 3. Check warning limits (PAUSE)
  if (metrics.marginUtilizationBps > maxMarginUtilizationBps) {
    reasons.push("Margin utilization exceeds maximum");
    level = escalateRiskLevel(level, "WARNING");
    action = escalateRiskAction(action, "PAUSE");
  }

  // 4. Check soft limits (CAUTION)
  if (metrics.notionalQuote > warningPositionSizeQuote) {
    reasons.push("Position size approaching limit");
    level = escalateRiskLevel(level, "CAUTION");
  }

  if (metrics.marginUtilizationBps > warningMarginUtilizationBps) {
    reasons.push("Margin utilization approaching limit");
    level = escalateRiskLevel(level, "CAUTION");
  }

  if (metrics.liquidationDistanceBps < warningLiquidationBufferBps) {
    reasons.push("Liquidation buffer approaching minimum");
    level = escalateRiskLevel(level, "CAUTION");
  }

  return { level, action, reasons, metrics };
};
```

### Two-Phase Risk Check

Risk is evaluated **twice** per execution:

1. **At evaluation time** (ADR-0001): Determines if intent should be generated
2. **Right before sending orders**: Re-checks because state changes between decision and action

```typescript
const executeEnterHedge = async (sizeQuote: bigint) => {
  // Re-check risk immediately before execution
  const risk = evaluateRisk(snapshot, config);
  if (risk.action === "BLOCK" || risk.action === "EXIT") {
    await onAlert({
      type: "ALERT",
      reason: risk.reasons.join(", "),
      timestamp: new Date(),
    });
    return { aborted: true, reason: risk.reasons };
  }

  // Proceed with execution...
};
```

### Emergency Actions

Uses a simple `AlertCallback` function type (no full AlertService exists yet):

```typescript
export type AlertCallback = (action: EmergencyAction) => Promise<void>;
```

#### Kill Switch

If risk level is `DANGER` or `BLOCKED`:

1. **Immediately exit all positions** (reduce-only orders)
2. **Stop accepting new intents** (pause evaluation loop)
3. **Send critical alert** via callback
4. **Log emergency state** to audit log

```typescript
export const checkEmergencyConditions = (
  assessment: RiskAssessment,
): EmergencyActionType | null => {
  if (assessment.level === "BLOCKED" || assessment.action === "BLOCK") {
    return "KILL_SWITCH";
  }
  if (assessment.level === "DANGER" || assessment.action === "EXIT") {
    return "KILL_SWITCH";
  }
  if (assessment.action === "PAUSE") {
    return "REDUCE_ONLY";
  }
  return null;
};
```

#### Reduce-Only Mode

When margin utilization is high but not critical:

1. **Allow exits** (close positions)
2. **Block entries** (no new positions)
3. **Continue monitoring** (wait for margin to free up)

### Position Sizing Logic

Position size is calculated based on:

1. **Available capital** (equity - margin used)
2. **Risk limits** (max position size, max leverage)

```typescript
const BPS_PER_UNIT = 10000n;

export const calculateMaxPositionSizeQuote = (
  equityQuote: bigint,
  marginUsedQuote: bigint,
  config: RiskConfig,
): bigint => {
  const availableCapitalQuote = equityQuote - marginUsedQuote;
  if (availableCapitalQuote <= 0n) return 0n;

  const maxLeverageBps = BigInt(config.maxLeverageBps);
  const maxByCapitalQuote = (availableCapitalQuote * maxLeverageBps) / BPS_PER_UNIT;

  const quoteScale = 10n ** BigInt(config.quoteDecimals);
  const maxByLimitQuote = BigInt(config.maxPositionSizeUsd) * quoteScale;

  return maxByCapitalQuote < maxByLimitQuote ? maxByCapitalQuote : maxByLimitQuote;
};
```

### Liquidation Distance Calculation

**Reuses** `calculateLiquidationDistanceBps` from `src/domains/position/metrics.ts` (already implemented and tested). No duplicate implementation needed.

The existing function correctly handles both LONG and SHORT positions:
- **LONG**: Distance = `(markPrice - liquidationPrice) / markPrice` (liq is below mark)
- **SHORT**: Distance = `(liquidationPrice - markPrice) / markPrice` (liq is above mark)

## Implementation

### Risk Configuration Schema

```typescript
import * as v from "valibot";

export const RiskConfigSchema = v.object({
  quoteDecimals: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(18)),

  // Hard limits (amounts in USD display units)
  maxPositionSizeUsd: v.pipe(v.number(), v.minValue(100), v.maxValue(1_000_000)),
  maxLeverageBps: v.pipe(v.number(), v.minValue(10000), v.maxValue(100000)),
  maxDailyLossUsd: v.pipe(v.number(), v.minValue(0)),
  maxDrawdownBps: v.pipe(v.number(), v.minValue(0), v.maxValue(5000)),
  minLiquidationBufferBps: v.pipe(v.number(), v.minValue(1000), v.maxValue(5000)),
  maxMarginUtilizationBps: v.pipe(v.number(), v.minValue(5000), v.maxValue(9500)),

  // Soft limits (warnings)
  warningPositionSizeUsd: v.pipe(v.number(), v.minValue(100)),
  warningMarginUtilizationBps: v.pipe(v.number(), v.minValue(5000), v.maxValue(9000)),
  warningLiquidationBufferBps: v.pipe(v.number(), v.minValue(2000), v.maxValue(4000)),
});

export type RiskConfig = v.InferOutput<typeof RiskConfigSchema>;

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  quoteDecimals: 6,              // USDC (6 decimals)
  maxPositionSizeUsd: 10000,     // $10,000
  maxLeverageBps: 30000,         // 3x
  maxDailyLossUsd: 500,          // $500
  maxDrawdownBps: 1000,          // 10%
  minLiquidationBufferBps: 2000, // 20%
  maxMarginUtilizationBps: 8000, // 80%
  warningPositionSizeUsd: 7500,  // $7,500
  warningMarginUtilizationBps: 7000, // 70%
  warningLiquidationBufferBps: 3000, // 30%
};
```

### Pure Functions (No OOP Interface)

The risk engine is implemented as **pure functions**, not as a class or OOP interface. This follows the codebase's functional programming preference:

- `calculateRiskMetrics(snapshot)` — Compute metrics from state
- `evaluateRisk(snapshot, config)` — Evaluate risk level and action
- `calculateMaxPositionSizeQuote(equityQuote, marginUsedQuote, config)` — Position sizing
- `checkEmergencyConditions(assessment)` — Determine emergency action type
- `triggerKillSwitch(reason, onAlert)` — Execute kill switch with callback
- `enterReduceOnlyMode(reason, onAlert)` — Enter reduce-only mode with callback

### Integration with Strategy Engine

```typescript
// Trading intent type (referenced in ADR-0001: Bot Architecture)
export type TradingIntent =
  | { type: "NOOP" }
  | { type: "ENTER_HEDGE"; params: { sizeQuote: bigint } }
  | { type: "EXIT_HEDGE"; reason: string };

export const evaluateStrategy = (
  state: MarketState,
  risk: RiskAssessment,
  config: StrategyConfig,
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
