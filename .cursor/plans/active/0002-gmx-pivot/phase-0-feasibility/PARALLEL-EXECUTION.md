# Phase 0 Parallel Execution Plan

> Operationalizes [META-PLAN.md](./META-PLAN.md) into concrete sub-agent batches for Cursor.
> Each batch launches up to 4 parallel sub-agents. Batches execute sequentially (Batch N+1 starts only after Batch N completes).

## Constraints

- **Max 4 concurrent sub-agents** per Cursor message
- Sub-agents in the same batch **cannot read each other's output** — they run simultaneously
- Each sub-agent needs a **self-contained prompt** with all context (no conversation history)
- After each batch, the main agent merges worktrees into main before launching the next batch

---

## Git Worktree Strategy

Each sub-agent operates in its own **git worktree** on an isolated branch. This provides:

- **True isolation** — agents cannot accidentally overwrite each other's files
- **Clean history** — each agent's work is one merge commit on main
- **PR-style merges** — first-done merges first; later merges resolve conflicts against updated main
- **Rollback safety** — any individual agent's work can be dropped without affecting others

### Worktree Config

All paths, branch names, batch definitions, and helper functions are centralized in
[`worktree-config.sh`](./worktree-config.sh). Source it before running any batch commands:

```bash
source .cursor/plans/active/0002-gmx-pivot/phase-0-feasibility/worktree-config.sh
```

Key variables defined in the config:

| Variable | Value |
|----------|-------|
| `REPO` | `/Users/aki/Documents/Personal/Code/funding-rate-arb/funding-rate-arb-bot` |
| `WORKTREE_ROOT` | `/Users/aki/Documents/Personal/Code/funding-rate-arb/worktrees` |
| `BRANCH_PREFIX` | `phase0` |

Helper functions:

| Function | Description |
|----------|-------------|
| `wt_setup_batch <N>` | Create worktrees for batch N (1–4) |
| `wt_merge_batch <N>` | Merge all batch N branches into main |
| `wt_cleanup_batch <N>` | Remove worktrees and delete branches |
| `wt_verify_batch <N>` | Run typecheck + tests + biome on main |
| `wt_list` | Show current worktrees and phase0 branches |
| `wt_final_cleanup` | Verify no stale worktrees/branches remain |

### Directory Layout

```
funding-rate-arb/
├── funding-rate-arb-bot/          # Main worktree (main branch)
└── worktrees/                     # Sibling directory for agent worktrees
    ├── batch1-deps/               # Agent 1a worktree
    ├── batch1-env/                # Agent 1b worktree
    ├── batch1-db/                 # Agent 1c worktree
    ├── batch2-chain/              # Agent 2a worktree
    ├── batch2-gmx/                # Agent 2b worktree
    ├── batch3-collector/          # Agent 3a worktree
    ├── batch3-sampler/            # Agent 3b worktree
    └── batch4-analysis/           # Agent 4a worktree
```

### Worktree Lifecycle

Using the helper functions from `worktree-config.sh`:

```bash
source .cursor/plans/active/0002-gmx-pivot/phase-0-feasibility/worktree-config.sh

# ── SETUP (before each batch) ──────────────────────────────────────────
wt_setup_batch 1        # Creates worktrees + branches for all agents in batch 1

# ── WORK ───────────────────────────────────────────────────────────────
# Each sub-agent receives the worktree path as its project directory:
#   Project: $WORKTREE_ROOT/<name>
# Agent makes changes, commits on its branch.

# ── MERGE (after batch completes) ─────────────────────────────────────
wt_merge_batch 1        # Merges each branch into main with --no-ff

# ── VERIFY ─────────────────────────────────────────────────────────────
wt_verify_batch 1       # Runs typecheck + tests + biome

# ── CLEANUP ────────────────────────────────────────────────────────────
wt_cleanup_batch 1      # Removes worktrees + deletes branches

# ── NEXT BATCH ─────────────────────────────────────────────────────────
wt_setup_batch 2        # Repeat for next batch
```

<details>
<summary>Manual worktree commands (if not using helpers)</summary>

```bash
REPO="/Users/aki/Documents/Personal/Code/funding-rate-arb/funding-rate-arb-bot"
WORKTREE_ROOT="/Users/aki/Documents/Personal/Code/funding-rate-arb/worktrees"

# ── SETUP ──────────────────────────────────────────────────────────────
mkdir -p "$WORKTREE_ROOT"
cd "$REPO"
git worktree add "$WORKTREE_ROOT/<name>" -b "phase0/<name>"

# ── MERGE ──────────────────────────────────────────────────────────────
cd "$REPO" && git checkout main
git merge "phase0/<name>" --no-ff -m "feat(phase0): <description>"

# ── CLEANUP ────────────────────────────────────────────────────────────
git worktree remove "$WORKTREE_ROOT/<name>"
git branch -d "phase0/<name>"
```

</details>

### Merge Order Rules

1. **Within a batch**: Agents write to non-overlapping files, so merge order rarely matters. Merge in whatever order agents finish.
2. **Between batches**: Batch N must be fully merged into main before Batch N+1 worktrees are created (they branch from updated main).
3. **First-done-first-merged**: If Agent 2a finishes before Agent 2b, merge 2a first. Agent 2b's merge then applies on top.

### Conflict Resolution

If `git merge` reports conflicts:

```bash
# 1. See what conflicted
git diff --name-only --diff-filter=U

# 2. Open conflicted files and resolve manually
#    - Keep both sides if they touch different sections (most common)
#    - If same section: prefer the agent that owns the file (see File Ownership Matrix)
#    - If imports conflict: combine both import sets

# 3. Mark resolved and complete merge
git add <resolved-files>
git merge --continue

# 4. If merge is unsalvageable, abort and try the other agent first
git merge --abort
git merge "phase0/<other-agent>" --no-ff -m "..."
# Then retry the problematic agent's merge
```

**Expected conflict scenarios:**
- `package.json` / `pnpm-lock.yaml` — Agent 1a (deps) may conflict with agents that also run `pnpm`. Resolution: accept the lockfile from the last merge, then run `pnpm install` to reconcile.
- `src/lib/db/schema.ts` — Agent 1c appends tables. If another agent also appends, combine both additions.
- Cross-batch conflicts are **impossible** since each batch merges before the next batch starts.

### Commit Message Convention

Each merge commit follows the project's conventional commit format:

```
feat(phase0): <scope> — <description>

Plan: 0001-chain-infrastructure / 0002-data-collector / 0003-impact-sampler
Batch: <N>, Agent: <id>
```

Examples:
- `feat(phase0): install viem and @gmx-io/sdk dependencies`
- `feat(phase0): add Arbitrum/GMX env schema and config`
- `feat(phase0): add market_snapshot and execution_estimate tables`
- `feat(phase0): chain infrastructure — viem clients and RPC health`
- `feat(phase0): GMX adapter — contracts, REST client, Reader helpers`
- `feat(phase0): data collector service with scheduler`
- `feat(phase0): impact sampler with simulateExecuteOrder`
- `feat(phase0): impact distribution metrics and go/no-go check`

---

## Batch Overview

```
 ┌─ git worktree add: batch1-deps, batch1-env, batch1-db ─────────┐

Batch 1 ─── Foundation (3 parallel worktrees) ──── ~2 min
  ├── Agent 1a: shell         → worktrees/batch1-deps/ → install viem + @gmx-io/sdk
  ├── Agent 1b: generalPurpose → worktrees/batch1-env/  → env schema update
  └── Agent 1c: generalPurpose → worktrees/batch1-db/   → DB schema tables

  ┌─ merge: 1a → main, 1b → main, 1c → main ─────────────────────┐
  ┌─ verify: deps installed, env compiles, migration OK ───────────┐
  ┌─ cleanup: remove worktrees + branches ─────────────────────────┐

 ┌─ git worktree add: batch2-chain, batch2-gmx ───────────────────┐

Batch 2 ─── Chain + GMX Read Layer (2 parallel worktrees) ─ ~10 min
  ├── Agent 2a: generalPurpose → worktrees/batch2-chain/ → src/lib/chain/*
  └── Agent 2b: generalPurpose → worktrees/batch2-gmx/   → src/adapters/gmx/*

  ┌─ merge: 2a → main, 2b → main ────────────────────────────────┐
  ┌─ verify: typecheck + tests pass ──────────────────────────────┐
  ┌─ cleanup: remove worktrees + branches ────────────────────────┐

 ┌─ git worktree add: batch3-collector, batch3-sampler ───────────┐

Batch 3 ─── Consumer Services (2 parallel worktrees) ────── ~10 min
  ├── Agent 3a: generalPurpose → worktrees/batch3-collector/ → data collector
  └── Agent 3b: generalPurpose → worktrees/batch3-sampler/   → impact sampler

  ┌─ merge: 3a → main, 3b → main ────────────────────────────────┐
  ┌─ verify: typecheck + tests pass ──────────────────────────────┐
  ┌─ cleanup: remove worktrees + branches ────────────────────────┐

 ┌─ git worktree add: batch4-analysis ────────────────────────────┐

Batch 4 ─── Analysis Layer (1 worktree) ─────────── ~5 min
  └── Agent 4a: generalPurpose → worktrees/batch4-analysis/ → metrics + go/no-go

  ┌─ merge: 4a → main ───────────────────────────────────────────┐
  ┌─ verify: typecheck + tests pass ──────────────────────────────┐
  ┌─ cleanup: remove worktree + branch ───────────────────────────┐

Batch 5 ─── Quality Gate (3 parallel, main worktree) ── ~2 min
  ├── Agent 5a: code-reviewer      → main worktree (read-only)
  ├── Agent 5b: typescript-checker  → main worktree (read-only)
  └── Agent 5c: biome-checker      → main worktree (read-only)

  ┌─ fix any issues on main, re-run quality gate if needed ───────┐
```

---

## Batch 1 — Foundation (3 Parallel Agents)

No dependencies. All three write to different files.

### Worktree Setup

```bash
source .cursor/plans/active/0002-gmx-pivot/phase-0-feasibility/worktree-config.sh
wt_setup_batch 1
```

### Agent 1a: Install Dependencies

- **Type**: `shell`
- **Worktree**: `worktrees/batch1-deps/`
- **Branch**: `phase0/batch1-deps`
- **Files touched**: `package.json`, `pnpm-lock.yaml`

```
Prompt:

In the project at /Users/aki/Documents/Personal/Code/funding-rate-arb/worktrees/batch1-deps,
install two npm packages using pnpm:

  pnpm add viem @gmx-io/sdk

After installation, verify both packages appear in package.json dependencies.
Report the installed versions.
Commit the changes: git add -A && git commit -m "feat(phase0): install viem and @gmx-io/sdk dependencies"
```

### Agent 1b: Environment Schema Update

- **Type**: `generalPurpose`
- **Worktree**: `worktrees/batch1-env/`
- **Branch**: `phase0/batch1-env`
- **Files touched**: `src/lib/env/schema.ts`, `src/lib/config.ts`
- **No file conflicts** with Agent 1a or 1c

```
Prompt:

Project: /Users/aki/Documents/Personal/Code/funding-rate-arb/worktrees/batch1-env

TASK: Update the environment schema to add Arbitrum/GMX environment variables for Phase 0 chain infrastructure.

CRITICAL RULES (from CODE_GUIDELINES.md):
- Use const arrow functions, never function declarations
- Use Valibot for all validation (import * as v from "valibot")
- Never use `any` — use `unknown` with Valibot validation
- Never use type casts (`as Type`)
- Explicit return types on all exports
- No .js extensions in imports
- Use @/ path alias for cross-directory imports

CURRENT FILES TO MODIFY:

1. src/lib/env/schema.ts — Current content:

  import * as v from "valibot";
  import { logLevelSchema } from "../logger/schema";

  export const envSchema = v.object({
    DATABASE_URL: v.pipe(v.string(), v.minLength(1)),
    PORT: v.pipe(v.string(), v.transform(Number), v.number(), v.minValue(1), v.maxValue(65535)),
    NODE_ENV: v.picklist(["development", "production", "test"]),
    LOG_LEVEL: v.optional(v.pipe(v.string(), logLevelSchema)),
    COINBASE_API_KEY: v.optional(v.string()),
    COINBASE_API_SECRET: v.optional(v.string()),
  });

  export type Env = v.InferOutput<typeof envSchema>;

  ADD these fields to the envSchema object:
  - ARBITRUM_RPC_URL: required string, minLength(1) — Arbitrum JSON-RPC endpoint
  - ARBITRUM_PRIVATE_KEY: optional string — wallet key for simulation (Phase 0 impact sampler)
  - ARBITRUM_CHAIN_ID: optional string, transform to number, default 42161 — chain ID (42161 mainnet, 421614 testnet)
  - GMX_ORACLE_URL: optional string with default "https://arbitrum-api.gmxinfra.io" — GMX REST API base URL

2. src/lib/config.ts — Current content:

  import { env } from "./env/env";

  export const config = {
    database: { url: env.DATABASE_URL },
    server: { port: env.PORT, nodeEnv: env.NODE_ENV },
    logging: { level: env.LOG_LEVEL ?? (env.NODE_ENV === "production" ? "info" : "debug") },
  } as const;

  ADD a new `chain` section:
  chain: {
    rpcUrl: env.ARBITRUM_RPC_URL,
    privateKey: env.ARBITRUM_PRIVATE_KEY,
    chainId: env.ARBITRUM_CHAIN_ID,
    gmxOracleUrl: env.GMX_ORACLE_URL,
  },

3. Update .env.example if it exists — add the new variables with comments.

After making changes, run: pnpm biome check --write .
Then run: pnpm typecheck
Fix any errors before completing.
Commit the changes: git add -A && git commit -m "feat(phase0): add Arbitrum/GMX env schema and config"
```

### Agent 1c: Database Schema

- **Type**: `generalPurpose`
- **Worktree**: `worktrees/batch1-db/`
- **Branch**: `phase0/batch1-db`
- **Files touched**: `src/lib/db/schema.ts` (append only — does not modify existing `orders` table)
- **No file conflicts** with Agent 1a or 1b

```
Prompt:

Project: /Users/aki/Documents/Personal/Code/funding-rate-arb/worktrees/batch1-db

TASK: Add two new database tables for Phase 0 data collection: market_snapshot and execution_estimate.

CRITICAL RULES (from CODE_GUIDELINES.md):
- Use const arrow functions, never function declarations
- Use bigint mode for all financial amounts
- Column names in snake_case
- File names in kebab-case
- No .js extensions in imports

CURRENT DB SCHEMA at src/lib/db/schema.ts:

  import { bigint, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

  export const orders = pgTable(
    "orders",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      exchange: text("exchange").notNull(),
      symbol: text("symbol").notNull(),
      side: text("side").notNull(),
      type: text("type").notNull(),
      quantityBase: bigint("quantity_base", { mode: "bigint" }).notNull(),
      priceQuote: bigint("price_quote", { mode: "bigint" }),
      status: text("status").notNull(),
      exchangeOrderId: text("exchange_order_id"),
      idempotencyKey: text("idempotency_key"),
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    },
    (table) => ({
      exchangeOrderIdIdx: index("idx_orders_exchange_order_id").on(table.exchangeOrderId),
      idempotencyKeyIdx: index("idx_orders_idempotency_key").on(table.idempotencyKey),
    }),
  );

APPEND (do NOT modify the existing `orders` table) these two tables per ADR-0022:

1. market_snapshot — hourly market data snapshots:
  - id: uuid, primary key, defaultRandom
  - ts: timestamp with timezone, notNull — snapshot timestamp
  - market: text, notNull — market contract address (e.g. "0x...")
  - marketName: text("market_name"), notNull — human-readable (e.g. "ETH/USD")
  - price: bigint("price", mode: "bigint"), notNull — market price in USD (30-decimal GMX precision)
  - longFundingRate: bigint("long_funding_rate", mode: "bigint"), notNull — funding rate (bps/hr scaled)
  - shortFundingRate: bigint("short_funding_rate", mode: "bigint"), notNull
  - longOpenInterestUsd: bigint("long_open_interest_usd", mode: "bigint"), notNull
  - shortOpenInterestUsd: bigint("short_open_interest_usd", mode: "bigint"), notNull
  - borrowRateLong: bigint("borrow_rate_long", mode: "bigint"), notNull
  - borrowRateShort: bigint("borrow_rate_short", mode: "bigint"), notNull
  - oiSkewRatio: bigint("oi_skew_ratio", mode: "bigint") — optional, derived
  - gasPriceGwei: bigint("gas_price_gwei", mode: "bigint") — optional, gas at snapshot time
  - createdAt: timestamp("created_at", withTimezone).defaultNow()
  Indexes: composite on (market, ts) for time-series queries

2. execution_estimate — impact sampler results:
  - id: uuid, primary key, defaultRandom
  - ts: timestamp with timezone, notNull — simulation timestamp
  - market: text, notNull — market contract address
  - sizeUsd: bigint("size_usd", mode: "bigint"), notNull — simulated order size (30-decimal)
  - simulatedImpactBps: bigint("simulated_impact_bps", mode: "bigint"), notNull — price impact in basis points
  - estimatedGasUsd: bigint("estimated_gas_usd", mode: "bigint") — gas cost estimate
  - acceptablePrice: bigint("acceptable_price", mode: "bigint") — execution price from simulation
  - createdAt: timestamp("created_at", withTimezone).defaultNow()
  Indexes: composite on (market, ts) for time-series queries

You may need to add additional imports from drizzle-orm/pg-core (e.g. `numeric` if needed,
but prefer bigint for all financial values).

After making changes, run: pnpm biome check --write .
Then run: pnpm typecheck
Fix any errors before completing.

Generate a Drizzle migration if drizzle-kit is configured:
  pnpm drizzle-kit generate

If drizzle-kit generate fails, that's OK — just ensure the schema.ts file is correct.
Commit the changes: git add -A && git commit -m "feat(phase0): add market_snapshot and execution_estimate tables"
```

### Batch 1 Merge + Verification (Main Agent)

After all three agents complete, merge into main in completion order:

```bash
# Source config if not already loaded
source .cursor/plans/active/0002-gmx-pivot/phase-0-feasibility/worktree-config.sh

wt_merge_batch 1          # Merges deps → env → db into main

# If any merge conflicts on pnpm-lock.yaml (1b or 1c ran pnpm):
#   Accept theirs, then: pnpm install && git add pnpm-lock.yaml && git merge --continue

wt_verify_batch 1         # pnpm install + typecheck + biome check
wt_cleanup_batch 1        # Remove worktrees + delete branches
```

---

## Batch 2 — Chain + GMX Read Layer (2 Parallel Agents)

Depends on Batch 1 (deps installed, env schema exists). Agents write to separate directories.

### Worktree Setup

```bash
wt_setup_batch 2
```

### Agent 2a: Chain Infrastructure (`src/lib/chain/`)

- **Type**: `generalPurpose`
- **Worktree**: `worktrees/batch2-chain/`
- **Branch**: `phase0/batch2-chain`
- **Files created**: `src/lib/chain/constants.ts`, `src/lib/chain/client.ts`, `src/lib/chain/health.ts`, `src/lib/chain/index.ts`, `src/lib/chain/client.test.ts`, `src/lib/chain/health.test.ts`
- **No file conflicts** with Agent 2b

```
Prompt:

Project: /Users/aki/Documents/Personal/Code/funding-rate-arb/worktrees/batch2-chain

TASK: Create the Arbitrum chain client infrastructure at src/lib/chain/. This provides
viem public and wallet clients for RPC reads, plus an RPC health monitor.

CRITICAL RULES (from CODE_GUIDELINES.md):
- Use const arrow functions, never function declarations
- Factory functions over classes: createX(config) not new X(config)
- Valibot for all runtime validation (import * as v from "valibot")
- Never use `any` — use `unknown` with Valibot
- Never use type casts (`as Type`)
- Explicit return types on all exports
- No .js extensions in imports
- Use @/ path alias for cross-directory imports
- BigInt for all financial/chain values — variable names with unit suffixes
- Tests colocated as *.test.ts, use vitest (describe/it/expect/vi)
- SCREAMING_SNAKE_CASE for constants
- camelCase for functions/variables
- PascalCase for types

REFERENCES:
- ADR-0020: Use viem for all chain interaction. Use @gmx-io/sdk for ABIs/utils only,
  NOT for transaction management. Use BATCH_CONFIGS from SDK for multicall batching.
- ADR-0024: RPC used for positions, balances, gas, health. Polling intervals: gas 10s.
- Existing env: config.chain.rpcUrl, config.chain.privateKey, config.chain.chainId
  (from src/lib/config.ts, added in a prior step)

CREATE THESE FILES:

1. src/lib/chain/constants.ts
  - ARBITRUM_CHAIN_ID = 42161 (mainnet), ARBITRUM_TESTNET_CHAIN_ID = 421614
  - DEFAULT_BLOCK_STALE_THRESHOLD_SEC = 60n (block older than this = unhealthy)
  - Import `arbitrum` chain from viem/chains
  - Export chain config constants

2. src/lib/chain/client.ts
  - createArbitrumPublicClient(rpcUrl: string): PublicClient
    - Uses viem's createPublicClient with http transport
    - Chain: arbitrum from viem/chains
    - Enable multicall batching (batch: { multicall: true })
  - createArbitrumWalletClient(rpcUrl: string, privateKey: string): WalletClient
    - Uses viem's createWalletClient with http transport
    - Uses privateKeyToAccount from viem/accounts
    - Chain: arbitrum
  - Both functions should accept the rpcUrl parameter (not read from env directly)
    to keep them pure and testable.

3. src/lib/chain/health.ts
  - RpcHealthStatus type: { status: "healthy" | "unhealthy"; blockNumber: bigint; blockAgeSec: bigint; chainId: number; error?: string }
  - checkRpcHealth(client: PublicClient): Promise<RpcHealthStatus>
    - Fetches latest block, computes age
    - Returns "unhealthy" if block age > threshold or on any error
    - Catches errors gracefully, returns unhealthy status with error message

4. src/lib/chain/index.ts — barrel exports:
  - Export everything from constants, client, health
  - Export types

5. src/lib/chain/client.test.ts — unit tests:
  - Test createArbitrumPublicClient returns a client object
  - Test createArbitrumWalletClient returns a client with account
  - Mock viem functions (vi.mock("viem"), vi.mock("viem/accounts"))

6. src/lib/chain/health.test.ts — unit tests:
  - Test checkRpcHealth returns healthy for valid block
  - Test checkRpcHealth returns unhealthy for stale block
  - Test checkRpcHealth returns unhealthy on RPC error
  - Mock the PublicClient methods

After creating all files:
  pnpm biome check --write src/lib/chain/
  pnpm typecheck
  pnpm test:run src/lib/chain/

Fix any errors before completing.
Commit the changes: git add -A && git commit -m "feat(phase0): chain infrastructure — viem clients and RPC health"
```

### Agent 2b: GMX Adapter — Contracts + Reader + REST (`src/adapters/gmx/`)

- **Type**: `generalPurpose`
- **Worktree**: `worktrees/batch2-gmx/`
- **Branch**: `phase0/batch2-gmx`
- **Files created**: `src/adapters/gmx/contracts.ts`, `src/adapters/gmx/rest.ts`, `src/adapters/gmx/reader.ts`, `src/adapters/gmx/schemas.ts`, `src/adapters/gmx/index.ts`, `src/adapters/gmx/rest.test.ts`, `src/adapters/gmx/reader.test.ts`
- **No file conflicts** with Agent 2a

```
Prompt:

Project: /Users/aki/Documents/Personal/Code/funding-rate-arb/worktrees/batch2-gmx

TASK: Create the GMX v2 adapter at src/adapters/gmx/. This provides contract addresses,
REST API helpers (tickers, markets info), and Reader contract read helpers for market data.
Phase 0 scope: reads only, no writes/transactions.

CRITICAL RULES (from CODE_GUIDELINES.md):
- Use const arrow functions, never function declarations
- Factory functions over classes
- Valibot for all runtime validation (import * as v from "valibot")
- Never use `any` — use `unknown` with Valibot
- Never use type casts (`as Type`)
- Explicit return types on all exports
- No .js extensions in imports
- Use @/ path alias (e.g. import { createArbitrumPublicClient } from "@/lib/chain")
- BigInt for all financial values — GMX uses 30-decimal precision for USD values
- Tests colocated as *.test.ts, use vitest

IMPORTANT IMPORTS FROM CHAIN MODULE (being created in parallel — use these exact paths):
- import { createArbitrumPublicClient } from "@/lib/chain"
- The PublicClient type comes from "viem"

REFERENCES:
- ADR-0020: Use @gmx-io/sdk for ABIs, types, utilities. Do NOT use GmxSdk class for
  transaction management. Use raw viem for reads.
- ADR-0024: REST for market data (tickers, funding, OI). RPC for positions, balances.
- GMX REST endpoints: /prices/tickers, /markets/info (from GMX oracle URL)

IMPORTANT: Check what @gmx-io/sdk actually exports before using it. The SDK may export
contract addresses, ABIs, and utility functions. Use the Context7 MCP or explore
node_modules/@gmx-io/sdk to discover the exact API. If the SDK doesn't export what you
need, define contract addresses manually for Arbitrum One.

CREATE THESE FILES:

1. src/adapters/gmx/contracts.ts
  - GMX_CONTRACTS constant object with addresses for Arbitrum One (chain ID 42161):
    - dataStore, reader, exchangeRouter, orderHandler, depositHandler, withdrawalHandler
    - MARKET_LIST_KEY (bytes32 hash for DataStore market list)
  - Try importing from @gmx-io/sdk first. If SDK doesn't export addresses directly,
    hardcode the known Arbitrum One addresses (document source in comments).
  - Export market addresses: ETH_USD_MARKET, BTC_USD_MARKET

2. src/adapters/gmx/schemas.ts — Valibot schemas for REST API responses:
  - TickerSchema: { tokenSymbol: string, tokenAddress: string, minPrice: bigint (parsed from string), maxPrice: bigint }
  - MarketInfoSchema: { marketAddress: string, marketName: string, longFundingRate: bigint, shortFundingRate: bigint, longOpenInterestUsd: bigint, shortOpenInterestUsd: bigint, borrowRateLong: bigint, borrowRateShort: bigint }
  - Note: GMX REST returns numbers as strings — use v.pipe(v.string(), v.transform(BigInt)) pattern

3. src/adapters/gmx/rest.ts — REST API client:
  - fetchGmxTickers(oracleUrl: string): Promise<Ticker[]>
    - GET ${oracleUrl}/prices/tickers
    - Parse response with Valibot TickerSchema array
  - fetchGmxMarketsInfo(oracleUrl: string): Promise<MarketInfo[]>
    - GET ${oracleUrl}/markets/info (may need query params for chain)
    - Parse response with Valibot MarketInfoSchema array
  - Use native fetch (no axios). Handle errors with try/catch.

4. src/adapters/gmx/reader.ts — Reader contract helpers (via viem):
  - readMarketCount(client: PublicClient): Promise<bigint>
    - Read DataStore.getAddressCount(MARKET_LIST_KEY)
  - readMarketAddresses(client: PublicClient, count: bigint): Promise<string[]>
    - Read DataStore.getAddressValuesAt(MARKET_LIST_KEY, 0, count)
  - These use client.readContract() with ABIs from @gmx-io/sdk (or manually defined if SDK doesn't export them)

5. src/adapters/gmx/index.ts — barrel exports

6. src/adapters/gmx/rest.test.ts — unit tests:
  - Mock global fetch
  - Test fetchGmxTickers parses valid response
  - Test fetchGmxTickers handles empty response
  - Test fetchGmxTickers handles network error
  - Test fetchGmxMarketsInfo parses funding rates and OI

7. src/adapters/gmx/reader.test.ts — unit tests:
  - Mock viem PublicClient.readContract
  - Test readMarketCount returns bigint
  - Test readMarketAddresses returns array

After creating all files:
  pnpm biome check --write src/adapters/gmx/
  pnpm typecheck
  pnpm test:run src/adapters/gmx/

Fix any errors before completing. If @gmx-io/sdk types/ABIs are not what you expected,
adapt — the key deliverable is working REST + contract read helpers.
Commit the changes: git add -A && git commit -m "feat(phase0): GMX adapter — contracts, REST client, Reader helpers"
```

### Batch 2 Merge + Verification (Main Agent)

```bash
wt_merge_batch 2          # Merges chain → gmx into main
# NOTE: 2b imports from @/lib/chain (created by 2a). After both merge, imports resolve.

wt_verify_batch 2         # typecheck + test chain/ + gmx/ + biome
wt_cleanup_batch 2
```

---

## Batch 3 — Consumer Services (2 Parallel Agents)

Depends on Batch 2 (chain clients + GMX reader/REST exist). Agents write to separate directories.

### Worktree Setup

```bash
wt_setup_batch 3
```

### Agent 3a: Data Collector Service

- **Type**: `generalPurpose`
- **Worktree**: `worktrees/batch3-collector/`
- **Branch**: `phase0/batch3-collector`
- **Files created**: `src/worker/data-collector.ts`, `src/worker/data-collector.test.ts`
- **Files modified**: potentially `src/worker/` index or registration

```
Prompt:

Project: /Users/aki/Documents/Personal/Code/funding-rate-arb/worktrees/batch3-collector

TASK: Create the Phase 0 data collector service that polls GMX REST API and RPC
for market data and persists it to the market_snapshot table.

CRITICAL RULES (from CODE_GUIDELINES.md):
- Use const arrow functions, never function declarations
- Factory functions: createDataCollector(deps) not new DataCollector()
- Valibot for validation
- Never use `any` or type casts
- Explicit return types on exports
- BigInt for all financial values
- Tests colocated as *.test.ts

AVAILABLE MODULES (already implemented):

1. Chain client:
  import { createArbitrumPublicClient } from "@/lib/chain"

2. GMX REST:
  import { fetchGmxTickers, fetchGmxMarketsInfo } from "@/adapters/gmx"
  - fetchGmxTickers(oracleUrl: string): Promise<Ticker[]>
  - fetchGmxMarketsInfo(oracleUrl: string): Promise<MarketInfo[]>
  Types: Ticker { tokenSymbol, tokenAddress, minPrice: bigint, maxPrice: bigint }
  MarketInfo { marketAddress, marketName, longFundingRate: bigint, shortFundingRate: bigint,
    longOpenInterestUsd: bigint, shortOpenInterestUsd: bigint, borrowRateLong: bigint, borrowRateShort: bigint }

3. Database:
  import { db } from "@/lib/db/client"
  Tables (from src/lib/db/schema.ts):
  - marketSnapshots: ts, market, marketName, price, longFundingRate, shortFundingRate,
    longOpenInterestUsd, shortOpenInterestUsd, borrowRateLong, borrowRateShort,
    oiSkewRatio, gasPriceGwei
  Import: import { marketSnapshots } from "@/lib/db/schema"

4. Scheduler (from src/worker/scheduler.ts):
  import { createScheduler } from "@/worker/scheduler"
  Interface: scheduler.schedule({ id, fn, intervalMs, enabled })

5. Config:
  import { config } from "@/lib/config"
  config.chain.rpcUrl, config.chain.gmxOracleUrl

6. Logger:
  import { logger } from "@/lib/logger"

CREATE THESE FILES:

1. src/worker/data-collector.ts
  - createDataCollector(deps: DataCollectorDeps): DataCollector
    - deps: { db: Database, gmxOracleUrl: string, publicClient: PublicClient, logger: Logger }
  - DataCollector interface: { start(): void, stop(): void }
  - collectMarketSnapshot(): fetches GMX markets info + gas price, inserts market_snapshot row
    - Fetch markets info via fetchGmxMarketsInfo
    - Fetch gas price via publicClient.getGasPrice()
    - For each market (ETH/USD, BTC/USD): compute oiSkewRatio, insert row
  - collectGasPrice(): polls eth_gasPrice, can be stored in snapshot or logged
  - Use scheduler to run collectMarketSnapshot every 60 seconds (configurable)
  - Error handling: log + continue (don't crash on single poll failure)

2. src/worker/data-collector.test.ts
  - Mock db, fetchGmxMarketsInfo, publicClient.getGasPrice
  - Test collectMarketSnapshot inserts correct rows
  - Test handles API errors gracefully
  - Test scheduler integration (fn called at interval)

After creating files:
  pnpm biome check --write src/worker/
  pnpm typecheck
  pnpm test:run src/worker/data-collector.test.ts

Fix any errors before completing.
Commit the changes: git add -A && git commit -m "feat(phase0): data collector service with scheduler"
```

### Agent 3b: Impact Sampler

- **Type**: `generalPurpose`
- **Worktree**: `worktrees/batch3-sampler/`
- **Branch**: `phase0/batch3-sampler`
- **Files created**: `src/worker/impact-sampler.ts`, `src/worker/impact-sampler.test.ts`

```
Prompt:

Project: /Users/aki/Documents/Personal/Code/funding-rate-arb/worktrees/batch3-sampler

TASK: Create the Phase 0 impact sampler that runs simulateExecuteOrder for $50k
short perp orders on ETH/USD and BTC/USD markets, recording impact bps to the
execution_estimate table.

CRITICAL RULES (from CODE_GUIDELINES.md):
- Use const arrow functions, never function declarations
- Factory functions: createImpactSampler(deps) not new ImpactSampler()
- Valibot for validation
- Never use `any` or type casts
- Explicit return types on exports
- BigInt for all financial values with unit suffixes (sizeUsd, impactBps, gasPriceGwei)
- Tests colocated as *.test.ts

AVAILABLE MODULES (already implemented):

1. Chain clients:
  import { createArbitrumPublicClient, createArbitrumWalletClient } from "@/lib/chain"

2. GMX contracts:
  import { GMX_CONTRACTS, ETH_USD_MARKET, BTC_USD_MARKET } from "@/adapters/gmx"

3. Database:
  import { db } from "@/lib/db/client"
  Table (from src/lib/db/schema.ts):
  - executionEstimates: ts, market, sizeUsd (bigint), simulatedImpactBps (bigint),
    estimatedGasUsd (bigint), acceptablePrice (bigint)
  Import: import { executionEstimates } from "@/lib/db/schema"

4. Scheduler:
  import { createScheduler } from "@/worker/scheduler"

5. Config:
  import { config } from "@/lib/config"
  config.chain.rpcUrl, config.chain.privateKey

6. Logger:
  import { logger } from "@/lib/logger"

CONTEXT — How GMX order simulation works:
- GMX v2 uses the ExchangeRouter for order creation, but simulation can be done via
  the Reader contract or by using eth_call with ExchangeRouter.createOrder() without
  actually submitting the transaction.
- The simulation returns execution price and price impact.
- Impact bps = |executionPrice - marketPrice| / marketPrice * 10000
- Use @gmx-io/sdk utilities if available, otherwise build the simulation call manually
  using viem's simulateContract or a raw eth_call.
- For Phase 0, we only simulate — no actual orders are submitted.
- If direct simulation is not straightforward, use the Reader contract's
  getExecutionPrice or similar method to estimate impact.

CREATE THESE FILES:

1. src/worker/impact-sampler.ts
  - SAMPLE_SIZE_USD = 50_000n * 10n**30n (GMX 30-decimal USD precision)
  - TARGET_MARKETS = [ETH_USD_MARKET, BTC_USD_MARKET]

  - createImpactSampler(deps: ImpactSamplerDeps): ImpactSampler
    - deps: { db: Database, publicClient: PublicClient, walletClient: WalletClient,
              gmxOracleUrl: string, logger: Logger }
  - ImpactSampler interface: { start(): void, stop(): void, sampleOnce(): Promise<void> }

  - simulateImpact(market: string, sizeUsd: bigint): Promise<ImpactResult>
    - ImpactResult: { simulatedImpactBps: bigint, estimatedGasUsd: bigint, acceptablePrice: bigint }
    - Simulate a short perp order of sizeUsd on the given market
    - Calculate impact bps from execution price vs market price
    - If simulation is not directly available, estimate using Reader contract price impact functions

  - sampleOnce(): runs simulateImpact for each TARGET_MARKET, inserts execution_estimate rows

  - Use scheduler to run sampleOnce every 5-15 minutes (configurable via constant)

  - Error handling: log + continue per market (don't stop sampling if one market fails)

2. src/worker/impact-sampler.test.ts
  - Mock db, publicClient, walletClient
  - Test simulateImpact calculates impact bps correctly
  - Test sampleOnce inserts rows for both markets
  - Test handles simulation errors gracefully (logs, continues to next market)
  - Test impact bps calculation: given marketPrice and executionPrice, verify bps formula

After creating files:
  pnpm biome check --write src/worker/
  pnpm typecheck
  pnpm test:run src/worker/impact-sampler.test.ts

Fix any errors before completing.
Commit the changes: git add -A && git commit -m "feat(phase0): impact sampler with simulateExecuteOrder"
```

### Batch 3 Merge + Verification (Main Agent)

```bash
wt_merge_batch 3          # Merges collector → sampler into main
# Possible conflict: if both agents modified src/worker/index.ts barrel file
# Resolution: combine both export lines

wt_verify_batch 3         # typecheck + test data-collector + impact-sampler + biome
wt_cleanup_batch 3
```

---

## Batch 4 — Analysis Layer (1 Agent)

Depends on Batch 3 (impact sampler writes to execution_estimate).

### Worktree Setup

```bash
wt_setup_batch 4
```

### Agent 4a: Distribution Metrics + Go/No-Go

- **Type**: `generalPurpose`
- **Worktree**: `worktrees/batch4-analysis/`
- **Branch**: `phase0/batch4-analysis`
- **Files created**: `src/worker/impact-analysis.ts`, `src/worker/impact-analysis.test.ts`

```
Prompt:

Project: /Users/aki/Documents/Personal/Code/funding-rate-arb/worktrees/batch4-analysis

TASK: Create the impact analysis module that computes distribution metrics (median, p90)
from execution_estimate data and evaluates the Phase 0 go/no-go criteria.

CRITICAL RULES (from CODE_GUIDELINES.md):
- Use const arrow functions, never function declarations
- Valibot for validation
- Never use `any` or type casts
- Explicit return types on exports
- BigInt for financial values
- Pure functions where possible (pass data in, get results out)
- Tests colocated as *.test.ts

AVAILABLE MODULES:

1. Database:
  import { db } from "@/lib/db/client"
  import { executionEstimates } from "@/lib/db/schema"
  Table: executionEstimates (ts, market, sizeUsd, simulatedImpactBps, estimatedGasUsd, acceptablePrice)

2. Logger:
  import { logger } from "@/lib/logger"

ADR-0022 GO/NO-GO CRITERIA:
- Median impact < 3 bps at $50k notional
- p90 impact < 8 bps at $50k notional
- Both thresholds should be configurable constants

CREATE THESE FILES:

1. src/worker/impact-analysis.ts

  Constants:
  - DEFAULT_MEDIAN_THRESHOLD_BPS = 3n
  - DEFAULT_P90_THRESHOLD_BPS = 8n

  Types:
  - ImpactDistribution: { market: string, sampleCount: number, medianBps: bigint,
      p90Bps: bigint, minBps: bigint, maxBps: bigint, meanBps: bigint }
  - GoNoGoResult: { passed: boolean, markets: MarketGoNoGo[] }
  - MarketGoNoGo: { market: string, distribution: ImpactDistribution,
      medianPassed: boolean, p90Passed: boolean }

  Functions:

  - calculatePercentile(sortedValues: bigint[], percentile: number): bigint
    - Pure function. percentile is 0-100.
    - Use nearest-rank method.

  - calculateImpactDistribution(impactBpsValues: bigint[], market: string): ImpactDistribution
    - Pure function. Compute median, p90, min, max, mean from array of impact bps values.
    - Sort values, use calculatePercentile for median (50) and p90 (90).

  - getImpactDistributions(db: Database, options?: { sinceDaysAgo?: number }): Promise<ImpactDistribution[]>
    - Query execution_estimate table, group by market
    - Default: last 7 days
    - Return distribution per market

  - evaluateGoNoGo(distributions: ImpactDistribution[], thresholds?: { medianBps?: bigint, p90Bps?: bigint }): GoNoGoResult
    - Pure function. Evaluates each market against thresholds.
    - passed = all markets pass both median and p90

  - runGoNoGoCheck(db: Database): Promise<GoNoGoResult>
    - Orchestrator: fetch distributions, evaluate, log results
    - Log PASS/FAIL per market with details

2. src/worker/impact-analysis.test.ts
  - Test calculatePercentile with known sorted arrays
    - [1n, 2n, 3n, 4n, 5n] → median = 3n, p90 = 5n
    - [10n] → median = 10n, p90 = 10n
    - Empty array → handle gracefully (0n or throw)
  - Test calculateImpactDistribution computes all metrics correctly
  - Test evaluateGoNoGo passes when median < 3 and p90 < 8
  - Test evaluateGoNoGo fails when median >= 3
  - Test evaluateGoNoGo fails when p90 >= 8
  - Test evaluateGoNoGo with custom thresholds
  - Test getImpactDistributions (mock db query)

After creating files:
  pnpm biome check --write src/worker/
  pnpm typecheck
  pnpm test:run src/worker/impact-analysis.test.ts

Fix any errors before completing.
Commit the changes: git add -A && git commit -m "feat(phase0): impact distribution metrics and go/no-go check"
```

### Batch 4 Merge + Verification (Main Agent)

```bash
wt_merge_batch 4          # Merges analysis into main
wt_verify_batch 4         # typecheck + test impact-analysis + biome
wt_cleanup_batch 4
```

---

## Batch 5 — Quality Gate (3 Parallel Agents)

Final review of all Phase 0 code. **No worktrees** — runs directly on main (read-only agents).

### Agent 5a: Code Review

- **Type**: `code-reviewer`

```
Prompt:

Review all code in the following directories for CODE_GUIDELINES.md compliance:
- src/lib/chain/
- src/lib/env/
- src/lib/db/schema.ts
- src/adapters/gmx/
- src/worker/data-collector.ts
- src/worker/impact-sampler.ts
- src/worker/impact-analysis.ts

Check CODE_GUIDELINES.md in the project root and enforce all rules strictly.
```

### Agent 5b: TypeScript Check

- **Type**: `typescript-checker`

```
Prompt:

Run full TypeScript type checking on the project.
Report any type errors with file paths and line numbers.
```

### Agent 5c: Biome Check

- **Type**: `biome-checker`

```
Prompt:

Run Biome linting and formatting checks on the full project.
Report any errors with file paths and line numbers.
```

### Batch 5 Resolution (Main Agent)

Fix all reported issues, then re-run quality gate until clean.

---

## File Ownership Matrix (Conflict Prevention)

Each batch's agents write to non-overlapping files in isolated worktrees:

| Batch | Agent | Branch | Worktree | Writes To |
|-------|-------|--------|----------|-----------|
| 1 | 1a (shell) | `phase0/batch1-deps` | `worktrees/batch1-deps/` | `package.json`, `pnpm-lock.yaml` |
| 1 | 1b (env) | `phase0/batch1-env` | `worktrees/batch1-env/` | `src/lib/env/schema.ts`, `src/lib/config.ts`, `.env.example` |
| 1 | 1c (db) | `phase0/batch1-db` | `worktrees/batch1-db/` | `src/lib/db/schema.ts` |
| 2 | 2a (chain) | `phase0/batch2-chain` | `worktrees/batch2-chain/` | `src/lib/chain/*` (new directory) |
| 2 | 2b (gmx) | `phase0/batch2-gmx` | `worktrees/batch2-gmx/` | `src/adapters/gmx/*` (new directory) |
| 3 | 3a (collector) | `phase0/batch3-collector` | `worktrees/batch3-collector/` | `src/worker/data-collector.ts`, `...test.ts` |
| 3 | 3b (sampler) | `phase0/batch3-sampler` | `worktrees/batch3-sampler/` | `src/worker/impact-sampler.ts`, `...test.ts` |
| 4 | 4a (analysis) | `phase0/batch4-analysis` | `worktrees/batch4-analysis/` | `src/worker/impact-analysis.ts`, `...test.ts` |
| 5 | 5a-c | — | main worktree | Read-only (report issues only) |

No two agents in the same batch touch the same file. Worktrees provide filesystem-level isolation as a second safety layer.

---

## Estimated Timeline

| Step | What | Wall Clock | Cumulative |
|------|------|------------|------------|
| setup 1 | Create 3 worktrees | ~15 sec | ~0.5 min |
| batch 1 | 3 parallel agents | ~2 min | ~2.5 min |
| merge 1 | Merge 3 branches + verify | ~2 min | ~4.5 min |
| setup 2 | Create 2 worktrees | ~10 sec | ~5 min |
| batch 2 | 2 parallel agents | ~10 min | ~15 min |
| merge 2 | Merge 2 branches + verify | ~2 min | ~17 min |
| setup 3 | Create 2 worktrees | ~10 sec | ~17 min |
| batch 3 | 2 parallel agents | ~10 min | ~27 min |
| merge 3 | Merge 2 branches + verify | ~2 min | ~29 min |
| setup 4 | Create 1 worktree | ~5 sec | ~29 min |
| batch 4 | 1 agent | ~5 min | ~34 min |
| merge 4 | Merge 1 branch + verify | ~1 min | ~35 min |
| batch 5 | 3 parallel agents (main) | ~2 min | ~37 min |
| fix | Fix quality issues | ~5 min | ~42 min |

**Total estimated: ~42 minutes** for full Phase 0 implementation across all 3 plans.
Worktree setup/merge adds ~7 min overhead vs the non-worktree approach (~40 min), but provides
full git isolation and clean commit history.

---

## Plan-to-Agent Mapping

| Plan | Covered By | Branches | Merge Commits |
|------|-----------|----------|---------------|
| 0001: Chain Infrastructure | 1a, 1b, 2a, 2b | 4 branches | 4 merge commits |
| 0002: Data Collector | 1c, 3a | 2 branches | 2 merge commits |
| 0003: Impact Sampler | 3b, 4a | 2 branches | 2 merge commits |

**Total: 8 merge commits** on main, one per agent. Each is independently revertable.

### Git Log After Completion

```
main
├── feat(phase0): impact distribution metrics and go/no-go check      (batch4-analysis)
├── feat(phase0): impact sampler with simulateExecuteOrder             (batch3-sampler)
├── feat(phase0): data collector service with scheduler                (batch3-collector)
├── feat(phase0): GMX adapter — contracts, REST client, Reader helpers (batch2-gmx)
├── feat(phase0): chain infrastructure — viem clients and RPC health   (batch2-chain)
├── feat(phase0): add market_snapshot and execution_estimate tables    (batch1-db)
├── feat(phase0): add Arbitrum/GMX env schema and config               (batch1-env)
├── feat(phase0): install viem and @gmx-io/sdk dependencies            (batch1-deps)
└── ... (prior commits)
```

### Final Cleanup

After Batch 5 passes clean:

```bash
wt_final_cleanup
# Verifies no stale worktrees or phase0/* branches remain
# Removes empty worktree root directory
```

Mark all three plans as implemented and move to
`.cursor/plans/implemented/0002-gmx-pivot/phase-0-feasibility/`.
