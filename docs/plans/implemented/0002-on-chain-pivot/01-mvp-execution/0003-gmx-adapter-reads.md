---
name: GMX Adapter — Read Operations
overview: Implement GmxProtocolAdapter read methods (ProtocolAdapter interface) including regime-specific reads (4h MA funding, OI skew ratio). REST + Reader contract.
todos:
  - id: balance-reads
    content: Implement balance and position reads via Reader contract (getAccountPositions, token balances)
    status: completed
    files:
      creates:
        - src/adapters/gmx/reads.ts
        - src/adapters/gmx/reads.test.ts
      modifies:
        - src/adapters/gmx/index.ts
    depends-on: []
    benefits-from: []
    agent-type: generalPurpose
    effort: medium
    context-refs:
      - CODE_GUIDELINES.md
      - docs/adrs/0022-regime-based-gmx-arb.md
      - docs/adrs/0020-contract-interaction-patterns.md
      - src/adapters/gmx/types.ts
      - src/lib/chain/client/client.ts

  - id: funding-rate-reads
    content: Implement funding rate reads (raw + 4h MA for regime detection)
    status: completed
    files:
      creates: []
      modifies:
        - src/adapters/gmx/reads.ts
        - src/adapters/gmx/reads.test.ts
    depends-on:
      - balance-reads
    benefits-from: []
    agent-type: generalPurpose
    effort: medium
    context-refs:
      - CODE_GUIDELINES.md
      - docs/adrs/0022-regime-based-gmx-arb.md
      - src/adapters/gmx/index.ts

  - id: oi-skew-reads
    content: Implement OI skew ratio reads (long OI, short OI)
    status: completed
    files:
      creates: []
      modifies:
        - src/adapters/gmx/reads.ts
        - src/adapters/gmx/reads.test.ts
    depends-on:
      - balance-reads
    benefits-from: []
    agent-type: generalPurpose
    effort: small
    context-refs:
      - CODE_GUIDELINES.md
      - docs/adrs/0022-regime-based-gmx-arb.md
      - src/adapters/gmx/index.ts

  - id: market-info-reads
    content: Implement market info, ticker, borrow rates via REST + Reader
    status: completed
    files:
      creates: []
      modifies:
        - src/adapters/gmx/reads.ts
        - src/adapters/gmx/reads.test.ts
    depends-on:
      - balance-reads
    benefits-from: []
    agent-type: generalPurpose
    effort: medium
    context-refs:
      - CODE_GUIDELINES.md
      - docs/adrs/0022-regime-based-gmx-arb.md
      - src/adapters/gmx/index.ts

  - id: gm-balance
    content: Implement GM token balance read
    status: completed
    files:
      creates: []
      modifies:
        - src/adapters/gmx/reads.ts
        - src/adapters/gmx/reads.test.ts
    depends-on:
      - balance-reads
    benefits-from: []
    agent-type: generalPurpose
    effort: small
    context-refs:
      - CODE_GUIDELINES.md
      - docs/adrs/0021-on-chain-pnl-accounting.md
      - src/adapters/gmx/types.ts

  - id: adapter-factory
    content: Implement createGmxAdapter composing reads and return ProtocolAdapter (GmxProtocolAdapter)
    status: completed
    files:
      creates:
        - src/adapters/gmx/adapter.ts
        - src/adapters/gmx/adapter.test.ts
      modifies:
        - src/adapters/gmx/index.ts
        - src/adapters/factory/factory.ts
        - src/adapters/factory/factory.test.ts
    depends-on:
      - balance-reads
      - funding-rate-reads
      - oi-skew-reads
      - market-info-reads
      - gm-balance
    benefits-from: []
    agent-type: generalPurpose
    effort: medium
    context-refs:
      - CODE_GUIDELINES.md
      - src/adapters/gmx/types.ts
      - .cursor/rules/file-organization.mdc

  - id: tests
    content: Add unit tests for reads and adapter (full coverage)
    status: completed
    files:
      creates: []
      modifies:
        - src/adapters/gmx/reads.test.ts
        - src/adapters/gmx/adapter.test.ts
    depends-on:
      - adapter-factory
    benefits-from: []
    agent-type: generalPurpose
    effort: small
    context-refs:
      - .cursor/rules/testing.mdc
      - src/adapters/types/types.test.ts

  - id: code-review
    content: Run code-reviewer subagent
    status: completed
    files:
      creates: []
      modifies: []
    depends-on:
      - tests
    benefits-from: []
    agent-type: generalPurpose
    effort: small
    context-refs: []

  - id: lifecycle-management
    content: "Move plan to implemented/ (cp to implemented/, git rm -f from active/, verify deletion)"
    status: completed
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

> **Phase 1-03** in [GMX Pivot Roadmap](../../README.md). Reference: [ADR-0022](../../../../adrs/0022-regime-based-gmx-arb.md) Signal Engine.

# GMX Adapter — Read Operations

## Overview

Implement GmxAdapter read methods. Add regime-specific reads: 4h MA funding rate, OI skew ratio (long OI > short OI). Per ADR-0022 Data Plane and Signal Engine. **Requires plan 0002 (GMX adapter types) implemented** — GmxAdapter type and domain types must exist.

## Implementation Context

### Code Patterns

- **Factory over class**: `createGmxAdapter(deps)` returning object implementing `ProtocolAdapter` (GmxProtocolAdapter, from 0002). Dependencies: publicClient (viem), REST base URL, optional chain constants.
- **Read pattern**: Use existing `fetchGmxMarketsInfo`, `fetchGmxTickers` from `src/adapters/gmx/index.ts` for REST; use `publicClient.readContract` with Reader ABI for on-chain reads (positions, balances). Per ADR-0020 (viem, not SDK class).
- **File organization**: `src/adapters/gmx/reads.ts` for read functions; `src/adapters/gmx/adapter.ts` for `createGmxAdapter`. Colocated `reads.test.ts`, `adapter.test.ts`. See [.cursor/rules/file-organization.mdc](../../../rules/file-organization.mdc).

### Relevant Types

- **ProtocolAdapter** (from 0002, in types): Interface with getMarketsInfo, getTickers, getPositionState, getLiquidityBalance, simulateOrder, submitOrder. **GmxProtocolAdapter** adds get4hMaFundingRate?, getOiSkew? (regime reads) when implemented.
- **GmxMarket**, **GmxTicker** (existing in `src/adapters/gmx/index.ts`): Use for REST responses; normalize to domain types where needed.
- **position_state**, **pnl_snapshot** (from 0002): Use when returning position/PnL snapshots from reads.

### File Locations

| Deliverable   | Path                                |
|---------------|-------------------------------------|
| Read functions| `src/adapters/gmx/reads.ts`         |
| Read tests    | `src/adapters/gmx/reads.test.ts`    |
| Adapter factory| `src/adapters/gmx/adapter.ts`       |
| Adapter tests | `src/adapters/gmx/adapter.test.ts`  |
| GMX index     | `src/adapters/gmx/index.ts`         |
| Factory       | `src/adapters/factory/factory.ts`  |

### Test Patterns

- **Vitest**: `describe` / `it`; mock `fetch` for REST and `publicClient.readContract` for Reader calls with `vi.fn()`.
- **Colocated**: `reads.test.ts`, `adapter.test.ts` next to implementation. Test happy path and error paths (RPC failure, REST non-OK).

### Error Handling

- Use **ChainError** (from 0002 / ADR-0020) for REST/Reader failures — GMX is a protocol, not a CEX, so do not use `ExchangeError`. Preserve `cause`; use appropriate codes (e.g. `RPC_ERROR`, `API_ERROR`/`HTTP_ERROR` when added to `ChainErrorCode`).

## Validation

- [x] 4h MA funding rate computable
- [x] OI skew ratio available
- [x] Reads match REST/contract data
- [x] Typecheck and biome pass

## AI-Generated Execution Preview

Based on the dependencies above, execution will proceed as follows:

**Batch 1**

- [x] balance-reads: Implement balance and position reads via Reader contract _(creates reads.ts, reads.test.ts; modifies gmx/index.ts)_

**Batch 2** (parallel — all depend only on balance-reads)

- [x] funding-rate-reads: Implement funding rate reads (raw + 4h MA)
- [x] oi-skew-reads: Implement OI skew ratio reads
- [x] market-info-reads: Implement market info, ticker, borrow rates via REST + Reader
- [x] gm-balance: Implement GM token balance read

**Batch 3**

- [x] adapter-factory: Implement createGmxAdapter and wire reads into GmxProtocolAdapter (ProtocolAdapter) _(depends on all read todos)_

**Batch 4**

- [x] tests: Add unit tests for reads and adapter _(depends on adapter-factory)_

**Batch 5**

- [x] code-review: Run code-reviewer subagent _(depends on tests)_

**Batch 6**

- [x] lifecycle-management: Move plan to implemented/ _(depends on code-review)_

_Critical path: balance-reads → adapter-factory → tests → code-review → lifecycle-management (5 steps)._
