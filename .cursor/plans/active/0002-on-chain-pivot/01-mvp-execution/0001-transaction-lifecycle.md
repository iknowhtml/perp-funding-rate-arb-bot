---
name: Transaction Lifecycle
overview: Implement build → simulate → send → confirm pipeline with gas estimation and ChainError hierarchy. Per ADR-0022 Execution Engine.
todos:
  - id: chain-errors
    content: Create src/lib/chain/errors.ts with ChainError class and ChainErrorCode type
    status: pending
  - id: gas-estimation
    content: Create src/lib/chain/gas.ts with execution fee estimation and gas price circuit breaker
    status: pending
  - id: tx-builder
    content: Create tx-builder with multicall payload builders (increase order, decrease order, deposit, withdrawal)
    status: pending
  - id: tx-sender
    content: Create tx-sender with simulate → send → waitForReceipt pipeline
    status: pending
  - id: tests
    content: Add unit tests for errors, gas estimation, tx builder, tx sender
    status: pending
  - id: code-review
    content: Run code-reviewer subagent
    status: pending
  - id: lifecycle-management
    content: "Move plan to implemented/"
    status: pending
isProject: false
---

> **Phase 1-01** in [GMX Pivot Roadmap](../../README.md). Reference: [ADR-0022](../../../../../adrs/0022-regime-based-gmx-arb.md), [ADR-0020](../../../../../adrs/0020-contract-interaction-patterns.md)

# Transaction Lifecycle

## Overview

Implement the build → simulate → send → confirm pipeline per ADR-0022 Execution Engine. Always simulate before submit. Gas circuit breaker. ChainError hierarchy.

See deprecated [phase-a-chain-infra/0003-transaction-lifecycle.md](../../../deprecated/0002-gmx-pivot-v1/phase-a-chain-infra/0003-transaction-lifecycle.md) for implementation details.

## Validation

- [ ] Simulation works before send
- [ ] Gas circuit breaker blocks when gas too high
- [ ] All writes through serial queue
- [ ] Typecheck and biome pass
