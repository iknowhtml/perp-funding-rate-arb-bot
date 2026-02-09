---
name: Risk Engine
overview: Implement comprehensive risk management engine with hard limits, soft limits, and emergency actions.
todos:
  - id: update-adr-and-plan
    content: "Update ADR-0013 and roadmap plan to reconcile with codebase conventions"
    status: completed
  - id: risk-types
    content: Define risk types, levels, and configuration schema
    status: completed
  - id: evaluate-risk
    content: Implement risk evaluation function
    status: completed
  - id: position-sizing
    content: Implement risk-based position sizing
    status: completed
  - id: liquidation-distance
    content: Wire existing liquidation distance calculation into risk evaluation
    status: completed
  - id: emergency-actions
    content: Implement emergency exit and kill switch logic
    status: completed
  - id: tests
    content: Add unit tests for risk engine
    status: completed
  - id: index-exports
    content: Create index.ts re-exporting public API
    status: completed
  - id: lifecycle-management
    content: Move plan to implemented/ directory after completion (update todos, check validation boxes, update roadmap link, move file, delete from active/)
    status: completed
isProject: false
---

> **Note**: This plan is part of Phase 3 (Core Logic) in [MVP Roadmap](../../active/0001-mvp-roadmap/README.md).

# Risk Engine

## Overview

Implement a comprehensive Risk Management Engine that evaluates risk before every trading decision and enforces hard limits. Risk management is the **most critical component** of a production trading system.

Reference: [ADR-0013: Risk Management Engine](../../../../../adrs/0013-risk-management.md)

## Tasks

### 0. Update ADR and Plan

Update ADR-0013 and this plan to reconcile with codebase conventions:

- `*Quote` not `*Cents` for financial amounts (matching `src/adapters/types.ts`)
- `RiskSnapshot` not `BotState` (purpose-built input, decoupled from worker state)
- Reuse `calculateLiquidationDistanceBps` and `calculateMarginUtilizationBps` from `src/domains/position/metrics.ts`
- `AlertCallback` not `AlertService` (simple function type, no full service exists)
- Fix SHORT liquidation formula bug (was inverted)
- Add `quoteDecimals` to config for USD-to-quote conversion
- Use `escalateRiskLevel`/`escalateRiskAction` for monotonic severity escalation
- Pure functions, not OOP `RiskEngine` interface

### 1. Risk Types and Configuration

Create `src/domains/risk/types.ts` and `src/domains/risk/config.ts`.

### 2. Risk Evaluation Function

Create `src/domains/risk/evaluate.ts` with `calculateRiskMetrics` and `evaluateRisk`.

### 3. Position Sizing

Create `src/domains/risk/position-sizing.ts` with `calculateMaxPositionSizeQuote`.

### 4. Liquidation Distance

Reuses `calculateLiquidationDistanceBps` from `src/domains/position/metrics.ts` -- no new calculation needed.

### 5. Emergency Actions

Create `src/domains/risk/emergency.ts` with `triggerKillSwitch`, `enterReduceOnlyMode`, `checkEmergencyConditions`.

## File Structure

```
src/domains/risk/
├── types.ts               # Risk type definitions, Valibot schemas, type guards
├── config.ts              # Risk configuration schema and defaults
├── evaluate.ts            # Risk evaluation logic (reuses position/metrics.ts)
├── evaluate.test.ts       # Evaluation tests (20 tests)
├── position-sizing.ts     # Position sizing logic
├── position-sizing.test.ts # Position sizing tests (7 tests)
├── emergency.ts           # Emergency action logic
├── emergency.test.ts      # Emergency tests (11 tests)
└── index.ts               # Re-exports
```

## Dependencies

No new dependencies required.

## Validation

- [x] Hard limits block unsafe trades
- [x] Soft limits generate warnings
- [x] Escalation helpers prevent severity downgrade
- [x] Position sizing respects leverage limits
- [x] Liquidation distance reused from position/metrics.ts
- [x] Kill switch triggers on critical conditions
- [x] Reduce-only mode works correctly
- [x] Unit tests pass (38/38)
- [x] Code review passes (biome + typecheck + guidelines)

## References

- [MVP Roadmap](../../active/0001-mvp-roadmap/README.md)
- [ADR-0013: Risk Management Engine](../../../../../adrs/0013-risk-management.md)
- [ADR-0001: Bot Architecture](../../../../../adrs/0001-bot-architecture.md) — Two-phase risk check
