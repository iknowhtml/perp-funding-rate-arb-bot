# Phase 0 Meta Plan: Dependency Analysis & Parallel Execution

> Companion to [GMX Pivot Roadmap](../README.md) Phase 0.
> Plans: [0001-chain-infrastructure](./0001-chain-infrastructure.md), [0002-data-collector](./0002-data-collector.md), [0003-impact-sampler](./0003-impact-sampler.md)

## Dependency Graph

```
                     ┌─────────────────────┐
                     │   Level 0 (Parallel) │
                     └─────────┬───────────┘
                               │
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                   ▼
   ┌─────────────────┐ ┌─────────────┐  ┌──────────────────┐
   │ 0001: install    │ │ 0001: env   │  │ 0002: db-schema  │
   │ viem + @gmx-io   │ │ schema      │  │ market_snapshot + │
   │                  │ │             │  │ execution_estimate│
   └────────┬─────────┘ └─────────────┘  └────────┬─────────┘
            │                                      │
            ▼                                      │
   ┌─────────────────────┐                         │
   │   Level 1 (Parallel) │                         │
   └─────────┬───────────┘                         │
             │                                     │
    ┌────────┼────────┬──────────┐                 │
    ▼        ▼        ▼          ▼                 │
 chain    public   wallet     gmx                  │
 constants client  client   contracts              │
    │        │        │          │                  │
    │        ▼        │          ▼                  │
    │   ┌────────────────────────────┐             │
    │   │   Level 2 (Parallel)       │             │
    │   └────────────┬───────────────┘             │
    │                │                              │
    │     ┌──────────┼──────────┐                  │
    │     ▼          ▼          ▼                   │
    │  rpc-health  gmx-reader  gas-price ◄─────────┘
    │              + REST                           │
    │                │                              │
    │   ┌────────────┴──────────────────────────────┘
    │   ▼
    │  ┌─────────────────────────────────────────┐
    │  │   Level 3 (Parallel — Two streams)      │
    │  └──────────────────┬──────────────────────┘
    │                     │
    │        ┌────────────┼────────────┐
    │        ▼                         ▼
    │   0002: collector           0003: simulate
    │   service                   order
    │        │                         │
    │        ▼                         ▼
    │   ┌────────────────┐    ┌──────────────────┐
    │   │ Level 4         │    │ Level 4           │
    │   └──────┬─────────┘    └──────┬───────────┘
    │          │                     │
    │   ┌──────┼──────┐       ┌──────┼──────────┐
    │   ▼      ▼      ▼       ▼      ▼          ▼
    │  market  gas   sched-  eth/btc impact   scheduler
    │  snap-   poll  uler    markets recording
    │  shot                          │
    │                                ▼
    │                         ┌──────────────┐
    │                         │   Level 5     │
    │                         └──────┬───────┘
    │                                │
    │                         ┌──────┼──────┐
    │                         ▼             ▼
    │                    distribution   go/no-go
    │                    metrics        check
    │
    └─── tests weave through each level ───┘
```

---

## Execution Levels (Topological Order)

### Level 0 — No Dependencies (Full Parallel)

These three work items have zero interdependencies and can be executed simultaneously:

| Work Item | Plan | What It Produces | Est. Effort |
|-----------|------|------------------|-------------|
| `install-deps` | 0001 | `viem` + `@gmx-io/sdk` in `package.json` | 5 min |
| `env-schema` | 0001 | Valibot schema with `ARBITRUM_RPC_URL`, `ARBITRUM_PRIVATE_KEY`, `GMX_ORACLE_URL` | 15 min |
| `db-schema` | 0002 | `market_snapshot` + `execution_estimate` tables via Drizzle migration | 30 min |

**Why parallel**: `db-schema` is pure SQL/Drizzle work — no chain code needed. `env-schema` is Valibot config — no runtime deps. `install-deps` is package manager only.

---

### Level 1 — After `install-deps` (Full Parallel)

All four depend only on viem/SDK being installed:

| Work Item | Plan | What It Produces | Depends On |
|-----------|------|------------------|------------|
| `chain-constants` | 0001 | Arbitrum chain ID, RPCs, gas defaults, contract addresses | `install-deps` |
| `public-client` | 0001 | `createArbitrumPublicClient` with multicall batching | `install-deps` |
| `wallet-client` | 0001 | `createArbitrumWalletClient` (for simulation) | `install-deps` |
| `gmx-contracts` | 0001 | GMX contract addresses from `@gmx-io/sdk` | `install-deps` |

**Why parallel**: These are all independent factory functions and constants. `public-client` and `wallet-client` may share `chain-constants` imports but don't depend on each other's output.

**Practical note**: `chain-constants` is typically written first since clients reference it, but they can be developed simultaneously with forward references.

---

### Level 2 — After Clients + Contracts (Partial Parallel)

| Work Item | Plan | What It Produces | Depends On |
|-----------|------|------------------|------------|
| `rpc-health` | 0001 | Block number polling, stale block detection, circuit breaker input | `public-client` |
| `gmx-reader-rest` | 0001 | GMX Reader contract helpers + REST API client (funding, OI, borrow, tickers) | `public-client`, `gmx-contracts` |
| `gas-price` (prep) | 0002 | Gas price polling via `eth_gasPrice` | `public-client`, `db-schema` |

**Why parallel**: `rpc-health` only needs the public client. `gmx-reader-rest` needs public client + contract addresses. `gas-price` polling needs public client + DB table to write to.

**Critical path**: `gmx-reader-rest` is the bottleneck — both the collector (0002) and impact sampler (0003) depend on it.

---

### Level 3 — After GMX Helpers + DB (Two Parallel Streams)

| Work Item | Plan | What It Produces | Depends On |
|-----------|------|------------------|------------|
| `collector-service` | 0002 | Data collector polling GMX REST + RPC, writing to `market_snapshot` | `gmx-reader-rest`, `db-schema` |
| `simulate-order` | 0003 | `simulateExecuteOrder` integration for $50k short perp | `wallet-client`, `gmx-reader-rest` |

**Why parallel**: The collector and sampler are independent consumers of the GMX read layer. The collector writes `market_snapshot` rows; the sampler writes `execution_estimate` rows. Different tables, different data flows.

---

### Level 4 — After Services (Parallel Within Each Stream)

**Stream A (Data Collector)**:

| Work Item | Plan | Depends On |
|-----------|------|------------|
| `market-snapshot` | 0002 | `collector-service` |
| `gas-price` (integration) | 0002 | `collector-service` |
| `scheduler-integration` | 0002 | `collector-service` |

**Stream B (Impact Sampler)**:

| Work Item | Plan | Depends On |
|-----------|------|------------|
| `eth-btc-markets` | 0003 | `simulate-order` |
| `impact-recording` | 0003 | `simulate-order`, `db-schema` |
| `scheduler` | 0003 | `simulate-order` |

**Why parallel**: Streams A and B are fully independent. Within each stream, tasks are mostly sequential (each refines the service), but `eth-btc-markets` and `impact-recording` in Stream B can be done simultaneously.

---

### Level 5 — After Data Accumulation (Sequential)

| Work Item | Plan | Depends On |
|-----------|------|------------|
| `distribution-metrics` | 0003 | `impact-recording` (needs stored data) |
| `go-no-go-check` | 0003 | `distribution-metrics` |

These are strictly sequential — you need recorded data to compute distributions, and distributions to evaluate go/no-go.

---

## Critical Path

The longest dependency chain determines the minimum wall-clock time:

```
install-deps → public-client + gmx-contracts → gmx-reader-rest → simulate-order → impact-recording → distribution-metrics → go-no-go-check
```

**Critical path**: 0001 → 0003 (chain infra → impact sampler)

The data collector (0002) is **not on the critical path** — it can be completed while the impact sampler is being built, since:
- `db-schema` starts at Level 0
- `collector-service` starts at Level 3 (same as `simulate-order`)
- Collector data accumulates in the background while sampler is developed

---

## Recommended Execution Strategy

### Option A: Single Developer (Sequential with Overlap)

```
Day 1:  Level 0 — all three in one session (install, env, db schema)
Day 1:  Level 1 — chain constants, clients, GMX contracts
Day 2:  Level 2 — rpc-health, gmx-reader-rest, gas polling
Day 2:  Level 3 — start collector AND simulate-order
Day 3:  Level 4 — finish both streams, tests
Day 3:  Level 5 — distribution metrics, go/no-go
```

### Option B: Two Parallel Cursor Sessions

```
Session 1 (Chain → Sampler):          Session 2 (DB → Collector):
──────────────────────────            ──────────────────────────
L0: install-deps, env-schema          L0: db-schema
L1: constants, clients, contracts     (wait for L2)
L2: gmx-reader-rest, rpc-health       L2: gas-price polling
L3: simulate-order                    L3: collector-service
L4: eth-btc, impact-recording         L4: market-snapshot, scheduler
L5: distribution, go/no-go            L4: tests
```

### Option C: Maximize Parallelism (Three Streams)

Only viable if you can context-switch between three workstreams:

```
Stream 1: 0001 chain infra (all todos top-to-bottom)
Stream 2: 0002 db-schema → collector → scheduler
Stream 3: 0003 simulate → record → distribution → go/no-go

Sync points:
- Stream 2 waits for Stream 1 Level 2 (gmx-reader-rest)
- Stream 3 waits for Stream 1 Level 2 (gmx-reader-rest + wallet-client)
- Stream 3 waits for Stream 2 Level 0 (db-schema for execution_estimate table)
```

---

## Plan-Level Summary

| Plan | Can Start Immediately? | Blocked By | Unblocks |
|------|----------------------|------------|----------|
| **0001: Chain Infrastructure** | Yes | Nothing | 0002, 0003 |
| **0002: Data Collector** | Partially (`db-schema` only) | 0001 `gmx-reader-rest` | 0003 (`execution_estimate` table) |
| **0003: Impact Sampler** | No | 0001 (clients + reader), 0002 (`db-schema`) | Go/no-go decision |

### Key Insight

**0001 is the critical dependency.** The fastest path to Phase 0 completion is to finish 0001 first, then work 0002 and 0003 in parallel. The one exception is `0002/db-schema` — start it at the same time as 0001 since it has zero chain dependencies.

---

## Todo-Level Dependency Matrix

| Todo | Plan | Hard Dependencies | Soft Dependencies |
|------|------|-------------------|-------------------|
| `install-deps` | 0001 | — | — |
| `env-schema` | 0001 | — | — |
| `db-schema` | 0002 | — | — |
| `chain-constants` | 0001 | `install-deps` | — |
| `public-client` | 0001 | `install-deps` | `chain-constants` |
| `wallet-client` | 0001 | `install-deps` | `chain-constants` |
| `gmx-contracts` | 0001 | `install-deps` | — |
| `rpc-health` | 0001 | `public-client` | — |
| `gmx-reader-rest` | 0001 | `public-client`, `gmx-contracts` | — |
| `smoke-tests` | 0001 | `rpc-health`, `gmx-reader-rest` | `env-schema` |
| `collector-service` | 0002 | `gmx-reader-rest`, `db-schema` | `env-schema` |
| `market-snapshot` | 0002 | `collector-service` | — |
| `gas-price` | 0002 | `public-client`, `db-schema` | — |
| `scheduler-integration` | 0002 | `collector-service` | — |
| `simulate-order` | 0003 | `wallet-client`, `gmx-reader-rest` | — |
| `eth-btc-markets` | 0003 | `simulate-order` | — |
| `impact-recording` | 0003 | `simulate-order`, `db-schema` | — |
| `scheduler` (sampler) | 0003 | `simulate-order` | `scheduler-integration` (pattern) |
| `distribution-metrics` | 0003 | `impact-recording` | — |
| `go-no-go-check` | 0003 | `distribution-metrics` | — |

**Hard dependency** = cannot start without this output.
**Soft dependency** = benefits from this but can use stubs/forward references.
