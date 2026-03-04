# ADR 0013: Risk Management Engine

- **Status:** Accepted
- **Date:** 2026-02-04
- **Updated:** 2026-03-04
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

The caller constructs a `RiskSnapshot` from the actual state: equity and margin in quote units, optional position (side, notional, leverage, mark/liquidation price), daily PnL, and peak equity. See `domains/risk/types.ts` for the current interface.

**Design rationale:**
- `equityQuote` / `marginUsedQuote`: Derived from `Balance` data (sum of quote-denominated balances)
- `position`: Extracted from `Position` (adapter type), which already has `leverageBps`, `marginQuote`, `markPriceQuote`, `liquidationPriceQuote`
- `dailyPnlQuote` / `peakEquityQuote`: Tracked externally over time (not available from a single exchange snapshot)

### Risk Metrics Calculation

Compute metrics from snapshot: notional, leverage, margin utilization (reuse `calculateMarginUtilizationBps` from position/metrics), liquidation distance (reuse `calculateLiquidationDistanceBps`), daily PnL, drawdown from peak equity. See `domains/risk/evaluate/` and `domains/position/metrics/`.

### Risk Evaluation Flow

Use **monotonic escalation** (severity only increases across checks). Check order: (1) Hard limits (position size, leverage) → BLOCK; (2) Danger limits (daily loss, drawdown, liquidation buffer) → EXIT; (3) Warning limits (margin utilization) → PAUSE; (4) Soft limits (approaching any of the above) → CAUTION. See `domains/risk/evaluate/evaluate.ts` for current logic.

### Two-Phase Risk Check

Risk is evaluated **twice** per execution:

1. **At evaluation time** (ADR-0001): Determines if intent should be generated
2. **Right before sending orders**: Re-check risk; abort and alert if BLOCK or EXIT. See execution flow in source.

### Emergency Actions

An alert callback (e.g. `(action: EmergencyAction) => Promise<void>`) is used to notify on emergency. See `domains/risk/emergency/` for types.

#### Kill Switch

If risk level is `DANGER` or `BLOCKED`: (1) Exit all positions (reduce-only); (2) Stop accepting new intents; (3) Send critical alert; (4) Log emergency state. `checkEmergencyConditions(assessment)` returns `KILL_SWITCH` for BLOCKED/BLOCK or DANGER/EXIT, `REDUCE_ONLY` for PAUSE. See `domains/risk/emergency/`.

#### Reduce-Only Mode

When margin utilization is high but not critical:

1. **Allow exits** (close positions)
2. **Block entries** (no new positions)
3. **Continue monitoring** (wait for margin to free up)

### Position Sizing Logic

Max position size is the **minimum** of: (1) available capital (equity − margin used) × max leverage, and (2) config max position size in quote units. See `calculateMaxPositionSizeQuote` in `domains/risk/position-sizing/` (or equivalent).

### Liquidation Distance Calculation

**Reuses** `calculateLiquidationDistanceBps` from `src/domains/position/metrics.ts` (already implemented and tested). No duplicate implementation needed.

The existing function correctly handles both LONG and SHORT positions:
- **LONG**: Distance = `(markPrice - liquidationPrice) / markPrice` (liq is below mark)
- **SHORT**: Distance = `(liquidationPrice - markPrice) / markPrice` (liq is above mark)

## Implementation

### Risk Configuration Schema

Limits and warnings are configurable and validated (e.g. Valibot). Config includes quote decimals, hard limits (max position, leverage, daily loss, drawdown, liquidation buffer, margin utilization), and soft limits (warning thresholds). See `domains/risk/config.ts` for current schema and defaults.

### Pure Functions (No OOP Interface)

The risk engine is implemented as **pure functions**, not as a class or OOP interface. This follows the codebase's functional programming preference:

- `calculateRiskMetrics(snapshot)` — Compute metrics from state
- `evaluateRisk(snapshot, config)` — Evaluate risk level and action
- `calculateMaxPositionSizeQuote(equityQuote, marginUsedQuote, config)` — Position sizing
- `checkEmergencyConditions(assessment)` — Determine emergency action type
- `triggerKillSwitch(reason, onAlert)` — Execute kill switch with callback
- `enterReduceOnlyMode(reason, onAlert)` — Enter reduce-only mode with callback

### Integration with Strategy Engine

Strategy respects risk: if `risk.action` is BLOCK or EXIT, return NOOP; if PAUSE, allow only exits (EXIT_HEDGE if position open, else NOOP). See `domains/strategy/evaluate/` for current integration.

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
