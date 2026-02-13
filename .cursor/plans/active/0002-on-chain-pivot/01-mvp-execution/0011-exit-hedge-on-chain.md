---
name: Exit Hedge On-Chain
overview: Exit sequence per ADR-0022 — simulate close + withdraw, submit, monitor keeper, reconcile. Exit trigger: regime flip or remaining yield < costs.
todos:
  - id: exit-hedge-job
    content: Implement exit hedge job in execution engine
    status: pending
  - id: simulate-close-withdraw
    content: simulate close order + withdraw before submit
    status: pending
  - id: close-perp-withdraw-gm
    content: Submit close perp + GM withdrawal (two-tx sequence)
    status: pending
  - id: exit-trigger
    content: Exit when regime flip (4h_MA <= 0) or remaining yield < costs
    status: pending
  - id: emergency-exit
    content: Emergency exit support (risk engine DANGER/BLOCKED)
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

> **Phase 1-11** in [GMX Pivot Roadmap](../../README.md). Reference: [ADR-0022](../../../../../adrs/0022-regime-based-gmx-arb.md) Execution Engine

# Exit Hedge On-Chain

## Overview

Per ADR-0022 Exit sequence: (1) simulate close order + withdraw, (2) submit, (3) monitor keeper execution, (4) reconcile. Exit when regime flip or remaining_expected_yield_bps < remaining_costs_bps.

See deprecated [phase-d-execution/0002-exit-hedge-on-chain.md](../../../deprecated/0002-gmx-pivot-v1/phase-d-execution/0002-exit-hedge-on-chain.md).

## Validation

- [ ] Exit sequence correct
- [ ] Exit trigger from regime detector
- [ ] Emergency exit works
- [ ] Typecheck and biome pass
