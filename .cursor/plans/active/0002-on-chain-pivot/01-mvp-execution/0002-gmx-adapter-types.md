---
name: GMX Adapter Types + CEX Cleanup
overview: Define GmxAdapter type and domain types including position_state and pnl_snapshot (ADR-0022 appendix). Delete ExchangeAdapter and CEX adapters.
todos:
  - id: domain-types
    content: Define TxResult, OpenPositionParams, LiquidityBalance, position_state, pnl_snapshot types per ADR-0022/0021
    status: pending
  - id: valibot-schemas
    content: Create Valibot schemas for all domain types
    status: pending
  - id: adapter-errors
    content: Add on-chain error codes to AdapterError
    status: pending
  - id: gmx-adapter-type
    content: Define GmxAdapter as return type of createGmxAdapter()
    status: pending
  - id: cex-cleanup
    content: Delete ExchangeAdapter, CEX adapters, WebSocket worker
    status: pending
  - id: update-domain-imports
    content: Update domain call sites to use GmxAdapter
    status: pending
  - id: tests
    content: Add tests for schemas and type guards
    status: pending
  - id: code-review
    content: Run code-reviewer subagent
    status: pending
  - id: lifecycle-management
    content: "Move plan to implemented/"
    status: pending
isProject: false
---

> **Phase 1-02** in [GMX Pivot Roadmap](../../README.md). Reference: [ADR-0022](../../../../../adrs/0022-regime-based-gmx-arb.md), [ADR-0021](../../../../../adrs/0021-on-chain-pnl-accounting.md)

# GMX Adapter Types + CEX Cleanup

## Overview

Define the concrete GMX adapter types. Add `position_state` and `pnl_snapshot` types from ADR-0022 appendix and ADR-0021 trade_snapshot schema. Delete CEX adapter code.

See deprecated [phase-b-gmx-adapter/0001-gmx-adapter-types.md](../../../deprecated/0002-gmx-pivot-v1/phase-b-gmx-adapter/0001-gmx-adapter-types.md) for base implementation.

## Validation

- [ ] position_state, pnl_snapshot types match ADR-0022/0021
- [ ] CEX adapter code removed
- [ ] Typecheck and biome pass
