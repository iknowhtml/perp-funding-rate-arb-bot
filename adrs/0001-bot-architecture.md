# ADR 0001: Funding Rate Arbitrage Bot Architecture

- **Status:** Superseded
- **Date:** 2026-02-04
- **Updated:** 2026-03-04
- **Owners:** -
- **Superseded by:** [ADR-0031: Bot Architecture (On-Chain Exchange)](0031-bot-architecture-on-chain.md)
- **Related:**
  - [ADR-0012: State Machines](0012-state-machines.md)
  - [ADR-0010: Exchange Adapters](0010-exchange-adapters.md)

> **Superseded.** The bot now uses an on-chain exchange (GMX v2). For the current architecture, see [ADR-0031: Bot Architecture (On-Chain Exchange)](0031-bot-architecture-on-chain.md). This document remains for historical context (CEX model).

## Context

The bot needs to:
- Continuously monitor market data (prices, funding rates)
- Make trading decisions based on current state
- Execute orders safely without race conditions
- Handle WebSocket disconnects and API failures
- Reconcile internal state with exchange truth

A naive "run once" script won't work because:
- Funding rates change continuously
- Prices change continuously
- Orders fill asynchronously
- WebSocket connections drop
- Account state drifts

The bot must be a **reactor**, not a script.

## Decision

### Single Process, Event-Driven Architecture

Run as a single Node.js process with:
1. **Data Plane**: WebSocket streams + periodic REST polling
2. **Decision/Execution Plane**: Consumes state, produces intents, executes safely
3. **Reconciler**: Periodically corrects drift

### Why Node.js Over Bun

The choice comes down to **operational risk**. Funding arb is more about staying alive 24/7 than being fast.

#### Node is the safer choice

| Factor | Node.js | Bun |
|--------|---------|-----|
| **Ecosystem compatibility** | Perfect — exchange SDKs, WS clients, auth/signing helpers all assume Node's runtime | Improving but occasional "uses Node internal" surprises |
| **Long-running stability** | Years of production burn-in for WS reconnections, memory over days/weeks, TLS edge cases, timer correctness | Can run long-lived services but less proven in "runs forever" scenarios |
| **Debugging/observability** | Mature — heap snapshots, flamegraphs, inspector, APM integrations | Developing tooling |
| **SaaS readiness** | Predictable behavior, standard Docker images, widespread ops knowledge | Adds hiring/support friction |

#### What Bun is better at

- Fast startup
- Great developer experience
- Solid performance

But funding arb doesn't need that. The bottlenecks are exchange APIs and risk logic, not JS throughput.

#### Decision

**Node + TypeScript** is the right default for a personal bot with future SaaS potential. Bun would work but accepts extra integration risk for little upside in this use case.

### Two Loops + A Queue Model

```
┌─────────────────────────────────────────────────────────┐
│                    IN-MEMORY STATE                      │
│  prices | funding | account | health | derived position │
└─────────────────────────────────────────────────────────┘
        ▲                    ▲                    │
        │                    │                    ▼
┌───────┴────────┐  ┌────────┴────────┐  ┌───────────────┐
│  DATA PLANE    │  │   RECONCILER    │  │ DECISION LOOP │
│  (WS + REST)   │  │   (REST poll)   │  │  (evaluate)   │
└────────────────┘  └─────────────────┘  └───────┬───────┘
                                                 │
                                                 ▼
                                    ┌────────────────────┐
                                    │  EXECUTION QUEUE   │
                                    │  (serial, 1 job)   │
                                    └────────────────────┘
```

### Data Plane Invariants

These invariants prevent 80% of WebSocket-related failures:

1. **Exactly one live connection per stream**
   - Use single-flight connect pattern (`connectPromise`)
   - Track `generationId` per socket so stale events can't mutate state after reconnect

2. **Reconnect triggers: resubscribe → REST catch-up reconcile**
   - On every reconnect: re-auth (if required) → re-subscribe → immediate REST catch-up
   - Never assume WS state survives reconnect

3. **WS events never override newer REST snapshots**
   - Use generation + timestamp precedence
   - REST is authoritative truth; WS is low-latency hints
   - Reconciler wins on conflicts

4. **Health is tracked per stream; stale handling differs by position state**
   - See "Per-Stream Health Tracking" and "Stale Data Response Rules" below

### A) Event-Driven Updates (WebSocket)

Push updates into in-memory state immediately:
- Spot ticker / mid price
- Perp mark/index price
- Order updates (if exchange supports)

### B) Scheduled Ticks (REST)

Run on intervals to ensure we don't rely on WS being perfect:

| Task | Interval | Purpose |
|------|----------|---------|
| Funding refresh | 30s | Get latest funding rate |
| Account refresh | 30s | Get balances/positions |
| Reconcile | 60s | Correct drift, verify truth |
| Evaluate (brain tick) | 2s | Run decision pipeline |

### C) Serial Execution Queue

**All trading actions go through one serialized queue.** This:
- Prevents overlapping entry/exit
- Ensures idempotency is enforceable
- Makes logs/audit clean
- Prevents 90% of bot disasters

### Per-Stream Health Tracking

Health is tracked **per stream** (spot ticker, perp mark, order feed, REST), not a single global boolean. Overall healthy = required streams healthy and REST healthy. See ADR-0031 and worker health logic in source.

**Rule of thumb:**
- If in a position → need mark/price streams healthy
- If flat → can be more permissive (only need REST healthy to enter)

A "quiet" channel can look stale even when it's fine. One missing non-critical stream shouldn't always force exit.

### Truth Source Precedence

Explicit precedence prevents subtle bugs where delayed WS events overwrite newer REST snapshots:

| Source | Role | Authority |
|--------|------|-----------|
| WebSocket | Low-latency hints | Secondary |
| REST | Authoritative truth | Primary |
| Reconciler | Conflict resolution | Final |

Implementation:
- Every state update carries a `generationId` and `timestamp`
- WS updates only apply if `generation >= currentGeneration`
- REST snapshots always increment generation and win conflicts

### Core Worker Loop

In-memory state holds prices, funding, account, per-stream health, and derived position. A serial execution queue runs one job at a time. On start: connect WebSockets, schedule funding/account refresh (e.g. 30s), reconcile (e.g. 60s), and evaluate tick (e.g. 2s). See ADR-0031 and worker in source.

### Evaluation Pipeline (Per Tick)

Each tick: if queue busy, return. (1) Evaluate health (per-stream, position-aware) → EMERGENCY_EXIT, FORCE_EXIT, FULL_PAUSE, PAUSE_ENTRIES, REDUCE_RISK, or CONTINUE. (2) Evaluate risk; exit or pause if needed. (3) Strategy decides intent. (4) If intent not NOOP, push execution job to queue. See evaluator and strategy in source.

### Two-Phase Risk Check

Risk is checked twice:
1. **At evaluation time**: Determines intent
2. **Right before sending orders**: Re-checks because world changes between decision and action

### Execution Jobs

#### ENTER_HEDGE Job

Re-check risk; abort if DANGER. Place perp short and spot buy (order and sizing per adapter); verify hedge drift and correct if needed; persist execution; alert on anomalies. See execution layer in source.

#### EXIT_HEDGE Job

Re-check risk. Place spot sell then close perp short (or adjust sequence if liquidation danger). Verify flat; persist and alert. See execution layer in source.

### WebSocket Reconnect Semantics

Every reconnect: single-flight connect (no races), increment generation (ignore stale events), close existing socket, connect → re-auth (if required) → re-subscribe → immediate REST catch-up → store socket with generation. Stale events are ignored when generation does not match. See WebSocket layer in source.

### Backpressure Handling

Parse and update state synchronously; for high-volume feeds use a bounded queue with drop policy and alert on overflow. See ADR-0031 and data plane in source.

**MVP approach**: Keep message handling synchronous and fast. If overloaded, log/alert and rely on REST reconcile. Prevents "why did Node OOM" later.

### Stale Data Response Rules

Define explicit rules so behavior is deterministic, not ambiguous:

| Condition | Position State | Action |
|-----------|---------------|--------|
| WS stale | Flat | Pause entries only |
| WS stale | In position < 30s | Pause entries, wait |
| WS stale | In position > 30s | Force exit |
| REST failing | Flat | Pause entries |
| REST failing | In position | Reduce risk → exit if margin buffer low |
| Both stale | Any | Emergency exit if in position |

Implementation: both failing → emergency exit if in position else full pause; WS stale → pause entries or force exit if position age > 30s; REST failing with position → reduce risk or force exit if margin buffer low. See evaluator health in source.

### Circuit Breakers

Circuit breakers are triggered by cumulative failures, not single events:

| Condition | Threshold | Response |
|-----------|-----------|----------|
| WS reconnect failures | 3 consecutive | Degrade to REST-only mode |
| REST errors | 5 in 60s | Pause all trading |
| Reconcile failures | 2 consecutive | Force pause, alert |
| Execution failures | 2 consecutive | Full stop, manual intervention |

Then:
- No new entries allowed
- Exit to flat based on Stale Data Response Rules above

### Reconciler Interaction

Reconciler runs on timer and:
1. Fetches balances/positions/orders/fills via REST
2. Updates state store
3. Updates in-memory derived position

If inconsistency detected (e.g., thought we were flat but aren't):
- Triggers alert
- Can force worker into PAUSE or EXIT mode

## Consequences

### Positive
- **Safe**: Serial queue prevents race conditions and double-trading
- **Resilient**: REST polling catches missed WS events
- **Deterministic**: Given same state, same decisions
- **Auditable**: Single execution path, clean logs
- **Testable**: Each component (risk, strategy, execution) testable in isolation

### Negative
- Single process = single point of failure (acceptable for MVP)
- 2s brain tick may miss some opportunities (acceptable at this scale)
- In-memory state lost on crash (mitigated by reconciler on restart)

### Risks
- **WS disconnect during position**: Mitigated by per-stream health tracking, position-aware stale rules, REST polling, and automatic reconnect with catch-up reconcile
- **WS reconnect races**: Mitigated by single-flight connect pattern and generationId to ignore stale events
- **WS backpressure/OOM**: Mitigated by synchronous message handling, bounded queues, and alerting on overflow
- **Stale WS overwriting fresh REST**: Mitigated by generation + timestamp precedence; REST always wins conflicts
- **Crash mid-execution**: Mitigated by reconciler on restart, idempotent jobs
- **Exchange API outage**: Mitigated by circuit breakers with explicit thresholds, position-aware response rules

## Implementation Notes

### Library Choices

Leverage libraries only for transport-level pain, not domain logic:

| Concern | Library | Rationale |
|---------|---------|-----------|
| WS transport | `ws` | Battle-tested, use with custom reconnect (single-flight + generationId) |
| Timeout/circuit breaker | `cockatiel` | Already chosen for REST; can use for WS connect attempts / ping timeouts for consistency |
| Schema validation | `valibot` | Existing choice; validates WS messages and REST responses |

**Do not** bring in large "realtime frameworks." Exchanges are raw WS; we want control over reconnect, health, and message handling.

### MVP Cadence (Recommended)

| Component | Method | Interval |
|-----------|--------|----------|
| Tickers | WebSocket | Continuous |
| Mark price | WebSocket | Continuous |
| Funding rate | REST | 30s |
| Account state | REST | 30s |
| Reconcile | REST | 60s |
| Evaluate | Timer | 2s |

### State Derivation

"Position open?" is derived from:
- `account.positions` from last REST fetch
- Recent fills since last fetch
- Reconciler corrections

### Startup Sequence

Load persisted state; reconcile with exchange (REST) to establish truth; merge and validate; initialize per-stream health; if position open and state uncertain, PAUSE and alert; connect WebSockets (auth → subscribe → reconcile per stream); then start normal operation. See ADR-0007/0029 and worker startup in source.

## References
- Architecture Design Document, Sections 6-9
- [ADR-0012: State Machines](0012-state-machines.md) for order/hedge lifecycle
- [ADR-0010: Exchange Adapters](0010-exchange-adapters.md) for adapter interface
