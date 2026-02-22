---
name: GMX Adapter Types + CEX Cleanup
overview: Define GmxAdapter type and domain types including position_state and pnl_snapshot (ADR-0022 appendix). Delete ExchangeAdapter and CEX adapters.
todos:
  - id: domain-types
    content: Define TxResult, OpenPositionParams, LiquidityBalance, position_state, pnl_snapshot types per ADR-0022/0021
    status: pending
    files:
      creates:
        - src/adapters/gmx/types.ts
      modifies: []
    depends-on: []
    benefits-from: []
    agent-type: generalPurpose
    effort: medium
    context-refs:
      - CODE_GUIDELINES.md
      - adrs/0022-regime-based-gmx-arb.md
      - adrs/0021-on-chain-pnl-accounting.md
      - src/adapters/types/types.ts

  - id: valibot-schemas
    content: Create Valibot schemas for all GMX domain types and type guards
    status: pending
    files:
      creates: []
      modifies:
        - src/adapters/gmx/types.ts
    depends-on:
      - domain-types
    benefits-from: []
    agent-type: generalPurpose
    effort: medium
    context-refs:
      - CODE_GUIDELINES.md
      - adrs/0003-validation-strategy.md
      - src/adapters/types/types.ts

  - id: adapter-errors
    content: Implement ChainError + ChainErrorCode in src/lib/chain/errors/; GMX adapter throws ChainError for chain/REST failures
    status: pending
    files:
      creates:
        - src/lib/chain/errors/errors.ts
        - src/lib/chain/errors/index.ts
      modifies:
        - src/lib/chain/index.ts
        - src/adapters/gmx/index.ts
    depends-on: []
    benefits-from: []
    agent-type: generalPurpose
    effort: small
    context-refs:
      - CODE_GUIDELINES.md
      - adrs/0020-contract-interaction-patterns.md

  - id: gmx-adapter-type
    content: Define GmxAdapter interface as return type of createGmxAdapter()
    status: pending
    files:
      creates: []
      modifies:
        - src/adapters/gmx/types.ts
    depends-on:
      - domain-types
    benefits-from: []
    agent-type: generalPurpose
    effort: small
    context-refs:
      - CODE_GUIDELINES.md
      - adrs/0022-regime-based-gmx-arb.md
      - src/adapters/types/types.ts

  - id: cex-cleanup
    content: Delete ExchangeAdapter, CEX adapters (paper, factory CEX branches), WebSocket worker
    status: pending
    files:
      creates: []
      modifies:
        - src/adapters/types/types.ts
        - src/adapters/types/index.ts
        - src/adapters/factory/factory.ts
        - src/adapters/factory/factory.test.ts
        - src/adapters/index.ts
        - src/adapters/paper/adapter.ts
        - src/adapters/paper/index.ts
        - src/worker/websocket/index.ts
        - src/worker/start-worker.ts
    depends-on:
      - gmx-adapter-type
    benefits-from: []
    agent-type: generalPurpose
    effort: large
    context-refs:
      - CODE_GUIDELINES.md
      - .cursor/rules/file-organization.mdc

  - id: update-domain-imports
    content: Update domain and worker call sites to use GmxAdapter type
    status: pending
    files:
      creates: []
      modifies:
        - src/worker/evaluator/evaluate/evaluate.ts
        - src/worker/evaluator/evaluate/evaluate.test.ts
        - src/worker/evaluator/startup/startup.ts
        - src/worker/evaluator/startup/startup.test.ts
        - src/worker/data-plane/data-plane.ts
        - src/worker/data-plane/data-plane.test.ts
        - src/worker/reconciler/reconcile/reconcile.ts
        - src/worker/reconciler/reconcile/reconcile.test.ts
        - src/worker/execution/enter-hedge/enter-hedge.ts
        - src/worker/execution/enter-hedge/enter-hedge.test.ts
        - src/worker/execution/exit-hedge/exit-hedge.ts
        - src/worker/execution/exit-hedge/exit-hedge.test.ts
        - src/worker/execution/drift/drift.ts
        - src/worker/execution/drift/drift.test.ts
        - src/worker/execution/slippage/slippage.ts
        - src/worker/execution/slippage/slippage.test.ts
        - src/worker/execution/partial-fills/partial-fills.ts
        - src/worker/execution/partial-fills/partial-fills.test.ts
        - src/worker/execution/fill-confirmation/fill-confirmation.ts
        - src/worker/execution/fill-confirmation/fill-confirmation.test.ts
    depends-on:
      - cex-cleanup
    benefits-from: []
    agent-type: generalPurpose
    effort: medium
    context-refs:
      - CODE_GUIDELINES.md
      - src/adapters/gmx/types.ts

  - id: tests
    content: Add tests for GMX schemas and type guards
    status: pending
    files:
      creates:
        - src/adapters/gmx/types.test.ts
      modifies: []
    depends-on:
      - valibot-schemas
    benefits-from: []
    agent-type: generalPurpose
    effort: small
    context-refs:
      - .cursor/rules/testing.mdc
      - src/adapters/types/types.test.ts

  - id: code-review
    content: Run code-reviewer subagent
    status: pending
    files:
      creates: []
      modifies: []
    depends-on:
      - update-domain-imports
      - tests
    benefits-from: []
    agent-type: generalPurpose
    effort: small
    context-refs: []

  - id: lifecycle-management
    content: "Move plan to implemented/ (cp to implemented/, git rm -f from active/, verify deletion)"
    status: pending
    files:
      creates: []
      modifies: []
    depends-on:
      - code-review
    benefits-from: []
    agent-type: shell
    effort: small
    context-refs: []
isProject: false
---

> **Phase 1-02** in [GMX Pivot Roadmap](../../README.md). Reference: [ADR-0022](../../../../../adrs/0022-regime-based-gmx-arb.md), [ADR-0021](../../../../../adrs/0021-on-chain-pnl-accounting.md).

# GMX Adapter Types + CEX Cleanup

## Overview

Define the concrete GMX adapter types. Add `position_state` and `pnl_snapshot` types from ADR-0022 appendix and ADR-0021 trade_snapshot schema. Delete CEX adapter code (ExchangeAdapter, paper adapter, factory CEX branches, WebSocket worker).

## Implementation Context

### Code Patterns

- **Types**: Use interfaces and `type` aliases; BigInt for monetary/size fields (smallest unit). Follow existing `src/adapters/types/types.ts` style (Balance, Position, etc.).
- **Valibot**: Use `v.object()`, `v.bigint()`, `v.date()`, `v.picklist()` for schemas; export `isX` type guards via `v.is(schema, value)`.
- **File organization**: New GMX types in `src/adapters/gmx/types.ts`; `index.ts` re-exports from `gmx` as needed. See [.cursor/rules/file-organization.mdc](../../../rules/file-organization.mdc).

### Relevant Types (ADR-0022 Appendix, ADR-0021)

- **position_state**: ts, market, perp_position (size, entry, pnl, liquidation), gm_balance, gm_cost_basis, gm_mtm_value
- **pnl_snapshot**: ts, trade_id, perp_funding_usd, perp_fees_usd, gm_value_change_usd, gm_fee_accrual_usd, gas_usd, impact_usd, net_usd
- **TxResult**: hash, success, blockNumber (from ADR-0020 / transaction lifecycle)
- **OpenPositionParams**: market, size, collateral, leverage, etc. (GMX increase-order params)
- **LiquidityBalance**: GM token balance / pool share (GMX-specific)
- **GmxAdapter**: Interface with read methods (getBalance, getPositions, getFundingRate, getMarketInfo, etc.) — no WebSocket; regime reads (4h MA funding, OI skew) can be added in 0003.

### File Locations

| Deliverable        | Path                         |
|--------------------|------------------------------|
| GMX types + schema | `src/adapters/gmx/types.ts`  |
| GMX type tests     | `src/adapters/gmx/types.test.ts` |
| Adapter errors     | `src/adapters/errors.ts`     |

### Test Patterns

- **Vitest**: `describe` / `it`; test schema parse/refine and type guards with valid/invalid inputs.
- **Colocated**: `types.test.ts` next to `types.ts`. Mock-free for pure validation tests.

### Error Handling

- **Use ChainError (ADR-0020)** for all chain/viem failures: implement `ChainError` and `ChainErrorCode` in `src/lib/chain/errors/errors.ts` (RPC_ERROR, SIMULATION_FAILED, TX_REVERTED, KEEPER_TIMEOUT, etc.). GMX adapter throws `ChainError` when viem/RPC/simulation/tx/keeper fails.
- **Do not add a separate GMXError class** for on-chain failures — that would duplicate chain semantics and force callers to handle two error types for the same failure domain. Keep a single chain-level type.
- **GMX REST (Oracle API)** failures (e.g. markets/info, prices/tickers): throw `ChainError` with a code such as `RPC_ERROR` or a new `API_ERROR`/`HTTP_ERROR` in `ChainErrorCode`, so the adapter boundary still has one error type. Alternatively, if we later need GMX-only codes (e.g. MARKET_PAUSED from their API), add a small `GmxError` in `src/adapters/gmx/errors.ts` only for those non-chain cases; chain failures stay as `ChainError`.

## Validation

- [ ] position_state, pnl_snapshot types match ADR-0022/0021
- [ ] CEX adapter code and WebSocket worker removed
- [ ] Typecheck and biome pass

## AI-Generated Execution Preview

Based on the dependencies above, execution will proceed as follows:

**Batch 1** (parallel)

- [ ] domain-types: Define TxResult, OpenPositionParams, LiquidityBalance, position_state, pnl_snapshot in `src/adapters/gmx/types.ts`
- [ ] adapter-errors: Add on-chain error codes to `src/adapters/errors.ts`

**Batch 2**

- [ ] valibot-schemas: Add Valibot schemas and type guards in `src/adapters/gmx/types.ts` _(depends on domain-types)_
- [ ] gmx-adapter-type: Define GmxAdapter interface in `src/adapters/gmx/types.ts` _(depends on domain-types)_

**Batch 3**

- [ ] cex-cleanup: Delete ExchangeAdapter, CEX adapters, WebSocket worker _(depends on gmx-adapter-type)_

**Batch 4**

- [ ] update-domain-imports: Update domain/worker call sites to use GmxAdapter _(depends on cex-cleanup)_

**Batch 5**

- [ ] tests: Add tests for GMX schemas and type guards _(depends on valibot-schemas)_

**Batch 6**

- [ ] code-review: Run code-reviewer subagent _(depends on update-domain-imports, tests)_

**Batch 7**

- [ ] lifecycle-management: Move plan to implemented/ _(depends on code-review)_

_Critical path: domain-types → gmx-adapter-type → cex-cleanup → update-domain-imports → code-review → lifecycle-management (6 steps)._
