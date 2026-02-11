---
name: Enter Hedge On-Chain
overview: Enter sequence per ADR-0022 — approvals, simulateDeposit, simulateOrder, submit, monitor keeper, reconcile. Entry gate: expected_total_yield_bps >= gas_bps + impact_bps + drift_bps + buffer_bps.
todos:
  - id: enter-hedge-job
    content: Implement enter hedge job in execution engine
    status: pending
  - id: approvals
    content: Ensure token approvals before deposit
    status: pending
  - id: simulate-then-submit
    content: simulateExecuteDeposit and simulateExecuteOrder before submit
    status: pending
  - id: short-perp-gm-deposit
    content: Submit short perp + GM deposit (two-tx sequence)
    status: pending
  - id: entry-gate
    content: Enforce entry gate from cost model (ADR-0021)
    status: pending
  - id: keeper-monitor
    content: Monitor keeper execution; reconcile on confirm
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

> **Phase 1-10** in [GMX Pivot Roadmap](../../README.md). Reference: [ADR-0022](../../../../../adrs/0022-regime-based-gmx-arb.md) Execution Engine

# Enter Hedge On-Chain

## Overview

Per ADR-0022 Enter sequence: (1) Ensure approvals, (2) simulateExecuteDeposit, (3) simulateExecuteOrder, (4) Submit tx(s) with conservative acceptable price, (5) Monitor keeper execution, (6) Confirm state; reconcile. Entry gate: expected_total_yield_bps >= gas_bps + impact_bps + drift_bps + buffer_bps.

See deprecated [phase-d-execution/0001-enter-hedge-on-chain.md](../../../deprecated/0002-gmx-pivot-v1/phase-d-execution/0001-enter-hedge-on-chain.md).

## Validation

- [ ] Enter sequence correct
- [ ] Entry gate enforced
- [ ] Keeper monitoring integrated
- [ ] Typecheck and biome pass
