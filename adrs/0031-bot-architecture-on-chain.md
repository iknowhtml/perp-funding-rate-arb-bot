# ADR 0031: Bot Architecture (On-Chain Exchange)

- **Status:** Accepted
- **Date:** 2026-03-04
- **Updated:** 2026-03-04
- **Owners:** -
- **Supersedes:** [ADR-0001: Bot Architecture](0001-bot-architecture.md)
- **Related:**
  - [ADR-0019: On-Chain Perps Pivot](0019-on-chain-perps-pivot.md)
  - [ADR-0022: Regime-Based GMX v2 Funding Arb Bot](0022-regime-based-gmx-arb.md)
  - [ADR-0024: Data Plane — REST Polling](0024-data-plane-rest-polling.md)
  - [ADR-0020: Contract Interaction Patterns](0020-contract-interaction-patterns.md)
  - [ADR-0012: State Machines](0012-state-machines.md)

## Context

The bot now targets an **on-chain perpetual exchange** (GMX v2 on Arbitrum) instead of a CEX. ADR-0001 described a CEX-oriented architecture: WebSocket streams + REST polling, REST-as-authoritative truth, and order-based execution. With an on-chain exchange:

- **No WebSocket API.** Market and account state come from REST (GMX API) and RPC (contract reads). The data plane is polling-only.
- **Truth is on-chain.** Positions, balances, and execution outcomes are determined by contract state and transaction receipts, not exchange REST responses.
- **Execution is transaction-based.** We build, simulate, send, and confirm transactions (viem); there are no "orders" in the CEX sense.
- **Health is RPC + oracle + REST.** Staleness and failure modes are about RPC availability, oracle freshness, and REST API health—not WS connection state.

The high-level goals remain: monitor state, decide safely, execute without races, and reconcile with truth. This ADR updates the architecture to reflect the on-chain model and supersedes ADR-0001 for the current system.

## Decision

### Single Process, Polling-Driven Architecture

Run as a single Node.js process with:

1. **Data Plane**: REST polling (GMX API) + RPC polling (contract reads via viem). No WebSocket.
2. **Decision/Execution Plane**: Consumes state, produces intents, executes via serial transaction queue.
3. **Reconciler**: Periodically reads chain state (positions, balances) and corrects drift.

This preserves the "two loops + queue" model from ADR-0001; only the data sources and execution mechanism change.

### What Stays from ADR-0001

| Element | Still applies |
|--------|----------------|
| **Runtime** | Node.js + TypeScript (ecosystem, stability, ops). |
| **Serial execution queue** | One job at a time. For on-chain this also avoids nonce conflicts and overlapping txs. |
| **Evaluation pipeline** | Per-tick: health → risk → strategy → intent → queue. |
| **Two-phase risk check** | At evaluation time and immediately before sending a transaction. |
| **Reconciler** | Runs on a timer; reads chain (and REST where relevant) and updates in-memory state. |
| **Circuit breakers** | Threshold-based pause/exit on repeated failures (RPC, REST, execution). |
| **Stale data response** | Deterministic rules: when data is stale or unhealthy, pause entries or force exit depending on position. |

### What Changes

| CEX (ADR-0001) | On-Chain (this ADR) |
|----------------|---------------------|
| Data plane: WS + REST | Data plane: REST + RPC only |
| Truth: REST authoritative, WS hints | Truth: Chain state authoritative; REST for market data |
| Per-stream health (WS connections) | Health: RPC healthy, oracle fresh, REST healthy |
| WS reconnect → REST catch-up | No WS; reconnect N/A. RPC/rest failures → circuit breakers + reconcile |
| Execution: place order via API | Execution: build → simulate → send → confirm (viem) |
| Reconciler: REST fetch positions/orders | Reconciler: RPC reads (Reader contract, balances) |

### Two Loops + Queue (On-Chain)

```
┌─────────────────────────────────────────────────────────┐
│                    IN-MEMORY STATE                      │
│  prices | funding | positions | health | derived state │
└─────────────────────────────────────────────────────────┘
        ▲                    ▲                    │
        │                    │                    ▼
┌───────┴────────┐  ┌────────┴────────┐  ┌───────────────┐
│  DATA PLANE    │  │   RECONCILER     │  │ DECISION LOOP │
│  (REST + RPC)  │  │   (RPC + REST)   │  │  (evaluate)   │
└────────────────┘  └─────────────────┘  └───────┬───────┘
                                                 │
                                                 ▼
                                    ┌────────────────────┐
                                    │  EXECUTION QUEUE   │
                                    │  (serial, 1 tx)    │
                                    └────────────────────┘
```

### Data Plane Invariants (On-Chain)

1. **Polling cadence is fixed and documented**
   - Funding/OI (REST): 30–60s (ADR-0022, ADR-0024).
   - Positions/balances (RPC): 30s.
   - Gas (RPC): 10s.
   - Reconcile: 60s (or as in ADR-0022).

2. **No WebSocket**
   - All updates are pull-based. Staleness is determined by last successful fetch time and thresholds in the risk engine.

3. **Chain state is authoritative for positions and execution**
   - REST is used for market data (funding, OI, tickers). Contract reads (Reader, balances) are the source of truth for account state and position existence.

4. **Health is tracked per source**
   - RPC healthy, oracle data fresh, REST API responding. Overall health is derived from these (e.g. required for entry vs required for exit). See ADR-0022 for regime/risk integration.

### Truth Source Precedence (On-Chain)

| Source | Role | Authority |
|--------|------|------------|
| REST (GMX API) | Market data (funding, OI, tickers) | Primary for signals |
| RPC / Reader contract | Positions, balances, execution state | Authoritative for account |
| Reconciler | Periodic chain read + merge | Conflict resolution |

There is no WS-vs-REST ordering problem; we simply never overwrite newer chain-derived state with older polled data. Generation/timestamp precedence can still apply to in-memory updates to avoid reordering bugs.

### Execution: Transaction Lifecycle

All on-chain actions go through a single path (see ADR-0020, ADR-0026):

1. **Build** — Construct transaction(s) (e.g. multicall: deposit + createOrder).
2. **Simulate** — `publicClient.simulateContract` (or equivalent); abort if revert.
3. **Send** — `walletClient.writeContract` (or equivalent); one tx at a time from the queue.
4. **Confirm** — Wait for receipt; update state from chain (or next reconcile).

Serial queue ensures one transaction in flight; no nonce races.

### Stale Data and Circuit Breakers

- **RPC failing / stale**: Pause new entries; if in position, apply position-age and margin rules (reduce risk or force exit per ADR-0001-style tables, adapted to chain).
- **REST failing**: Market data stale; pause or degrade to last-known; do not send new txs that depend on fresh funding/OI until restored.
- **Oracle stale**: Per ADR-0022/0024; circuit breakers in risk engine; do not trade on stale oracle.
- **Execution failures**: Consecutive tx failures → pause, alert, manual review (same idea as ADR-0001).

Exact thresholds (e.g. N failures in 60s) are defined in risk/ops config and ADR-0022.

### Startup Sequence (On-Chain)

1. Load persisted state from DB (if any).
2. Reconcile with chain (RPC: positions, balances) and REST (market data). Establish truth.
3. Initialize health (RPC, REST, oracle) from first successful fetches.
4. If in position and state uncertain or unhealthy, start in PAUSED mode; alert.
5. Start data plane timers (REST + RPC polling) and reconciler timer.
6. Start evaluation loop (e.g. 2s tick). No WebSocket connection step.

### Reconciler (On-Chain)

- Runs on a schedule (e.g. 60s).
- Reads positions and balances via RPC (Reader contract, ERC20 balanceOf).
- Optionally refreshes market data from REST.
- Updates in-memory state; if inconsistency (e.g. we thought we were flat but chain shows position), trigger alert and/or PAUSE/EXIT per policy.

## Consequences

### Positive

- **Single source of truth for execution**: Chain state and tx receipts; no CEX order vs fill ambiguity.
- **Same safety patterns**: Serial queue, two-phase risk, reconciler, circuit breakers.
- **Simpler data plane**: No WebSocket reconnect or generationId for WS; polling only.
- **Auditable**: All state derivable from RPC + REST; decisions and txs traceable.

### Negative

- **Latency**: Polling is slower than WS for real-time prices; acceptable for regime-based strategy (ADR-0022).
- **RPC dependency**: Rate limits and availability; mitigated by batching (multicall), fixed cadence, and circuit breakers.

### Risks

- **RPC outage during position**: Mitigated by circuit breakers, position-age rules, and reconciler on recovery.
- **REST and RPC disagree**: Use chain for account/position decisions; REST for market data; document and alert on divergence if needed (ADR-0024).
- **Tx stuck or reverted**: Handled by confirm step and execution queue; no double-spend because only one tx at a time.

## References

- [ADR-0001: Bot Architecture](0001-bot-architecture.md) — Superseded by this ADR for on-chain operation.
- [ADR-0019: On-Chain Perps Pivot](0019-on-chain-perps-pivot.md) — Pivot rationale and architecture mapping.
- [ADR-0022: Regime-Based GMX v2 Funding Arb Bot](0022-regime-based-gmx-arb.md) — Data plane cadence, health, cost model.
- [ADR-0024: Data Plane — REST Polling](0024-data-plane-rest-polling.md) — REST vs RPC, staleness.
- [ADR-0020: Contract Interaction Patterns](0020-contract-interaction-patterns.md) — viem + SDK utilities, tx lifecycle.
- [ADR-0026: On-Chain Execution Safety](0026-on-chain-execution-safety.md) — Simulation and send/confirm.
