---
name: Keeper Monitoring
overview: EventEmitter polling for async order execution/cancellation. Keeper timeout 60-120s per ADR-0022; cancel on timeout.
todos:
  - id: keeper-types
    content: Define keeper event types and order key types
    status: pending
  - id: event-parsing
    content: Parse execution and cancellation events from EventEmitter
    status: pending
  - id: wait-for-execution
    content: Implement wait-for-execution polling
    status: pending
  - id: timeout-handling
    content: Implement 60-120s keeper timeout; cancel order if not executed (ADR-0022)
    status: pending
  - id: integration
    content: Integrate with execution engine state machine
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

> **Phase 1-05** in [GMX Pivot Roadmap](../../README.md). Reference: [ADR-0022](../../../../../adrs/0022-regime-based-gmx-arb.md) Key Configurations

# Keeper Monitoring

## Overview

Poll for async GMX order execution/cancellation. ADR-0022: Keeper timeout 60–120s (configurable); cancel order if not executed within timeout.

See deprecated [phase-b-gmx-adapter/0004-keeper-monitoring.md](../../../deprecated/0002-gmx-pivot-v1/phase-b-gmx-adapter/0004-keeper-monitoring.md).

## Validation

- [ ] Execution and cancellation events detected
- [ ] Timeout triggers cancel
- [ ] Typecheck and biome pass
