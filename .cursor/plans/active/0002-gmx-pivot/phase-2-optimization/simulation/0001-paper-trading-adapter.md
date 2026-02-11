---
name: GMX Paper Trading Adapter
overview: Wraps concrete GmxAdapter, simulates tx lifecycle. Add ADR-0022 reference.
todos:
  - id: paper-adapter
    content: Create paper adapter that wraps GmxAdapter
    status: pending
  - id: simulate-tx-lifecycle
    content: Simulate tx lifecycle (no real chain calls)
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

> **Phase 2-01** in [GMX Pivot Roadmap](../../../README.md). Reference: [ADR-0022](../../../../../../adrs/0022-regime-based-gmx-arb.md)

# GMX Paper Trading Adapter

## Overview

Paper trading adapter that wraps concrete GmxAdapter and simulates tx lifecycle. Per ADR-0022 regime-based strategy.

See deprecated [phase-e-testing-deployment/simulation/0001-gmx-paper-trading-adapter.md](../../../../deprecated/0002-gmx-pivot-v1/phase-e-testing-deployment/simulation/0001-gmx-paper-trading-adapter.md).
