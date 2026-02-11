---
name: Reconciler
overview: Periodic chain reads to ensure position exists/closed, GM balances match, pending orders cleared. Corrects local state on discrepancy. Per ADR-0022 Reconciler.
todos:
  - id: position-check
    content: Verify position exists/closed as expected via Reader
    status: pending
  - id: gm-balance-check
    content: Verify GM balances match expected
    status: pending
  - id: pending-orders-check
    content: Verify pending orders cleared
    status: pending
  - id: state-correction
    content: Correct local state if missed events or discrepancy
    status: pending
  - id: scheduler
    content: Run reconciler periodically (e.g. every 30s when in-position)
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

> **Phase 1-13** in [GMX Pivot Roadmap](../../README.md). Reference: [ADR-0022](../../../../../adrs/0022-regime-based-gmx-arb.md) Reconciler

# Reconciler

## Overview

Per ADR-0022 Reconciler: Periodic chain reads to ensure (1) position exists / closed as expected, (2) GM balances match expected, (3) pending orders cleared. Corrects local state if missed events.

Extends the existing reconciler pattern from ADR-0001 / CEX model for on-chain state.

## Validation

- [ ] Detects position/balance/order discrepancies
- [ ] Corrects local state
- [ ] Typecheck and biome pass
