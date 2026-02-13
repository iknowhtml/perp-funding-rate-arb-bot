---
name: GMX Adapter — Write Operations
overview: Implement open/close position, deposit/withdraw liquidity. Simulation-before-submit pattern per ADR-0022 Execution Engine.
todos:
  - id: token-approval
    content: Implement token approval flow
    status: pending
  - id: open-position
    content: Implement open position (short perp) via ExchangeRouter.createOrder
    status: pending
  - id: close-position
    content: Implement close position (MarketDecrease)
    status: pending
  - id: deposit-liquidity
    content: Implement GM deposit via ExchangeRouter.createDeposit
    status: pending
  - id: withdraw-liquidity
    content: Implement GM withdrawal
    status: pending
  - id: simulate-before-submit
    content: Ensure simulateExecuteOrder and simulateExecuteDeposit before every submit
    status: pending
  - id: tests
    content: Add unit tests
    status: pending
  - id: code-review
    content: Run code-reviewer subagent
    status: pending
  - id: lifecycle-management
    content: "Move plan to implemented/"
    status: pending
isProject: false
---

> **Phase 1-04** in [GMX Pivot Roadmap](../../README.md). Reference: [ADR-0022](../../../../../adrs/0022-regime-based-gmx-arb.md) Execution Engine

# GMX Adapter — Write Operations

## Overview

Implement GmxAdapter write methods. Simulation-before-submit pattern per ADR-0022: simulateExecuteDeposit, simulateExecuteOrder before submitting tx(s) with conservative acceptable price.

See deprecated [phase-b-gmx-adapter/0003-gmx-adapter-writes.md](../../../deprecated/0002-gmx-pivot-v1/phase-b-gmx-adapter/0003-gmx-adapter-writes.md).

## Validation

- [ ] Simulate before every submit
- [ ] Writes build correct multicall payloads
- [ ] Typecheck and biome pass
