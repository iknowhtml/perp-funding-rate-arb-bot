---
name: Risk Engine
overview: Implement comprehensive risk management engine with hard limits, soft limits, and emergency actions.
todos:
  - id: risk-types
    content: Define risk types, levels, and configuration schema
    status: pending
  - id: evaluate-risk
    content: Implement risk evaluation function
    status: pending
  - id: position-sizing
    content: Implement risk-based position sizing
    status: pending
  - id: liquidation-distance
    content: Implement liquidation distance calculation
    status: pending
  - id: emergency-actions
    content: Implement emergency exit and kill switch logic
    status: pending
  - id: tests
    content: Add unit tests for risk engine
    status: pending
  - id: lifecycle-management
    content: Move plan to implemented/ directory after completion (update todos, check validation boxes, update roadmap link, move file, delete from active/)
    status: pending
isProject: false
---

> **Note**: This plan is part of Phase 3 (Core Logic) in [MVP Roadmap](../README.md).

# Risk Engine

## Overview

Implement a comprehensive Risk Management Engine that evaluates risk before every trading decision and enforces hard limits. Risk management is the **most critical component** of a production trading system.

Reference: [ADR-0013: Risk Management Engine](../../../../../adrs/0013-risk-management.md)

## Tasks

### 1. Risk Types and Configuration

Create `src/domains/risk/types.ts`:

```typescript
export type RiskLevel = "SAFE" | "CAUTION" | "WARNING" | "DANGER" | "BLOCKED";

export interface RiskAssessment {
  level: RiskLevel;
  action: "ALLOW" | "PAUSE" | "EXIT" | "BLOCK";
  reasons: string[];
  metrics: RiskMetrics;
}

export interface RiskMetrics {
  positionSizeUsd: bigint;
  leverageBps: bigint;
  marginUtilizationBps: bigint;
  liquidationDistanceBps: bigint;
  dailyPnLCents: bigint;
  totalDrawdownBps: bigint;
}
```

Create `src/domains/risk/config.ts`:

```typescript
import * as v from "valibot";

export const RiskConfigSchema = v.object({
  // Hard limits
  maxPositionSizeUsd: v.pipe(v.number(), v.minValue(100), v.maxValue(1000000)),
  maxLeverageBps: v.pipe(v.number(), v.minValue(10000), v.maxValue(100000)), // 1x to 10x
  maxDailyLossCents: v.pipe(v.number(), v.minValue(0)),
  maxDrawdownBps: v.pipe(v.number(), v.minValue(0), v.maxValue(5000)), // 0% to 50%
  minLiquidationBufferBps: v.pipe(v.number(), v.minValue(1000), v.maxValue(5000)), // 10% to 50%
  maxMarginUtilizationBps: v.pipe(v.number(), v.minValue(5000), v.maxValue(9500)), // 50% to 95%

  // Soft limits (warnings)
  warningPositionSizeUsd: v.pipe(v.number(), v.minValue(100)),
  warningMarginUtilizationBps: v.pipe(v.number(), v.minValue(5000), v.maxValue(9000)),
  warningLiquidationBufferBps: v.pipe(v.number(), v.minValue(2000), v.maxValue(4000)),
});

export type RiskConfig = v.InferOutput<typeof RiskConfigSchema>;

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  maxPositionSizeUsd: 10000,
  maxLeverageBps: 30000, // 3x
  maxDailyLossCents: 50000, // $500
  maxDrawdownBps: 1000, // 10%
  minLiquidationBufferBps: 2000, // 20%
  maxMarginUtilizationBps: 8000, // 80%
  warningPositionSizeUsd: 7500,
  warningMarginUtilizationBps: 7000,
  warningLiquidationBufferBps: 3000,
};
```

### 2. Risk Evaluation Function

Create `src/domains/risk/evaluate.ts`:

```typescript
export const calculateRiskMetrics = (state: BotState): RiskMetrics => {
  const positionSizeUsd = state.position?.sizeCents 
    ? state.position.sizeCents / 100n 
    : 0n;
  
  const leverageBps = state.position
    ? (state.position.sizeCents * 10000n) / (state.account.equityCents || 1n)
    : 0n;
  
  const marginUtilizationBps = state.account.equityCents > 0n
    ? (state.account.marginUsedCents * 10000n) / state.account.equityCents
    : 0n;
  
  const liquidationDistanceBps = calculateLiquidationDistance(
    state.position,
    state.market.markPrice,
    state.market.liquidationPrice,
  );

  return {
    positionSizeUsd,
    leverageBps,
    marginUtilizationBps,
    liquidationDistanceBps,
    dailyPnLCents: state.account.dailyPnLCents ?? 0n,
    totalDrawdownBps: state.account.totalDrawdownBps ?? 0n,
  };
};

export const evaluateRisk = (
  state: BotState,
  config: RiskConfig,
): RiskAssessment => {
  const metrics = calculateRiskMetrics(state);
  const reasons: string[] = [];
  let level: RiskLevel = "SAFE";
  let action: "ALLOW" | "PAUSE" | "EXIT" | "BLOCK" = "ALLOW";

  // Check hard limits (BLOCK if exceeded)
  // Check liquidation buffer (EXIT if too close)
  // Check margin utilization (PAUSE if high)
  // Check soft limits (warnings)

  return { level, action, reasons, metrics };
};
```

### 3. Position Sizing

```typescript
export const calculateMaxPositionSize = (
  state: BotState,
  config: RiskConfig,
): bigint => {
  const availableCapital = state.account.equityCents - state.account.marginUsedCents;
  const maxLeverageBps = BigInt(config.maxLeverageBps);
  const maxByCapital = (availableCapital * maxLeverageBps) / 10000n;
  const maxByLimit = BigInt(config.maxPositionSizeUsd) * 100n;

  return maxByCapital < maxByLimit ? maxByCapital : maxByLimit;
};
```

### 4. Liquidation Distance

```typescript
export const calculateLiquidationDistance = (
  position: Position | null,
  markPrice: bigint,
  liquidationPrice: bigint | null,
): bigint => {
  if (!position || !liquidationPrice || liquidationPrice === 0n) {
    return 10000n; // 100% buffer if no position
  }

  return position.side === "SHORT"
    ? ((markPrice - liquidationPrice) * 10000n) / markPrice
    : ((liquidationPrice - markPrice) * 10000n) / markPrice;
};
```

### 5. Emergency Actions

Create `src/domains/risk/emergency.ts`:

```typescript
export interface EmergencyAction {
  type: "KILL_SWITCH" | "REDUCE_ONLY" | "ALERT";
  reason: string;
  timestamp: Date;
}

export const triggerKillSwitch = async (
  reason: string,
  alertService: AlertService,
): Promise<EmergencyAction> => {
  await alertService.sendCritical({
    type: "KILL_SWITCH_TRIGGERED",
    reason,
    timestamp: new Date(),
  });

  return {
    type: "KILL_SWITCH",
    reason,
    timestamp: new Date(),
  };
};

export const enterReduceOnlyMode = async (
  reason: string,
  alertService: AlertService,
): Promise<EmergencyAction> => {
  await alertService.sendWarning({
    type: "REDUCE_ONLY_MODE",
    reason,
    timestamp: new Date(),
  });

  return {
    type: "REDUCE_ONLY",
    reason,
    timestamp: new Date(),
  };
};
```

## File Structure

```
src/domains/risk/
├── types.ts              # Risk type definitions
├── config.ts             # Risk configuration schema
├── evaluate.ts           # Risk evaluation logic
├── evaluate.test.ts      # Evaluation tests
├── position-sizing.ts    # Position sizing logic
├── position-sizing.test.ts
├── liquidation.ts        # Liquidation calculations
├── liquidation.test.ts
├── emergency.ts          # Emergency action logic
├── emergency.test.ts
└── index.ts              # Re-exports
```

## Dependencies

No new dependencies required.

## Validation

- [ ] Hard limits block unsafe trades
- [ ] Soft limits generate warnings
- [ ] Position sizing respects leverage limits
- [ ] Liquidation distance calculated correctly
- [ ] Kill switch triggers on critical conditions
- [ ] Reduce-only mode works correctly
- [ ] Unit tests pass

## References

- [MVP Roadmap](../README.md)
- [ADR-0013: Risk Management Engine](../../../../../adrs/0013-risk-management.md)
- [ADR-0001: Bot Architecture](../../../../../adrs/0001-bot-architecture.md) — Two-phase risk check
