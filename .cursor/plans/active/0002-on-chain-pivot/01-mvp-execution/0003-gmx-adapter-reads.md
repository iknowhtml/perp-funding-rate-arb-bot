---
name: GMX Adapter — Read Operations
overview: Implement GmxAdapter read methods including regime-specific reads (4h MA funding, OI skew ratio). REST + Reader contract.
todos:
  - id: balance-reads
    content: Implement balance and position reads via Reader contract (getAccountPositions, token balances)
    status: pending
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
      - adrs/0022-regime-based-gmx-arb.md
      - adrs/0020-contract-interaction-patterns.md
      - src/adapters/gmx/types.ts
      - src/lib/chain/client/client.ts

  - id: funding-rate-reads
    content: Implement funding rate reads (raw + 4h MA for regime detection)
    status: pending
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
      - adrs/0022-regime-based-gmx-arb.md
      - src/adapters/gmx/index.ts

  - id: oi-skew-reads
    content: Implement OI skew ratio reads (long OI, short OI)
    status: pending
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
      - adrs/0022-regime-based-gmx-arb.md
      - src/adapters/gmx/index.ts

  - id: market-info-reads
    content: Implement market info, ticker, borrow rates via REST + Reader
    status: pending
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
      - src/adapters/gmx/index.ts

  - id: gm-balance
    content: Implement GM token balance read
    status: pending
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
      - adrs/0021-on-chain-pnl-accounting.md
      - src/adapters/gmx/types.ts

  - id: adapter-factory
    content: Implement createGmxAdapter composing reads and return GmxAdapter
    status: pending
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
    status: pending
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
    status: pending
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

> **Phase 1-03** in [GMX Pivot Roadmap](../../README.md). Reference: [ADR-0022](../../../../../adrs/0022-regime-based-gmx-arb.md) Signal Engine.

# GMX Adapter — Read Operations

## Overview

Implement GmxAdapter read methods. Add regime-specific reads: 4h MA funding rate, OI skew ratio (long OI > short OI). Per ADR-0022 Data Plane and Signal Engine. **Requires plan 0002 (GMX adapter types) implemented** — GmxAdapter type and domain types must exist.

## Implementation Context

### Code Patterns

- **Factory over class**: `createGmxAdapter(deps)` returning object implementing `GmxAdapter` (from 0002). Dependencies: publicClient (viem), REST base URL, optional chain constants.
- **Read pattern**: Use existing `fetchGmxMarketsInfo`, `fetchGmxTickers` from `src/adapters/gmx/index.ts` for REST; use `publicClient.readContract` with Reader ABI for on-chain reads (positions, balances). Per ADR-0020 (viem, not SDK class).
- **File organization**: `src/adapters/gmx/reads.ts` for read functions; `src/adapters/gmx/adapter.ts` for `createGmxAdapter`. Colocated `reads.test.ts`, `adapter.test.ts`. See [.cursor/rules/file-organization.mdc](../../../rules/file-organization.mdc).

### Relevant Types

- **GmxAdapter** (from 0002): Interface with getBalance, getPositions, getFundingRate, getMarketInfo, getTicker, getBorrowRates, getGmBalance, get4hMaFundingRate?, getOiSkew? (regime reads).
- **GmxMarket**, **GmxTicker** (existing in `src/adapters/gmx/index.ts`): Use for REST responses; normalize to domain types where needed.
- **position_state**, **pnl_snapshot** (from 0002): Use when returning position/PnL snapshots from reads.

### File Locations

| Deliverable       | Path                              |
|-------------------|-----------------------------------|
| Read functions    | `src/adapters/gmx/reads.ts`       |
| Read tests        | `src/adapters/gmx/reads.test.ts`  |
| Adapter factory   | `src/adapters/gmx/adapter.ts`     |
| Adapter tests     | `src/adapters/gmx/adapter.test.ts`|
| GMX index         | `src/adapters/gmx/index.ts`       |
| Factory           | `src/adapters/factory/factory.ts` |

### Test Patterns

- **Vitest**: `describe` / `it`; mock `fetch` for REST and `publicClient.readContract` for Reader calls with `vi.fn()`.
- **Colocated**: `reads.test.ts`, `adapter.test.ts` next to implementation. Test happy path and error paths (RPC failure, REST non-OK).

### Error Handling

- Use **ChainError** (from 0002 / ADR-0020) for REST/Reader failures — GMX is a protocol, not a CEX, so do not use `ExchangeError`. Preserve `cause`; use appropriate codes (e.g. `RPC_ERROR`, `API_ERROR`/`HTTP_ERROR` when added to `ChainErrorCode`).

## Validation

- [ ] 4h MA funding rate computable
- [ ] OI skew ratio available
- [ ] Reads match REST/contract data
- [ ] Typecheck and biome pass

## AI-Generated Execution Preview

Based on the dependencies above, execution will proceed as follows:

**Batch 1**

- [ ] balance-reads: Implement balance and position reads via Reader contract _(creates reads.ts, reads.test.ts; modifies gmx/index.ts)_

**Batch 2** (parallel — all depend only on balance-reads)

- [ ] funding-rate-reads: Implement funding rate reads (raw + 4h MA)
- [ ] oi-skew-reads: Implement OI skew ratio reads
- [ ] market-info-reads: Implement market info, ticker, borrow rates via REST + Reader
- [ ] gm-balance: Implement GM token balance read

**Batch 3**

- [ ] adapter-factory: Implement createGmxAdapter and wire reads into GmxAdapter _(depends on all read todos)_

**Batch 4**

- [ ] tests: Add unit tests for reads and adapter _(depends on adapter-factory)_

**Batch 5**

- [ ] code-review: Run code-reviewer subagent _(depends on tests)_

**Batch 6**

- [ ] lifecycle-management: Move plan to implemented/ _(depends on code-review)_

_Critical path: balance-reads → adapter-factory → tests → code-review → lifecycle-management (5 steps)._
