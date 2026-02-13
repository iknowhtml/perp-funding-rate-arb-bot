---
name: GMX Adapter — Read Operations
overview: Implement GmxAdapter read methods including regime-specific reads (4h MA funding, OI skew ratio). REST + Reader contract.
todos:
  - id: balance-reads
    content: Implement balance and position reads via Reader contract
    status: pending
  - id: funding-rate-reads
    content: Implement funding rate reads (raw + 4h MA for regime detection)
    status: pending
  - id: oi-skew-reads
    content: Implement OI skew ratio reads (long OI, short OI)
    status: pending
  - id: market-info-reads
    content: Implement market info, ticker, borrow rates via REST + Reader
    status: pending
  - id: gm-balance
    content: Implement GM token balance read
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

> **Phase 1-03** in [GMX Pivot Roadmap](../../README.md). Reference: [ADR-0022](../../../../../adrs/0022-regime-based-gmx-arb.md) Signal Engine

# GMX Adapter — Read Operations

## Overview

Implement GmxAdapter read methods. Add regime-specific reads: 4h MA funding rate, OI skew ratio (long OI > short OI). Per ADR-0022 Data Plane and Signal Engine.

See deprecated [phase-b-gmx-adapter/0002-gmx-adapter-reads.md](../../../deprecated/0002-gmx-pivot-v1/phase-b-gmx-adapter/0002-gmx-adapter-reads.md).

## Validation

- [ ] 4h MA funding rate computable
- [ ] OI skew ratio available
- [ ] Reads match REST/contract data
- [ ] Typecheck and biome pass
