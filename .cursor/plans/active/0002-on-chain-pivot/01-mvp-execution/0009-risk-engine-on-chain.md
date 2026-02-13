---
name: Risk Engine On-Chain
overview: Add ADR-0022 risk engine gates — max gas threshold, max impact (5 bps target / 8 bps hard), oracle staleness, keeper delay, liquidation distance, circuit breakers.
todos:
  - id: gas-cost-risk
    content: Max gas threshold — block entry if round-trip gas > config (e.g. $10)
    status: pending
  - id: impact-risk
    content: Max impact threshold — 5 bps target, 8 bps hard cap per ADR-0022
    status: pending
  - id: keeper-delay-risk
    content: Keeper delay timeout monitoring; cancel on timeout
    status: pending
  - id: oracle-risk
    content: Oracle staleness and deviation checks; circuit breaker on unhealthy
    status: pending
  - id: liquidation-risk
    content: Min liquidation distance via Reader
    status: pending
  - id: circuit-breakers
    content: RPC unhealthy, abnormal deviations → pause trading
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

> **Phase 1-09** in [GMX Pivot Roadmap](../../README.md). Reference: [ADR-0022](../../../../../adrs/0022-regime-based-gmx-arb.md) Risk Engine

# Risk Engine On-Chain

## Overview

Extend risk engine per ADR-0022: max gas threshold, max impact (5 bps target / 8 bps hard), oracle staleness/deviation, keeper delay timeout/cancel, liquidation distance minimum, max exposure per market, circuit breakers (RPC unhealthy, abnormal deviations).

See deprecated [phase-c-strategy-risk/0003-risk-engine-on-chain.md](../../../deprecated/0002-gmx-pivot-v1/phase-c-strategy-risk/0003-risk-engine-on-chain.md).

## Validation

- [ ] All risk gates enforced
- [ ] Circuit breakers pause trading
- [ ] Typecheck and biome pass
