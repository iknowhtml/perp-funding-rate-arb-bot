# Parallel Execution Plan — Transaction Lifecycle (0001)

**Plan:** [plan.md](./plan.md)  
**Config:** [worktree-config.sh](./worktree-config.sh)

---

## Batch Overview

| Batch | Worktrees | Description |
|-------|-----------|-------------|
| **1** | batch1-chain-infra | ChainError + gas estimation + tx-builder; update `src/lib/chain/index.ts` |
| **2** | batch2-tx-sender | Tx-sender (simulate → send → waitForReceipt); update `src/lib/chain/index.ts` |
| **3** | _(on main)_ | Run code-reviewer subagent |
| **4** | _(on main)_ | Move plan to implemented/ |

Batches 1 and 2 use worktrees; 3 and 4 run on main after Batch 2 is merged and verified.

---

## File Ownership Matrix

| Batch | Worktree | Owns |
|-------|----------|------|
| 1 | batch1-chain-infra | `src/lib/chain/errors/*`, `src/lib/chain/gas/*`, `src/lib/chain/tx-builder/*`, `src/lib/chain/index.ts` |
| 2 | batch2-tx-sender | `src/lib/chain/tx-sender/*`, `src/lib/chain/index.ts` |

**Conflict note:** Both batches modify `src/lib/chain/index.ts`. Merge Batch 1 first, then Batch 2; resolve index.ts by keeping Batch 1 exports and adding tx-sender exports.

---

## Batch 1 — Chain infra (errors, gas, tx-builder)

### Setup

```bash
source docs/plans/active/0002-on-chain-pivot/01-mvp-execution/0001-transaction-lifecycle/worktree-config.sh
wt_setup_batch 1
```

Worktree path: `$WORKTREE_ROOT/batch1-chain-infra` (or `$(dirname $REPO)/worktrees/batch1-chain-infra`).

### Agent prompt (self-contained)

Copy the following into the subagent. The subagent has no conversation context; work in the worktree directory.

---

**Worktree path (project directory):** `$WORKTREE_ROOT/batch1-chain-infra` — run all commands from this directory.

**Task:** Implement the first three todos of plan 0001-transaction-lifecycle: (1) ChainError + ChainErrorCode in `src/lib/chain/errors/`, (2) execution fee estimation and gas price circuit breaker in `src/lib/chain/gas/`, (3) multicall payload builders (increase order, decrease order, deposit, withdrawal) in `src/lib/chain/tx-builder/`. Then update `src/lib/chain/index.ts` to export the new modules.

**CODE_GUIDELINES (follow strictly):**

- Use **const** arrow functions; no `function` declarations.
- **No `any`** — use `unknown` with Valibot validation at boundaries.
- **No type casts** — use Valibot or type guards.
- **Explicit return types** for all exported functions.
- **BigInt** for monetary/wei amounts (e.g. execution fee, gas); use unit suffixes (`rateBps`, `feeWei`).
- **Factory over class** where testable (`createGasEstimator(deps)` etc.); classes allowed for errors (e.g. ChainError).
- **Kebab-case** files; tests colocated as `*.test.ts` next to source.
- **No `.js`** in import paths.
- **Valibot** for parsing/validation; use `v.bigint()`, `v.date()` directly.

**ADR-0020 (contract interaction):**

- ChainErrorCode: `RPC_ERROR` | `SIMULATION_FAILED` | `TX_REVERTED` | `KEEPER_TIMEOUT` | `KEEPER_CANCELLED` | `NONCE_ERROR` | `GAS_TOO_HIGH`.
- ChainError: extends Error, `name = "ChainError"`, `code: ChainErrorCode`, optional `cause`.
- Gas: estimate execution fee via DataStore `getUint(executionGasLimitKey(orderType))` + `getGasPrice()`; 1.5x buffer; circuit breaker throws ChainError `GAS_TOO_HIGH` when over threshold.
- Tx-builder: use viem `encodeFunctionData` for sendWnt, sendTokens, createOrder (and decrease/deposit/withdrawal); return payload + value for multicall.

**Current `src/lib/chain/index.ts` (add new exports after implementing modules):**

```typescript
export type { RpcHealthStatus } from "./health";
export {
  ARBITRUM_CHAIN,
  ARBITRUM_CHAIN_ID,
  ARBITRUM_TESTNET_CHAIN_ID,
  DEFAULT_BLOCK_STALE_THRESHOLD_SEC,
} from "./constants";
export { createArbitrumPublicClient, createArbitrumWalletClient } from "./client";
export { checkRpcHealth } from "./health";
```

Add exports for: `./errors` (ChainError, ChainErrorCode), `./gas` (public API from gas module), `./tx-builder` (public API from tx-builder module).

**Reference files to read in repo:** `src/adapters/errors.ts` (error pattern), `src/lib/chain/client/client.ts`, `src/lib/chain/constants.ts`, `docs/adrs/0020-contract-interaction-patterns.md`.

**Verification (run before committing):**

```bash
pnpm typecheck && pnpm test:run src/lib/chain/errors/ src/lib/chain/gas/ src/lib/chain/tx-builder/ && pnpm biome check .
```

**Commit message:** `feat(chain): ChainError, gas estimation, tx-builder`

---

### Merge, verify, cleanup

```bash
wt_merge_batch 1
wt_verify_batch 1
wt_cleanup_batch 1
```

---

## Batch 2 — Tx-sender

### Setup

```bash
source docs/plans/active/0002-on-chain-pivot/01-mvp-execution/0001-transaction-lifecycle/worktree-config.sh
wt_setup_batch 2
```

Worktree path: `$WORKTREE_ROOT/batch2-tx-sender`.

### Agent prompt (self-contained)

---

**Worktree path (project directory):** `$WORKTREE_ROOT/batch2-tx-sender` — run all commands from this directory.

**Task:** Implement the tx-sender todo of plan 0001-transaction-lifecycle: create `src/lib/chain/tx-sender/` with simulate → send → waitForReceipt pipeline. Use ChainError on simulation failure or revert. Update `src/lib/chain/index.ts` to export the tx-sender module.

**CODE_GUIDELINES (follow strictly):** Same as Batch 1 (arrow functions, no any, no type casts, explicit return types, BigInt for amounts, factory over class where applicable, kebab-case, colocated tests, no .js in imports, Valibot at boundaries).

**Available imports (from Batch 1):** You can import from `@/lib/chain`: ChainError, ChainErrorCode, gas estimation/circuit breaker APIs, tx-builder payload builders. Use these to build the request, estimate gas, then simulate → send → waitForReceipt; throw ChainError with appropriate code on failure.

**ADR-0020:** Build multicall payload (via tx-builder) → `publicClient.simulateContract(txRequest)` → on success `walletClient.writeContract(request)` → `publicClient.waitForTransactionReceipt({ hash })`. On simulation revert throw ChainError `SIMULATION_FAILED`; on receipt status reverted throw `TX_REVERTED`.

**Current `src/lib/chain/index.ts`:** After Batch 1 merge it already exports errors, gas, tx-builder. Add export for `./tx-sender` (e.g. `export { ... } from "./tx-sender"`).

**Verification (run before committing):**

```bash
pnpm typecheck && pnpm test:run src/lib/chain/ && pnpm biome check .
```

**Commit message:** `feat(chain): tx-sender simulate → send → waitForReceipt`

---

### Merge, verify, cleanup

```bash
wt_merge_batch 2
wt_verify_batch 2
wt_cleanup_batch 2
```

If merge conflicts on `src/lib/chain/index.ts`: keep all existing exports and add the tx-sender export line.

---

## Batch 3–4 (on main)

After Batch 2 is merged and verified:

- **Batch 3:** Run the code-reviewer subagent on the changed files.
- **Batch 4:** Move the plan to implemented: create `implemented/0002-on-chain-pivot/01-mvp-execution/0001-transaction-lifecycle/`, move the plan directory (or `plan.md`) there, remove from `active/`, verify deletion per plan lifecycle rules.

---

## Conflict Resolution

- **index.ts:** Batches 1 and 2 both modify it. Merge Batch 1 first. When merging Batch 2, resolve by keeping Batch 1's new exports and adding the tx-sender export. Final index should re-export: health, constants, client, health, errors, gas, tx-builder, tx-sender.
- **Other files:** No overlap; each batch owns disjoint directories plus index.ts.
