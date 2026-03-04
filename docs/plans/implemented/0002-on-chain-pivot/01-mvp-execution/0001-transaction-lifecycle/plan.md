---
name: Transaction Lifecycle
overview: Implement build → simulate → send → confirm pipeline with gas estimation and ChainError hierarchy. Per ADR-0022 Execution Engine and ADR-0020 contract interaction patterns.
todos:
  - id: chain-errors
    content: Create ChainError class and ChainErrorCode type in src/lib/chain/errors/
    status: pending
    files:
      creates:
        - src/lib/chain/errors/index.ts
        - src/lib/chain/errors/errors.ts
        - src/lib/chain/errors/errors.test.ts
      modifies:
        - src/lib/chain/index.ts
    depends-on: []
    benefits-from: []
    agent-type: generalPurpose
    effort: small
    context-refs:
      - CODE_GUIDELINES.md
      - adrs/0020-contract-interaction-patterns.md
      - src/adapters/errors.ts

  - id: gas-estimation
    content: Create execution fee estimation and gas price circuit breaker in src/lib/chain/gas/
    status: pending
    files:
      creates:
        - src/lib/chain/gas/index.ts
        - src/lib/chain/gas/gas.ts
        - src/lib/chain/gas/gas.test.ts
      modifies:
        - src/lib/chain/index.ts
    depends-on: []
    benefits-from: []
    agent-type: generalPurpose
    effort: medium
    context-refs:
      - CODE_GUIDELINES.md
      - adrs/0020-contract-interaction-patterns.md
      - src/lib/chain/client/client.ts
      - src/lib/chain/constants.ts

  - id: tx-builder
    content: Create tx-builder with multicall payload builders (increase order, decrease order, deposit, withdrawal)
    status: pending
    files:
      creates:
        - src/lib/chain/tx-builder/index.ts
        - src/lib/chain/tx-builder/tx-builder.ts
        - src/lib/chain/tx-builder/tx-builder.test.ts
      modifies:
        - src/lib/chain/index.ts
    depends-on: []
    benefits-from: []
    agent-type: generalPurpose
    effort: large
    context-refs:
      - CODE_GUIDELINES.md
      - adrs/0020-contract-interaction-patterns.md
      - src/lib/chain/constants.ts

  - id: tx-sender
    content: Create tx-sender with simulate → send → waitForReceipt pipeline
    status: pending
    files:
      creates:
        - src/lib/chain/tx-sender/index.ts
        - src/lib/chain/tx-sender/tx-sender.ts
        - src/lib/chain/tx-sender/tx-sender.test.ts
      modifies:
        - src/lib/chain/index.ts
    depends-on:
      - chain-errors
      - gas-estimation
      - tx-builder
    benefits-from: []
    agent-type: generalPurpose
    effort: large
    context-refs:
      - CODE_GUIDELINES.md
      - adrs/0020-contract-interaction-patterns.md
      - adrs/0022-regime-based-gmx-arb.md
      - src/lib/chain/errors/errors.ts
      - src/lib/chain/gas/gas.ts
      - src/lib/chain/tx-builder/tx-builder.ts

  - id: code-review
    content: Run code-reviewer subagent
    status: pending
    files:
      creates: []
      modifies: []
    depends-on:
      - tx-sender
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

> **Phase 1-01** in [GMX Pivot Roadmap](../../../README.md). Reference: [ADR-0022](../../../../adrs/0022-regime-based-gmx-arb.md), [ADR-0020](../../../../adrs/0020-contract-interaction-patterns.md).

# Transaction Lifecycle

## Overview

Implement the build → simulate → send → confirm pipeline per ADR-0022 Execution Engine. Always simulate before submit. Gas circuit breaker. ChainError hierarchy per ADR-0020.

## Implementation Context

### Code Patterns

- **Error hierarchy**: Follow `ExchangeError` in `src/adapters/errors.ts` — class extending `Error` with `name`, `code`, and optional `cause`. ChainError uses `ChainErrorCode` union from ADR-0020.
- **Factory over class**: Prefer `createGasEstimator(deps)` over classes for gas/tx-sender where testability benefits.
- **Write pattern (ADR-0020)**: Build multicall payload → `publicClient.simulateContract(txRequest)` → `walletClient.writeContract(request)` → `publicClient.waitForTransactionReceipt({ hash })`. On revert, throw `ChainError` with code `TX_REVERTED` or `SIMULATION_FAILED`.
- **File organization**: Each new module under `src/lib/chain/` is a directory with `index.ts` (public API), `module-name.ts` (implementation), `module-name.test.ts` (colocated tests). See [.cursor/rules/file-organization.mdc](../../../../../../rules/file-organization.mdc).

### Relevant Types

- **ChainErrorCode** (ADR-0020): `RPC_ERROR` | `SIMULATION_FAILED` | `TX_REVERTED` | `KEEPER_TIMEOUT` | `KEEPER_CANCELLED` | `NONCE_ERROR` | `GAS_TOO_HIGH`.
- **ChainError**: `message`, `code: ChainErrorCode`, `cause?: unknown`.
- **Execution fee**: Use DataStore `getUint(executionGasLimitKey(orderType))`, then `getGasPrice()`; apply 1.5x buffer. Gas circuit breaker: compare estimated cost to configurable max (e.g. don't enter if round-trip gas > $10).
- **Tx builder**: Encode `sendWnt`, `sendTokens`, `createOrder` (or decrease/deposit/withdrawal) via viem `encodeFunctionData`; return payload + value for `multicall`.

### File Locations

| Deliverable   | Path                                      |
|---------------|-------------------------------------------|
| Chain errors  | `src/lib/chain/errors/`                   |
| Gas estimation| `src/lib/chain/gas/`                      |
| Tx builder    | `src/lib/chain/tx-builder/`               |
| Tx sender     | `src/lib/chain/tx-sender/`                |
| Chain index   | `src/lib/chain/index.ts` (re-export new modules) |

### Test Patterns

- **Vitest**: `describe` / `it`; mock `PublicClient` / `WalletClient` with `vi.fn()` for contract calls.
- **Colocated**: `errors.test.ts`, `gas.test.ts`, `tx-builder.test.ts`, `tx-sender.test.ts` next to implementation.
- **Error tests**: Assert `throw new ChainError(...)` with `expect(...).toThrow(ChainError)` and `expect(e.code).toBe("GAS_TOO_HIGH")`.

### Error Handling

- Use **ChainError** for all chain-related failures; no generic `Error` for RPC/simulation/revert/keeper/gas.
- Preserve cause: `throw new ChainError("...", "SIMULATION_FAILED", originalError)`.
- Gas circuit breaker: throw `ChainError` with code `GAS_TOO_HIGH` when estimated cost exceeds threshold.

## Validation

- [ ] Simulation runs before every send
- [ ] Gas circuit breaker blocks when gas too high
- [ ] All writes go through serial queue (tx-sender used by single consumer)
- [ ] Typecheck and biome pass

## AI-Generated Execution Preview

Based on the dependencies above, execution will proceed as follows:

**Batch 1** (parallel)

- [ ] chain-errors: Create ChainError and ChainErrorCode in `src/lib/chain/errors/`
- [ ] gas-estimation: Create execution fee estimation and gas circuit breaker in `src/lib/chain/gas/`
- [ ] tx-builder: Create multicall payload builders in `src/lib/chain/tx-builder/`

**Batch 2**

- [ ] tx-sender: Create simulate → send → waitForReceipt pipeline _(depends on chain-errors, gas-estimation, tx-builder)_

**Batch 3**

- [ ] code-review: Run code-reviewer subagent _(depends on tx-sender)_

**Batch 4**

- [ ] lifecycle-management: Move plan to implemented/ _(depends on code-review)_

_Critical path: chain-errors + gas-estimation + tx-builder → tx-sender → code-review → lifecycle-management (4 steps)._
