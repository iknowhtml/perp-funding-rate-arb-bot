---
name: Async Order Lifecycle
overview: State machine for on-chain orders. Add cancel-on-timeout state per ADR-0022 (60-120s keeper timeout).
todos:
  - id: order-states
    content: Define states — BUILDING, SIMULATING, SUBMITTED, KEEPER_PENDING, EXECUTED, CANCELLED, TIMEOUT
    status: pending
  - id: state-machine
    content: Implement state machine transitions
    status: pending
  - id: keeper-integration
    content: Integrate with keeper monitoring; TIMEOUT → cancel
    status: pending
  - id: retry-logic
    content: Retry/cancel logic on timeout
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

> **Phase 1-12** in [GMX Pivot Roadmap](../../README.md). Reference: [ADR-0022](../../../../../adrs/0022-regime-based-gmx-arb.md) Key Configurations

# Async Order Lifecycle

## Overview

State machine for on-chain orders. Add cancel-on-timeout per ADR-0022: if keeper delay > 60-120s, cancel order. States: BUILDING → SIMULATING → SUBMITTED → KEEPER_PENDING → EXECUTED / CANCELLED / TIMEOUT.

See deprecated [phase-d-execution/0003-async-order-lifecycle.md](../../../deprecated/0002-gmx-pivot-v1/phase-d-execution/0003-async-order-lifecycle.md).

## Validation

- [ ] All transitions correct
- [ ] Timeout triggers cancel
- [ ] Typecheck and biome pass
