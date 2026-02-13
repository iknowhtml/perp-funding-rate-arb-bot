---
name: Cost Model
overview: Gas model (static estimate + live price), impact model (simulate before submit), IL/drift proxy. Break-even gate per ADR-0021.
todos:
  - id: gas-model
    content: Implement gas model — static estimate per tx + live gas price, total tx count per lifecycle
    status: pending
  - id: impact-model
    content: Implement impact model — log estimated impact bps from simulation for chosen size
    status: pending
  - id: drift-proxy
    content: Implement GM drift proxy — MTM delta vs cost basis + accrued fees
    status: pending
  - id: break-even-gate
    content: Implement entry gate: expected_total_yield_bps >= gas_bps + impact_bps + drift_bps + buffer_bps (ADR-0021)
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

> **Phase 1-07** in [GMX Pivot Roadmap](../../README.md). Reference: [ADR-0022](../../../../../adrs/0022-regime-based-gmx-arb.md) Cost Model, [ADR-0021](../../../../../adrs/0021-on-chain-pnl-accounting.md)

# Cost Model

## Overview

Per ADR-0022 Cost Model: Gas model (static + live), impact model (simulate before submit, log bps), IL/drift proxy (GM MTM vs cost basis + fees). Per ADR-0021: Break-even gate at entry — expected_total_yield_bps >= gas_bps + impact_bps + drift_bps + buffer_bps.

## Validation

- [ ] Gas estimate accurate
- [ ] Impact logged from simulation
- [ ] Break-even gate blocks unprofitable entries
- [ ] Typecheck and biome pass
