# ADR 0001: Funding Rate Arbitrage Bot Architecture

- **Status:** Accepted
- **Date:** 2026-02-04
- **Updated:** 2026-02-04
- **Owners:** -
- **Related:**
  - [ADR-0012: State Machines](0012-state-machines.md)
  - [ADR-0010: Exchange Adapters](0010-exchange-adapters.md)

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

Health is tracked **per stream**, not globally:

```typescript
const state = {
  prices: { ... },
  funding: { ... },
  account: { ... },
  position: { ... }, // derived
  
  // Per-stream health (not a single boolean)
  health: {
    spotTickerHealthy: boolean,      // spot price feed
    perpMarkHealthy: boolean,        // perp mark/index feed
    orderFeedHealthy: boolean,       // order updates (if used)
    restHealthy: boolean,            // REST API responding
    
    // Computed from above
    get overallHealthy(): boolean {
      return this.requiredStreamsHealthy && this.restHealthy;
    },
    get requiredStreamsHealthy(): boolean {
      return this.spotTickerHealthy && this.perpMarkHealthy;
    },
  },
};
```

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

```typescript
// In-memory state (authoritative "latest known")
const state = {
  prices: { ... },
  funding: { ... },
  account: { ... },
  health: { ... },  // per-stream, see above
  position: { ... }, // derived
};

const executionQueue = new SerialQueue(); // 1 job at a time

const start = () => {
  connectWebSockets();              // push updates into state
  schedule(fetchFunding, 30_000);   // 30s
  schedule(fetchAccount, 30_000);   // 30s
  schedule(reconcileTruth, 60_000); // 60s
  schedule(evaluate, 2_000);        // 2s "brain tick"
};
```

### Evaluation Pipeline (Per Tick)

```typescript
const evaluate = () => {
  // Never overlap decisions with execution
  if (executionQueue.busy()) return;

  // 1) Evaluate health and determine response (per-stream, position-aware)
  const healthResponse = evaluateHealthResponse();
  
  switch (healthResponse.action) {
    case "EMERGENCY_EXIT":
    case "FORCE_EXIT":
      if (state.position.open) {
        enqueueExit(healthResponse.reason ?? "health_degraded");
      }
      return;
    case "FULL_PAUSE":
    case "PAUSE_ENTRIES":
      // Don't exit, but don't enter either
      return;
    case "REDUCE_RISK":
      // Continue but with tighter limits
      break;
    case "CONTINUE":
      break;
  }

  // 2) Compute risk
  const risk = riskEngine.evaluate(state);

  if (risk.action === "EXIT" && state.position.open) {
    enqueueExit(risk.reason);
    return;
  }

  if (risk.action === "PAUSE") return;

  // 3) Compute intent
  const intent = strategy.decide(state, risk);

  // 4) Act (through queue)
  if (intent.type !== "NOOP") {
    executionQueue.push(() => executeIntent(intent));
  }
};
```

### Two-Phase Risk Check

Risk is checked twice:
1. **At evaluation time**: Determines intent
2. **Right before sending orders**: Re-checks because world changes between decision and action

### Execution Jobs

#### ENTER_HEDGE Job

```typescript
const executeEnterHedge = async (sizeQuote: bigint) => {
  // 1. Check risk again (esp. margin/liquidation)
  const risk = riskEngine.evaluate(state);
  if (risk.level === "DANGER") {
    return { aborted: true, reason: risk.reasons };
  }

  // 2. Place perp short (IOC/market)
  const perpOrder = await adapter.placePerpOrder({ ... });

  // 3. Place spot buy
  const spotOrder = await adapter.placeSpotOrder({ ... });

  // 4. Verify hedge drift (notional mismatch)
  const drift = calculateHedgeDrift(perpOrder, spotOrder);
  if (drift > MAX_DRIFT_BPS) {
    // Place small corrective order
    await correctDrift(drift);
  }

  // 5. Persist: orders/fills/position snapshot
  await persistExecution({ perpOrder, spotOrder });

  // 6. Alert if partial fills or abnormal slippage
  if (hasAnomalies(perpOrder, spotOrder)) {
    await alertService.send({ type: "EXECUTION_ANOMALY", ... });
  }
};
```

#### EXIT_HEDGE Job

```typescript
const executeExitHedge = async (reason: string) => {
  // 1. Check risk again (if liquidation danger, change sequence)
  const risk = riskEngine.evaluate(state);

  // 2. Place spot sell
  const spotOrder = await adapter.placeSpotOrder({ side: "SELL", ... });

  // 3. Close perp short
  const perpOrder = await adapter.placePerpOrder({ side: "BUY", ... });

  // 4. Verify flat
  const isFlat = await verifyFlatPosition();
  if (!isFlat) {
    await alertService.send({ type: "NOT_FLAT_AFTER_EXIT", ... });
  }

  // 5. Persist + alert
  await persistExecution({ spotOrder, perpOrder, reason });
};
```

### WebSocket Reconnect Semantics

Every reconnect follows this exact sequence:

```typescript
const connectWebSocket = async (streamId: string) => {
  // 1. Single-flight pattern: prevent reconnect races
  if (connectPromises[streamId]) {
    return connectPromises[streamId];
  }
  
  // 2. Increment generation (stale events from old socket are ignored)
  const generation = ++socketGenerations[streamId];
  
  // 3. Close existing socket if any
  if (sockets[streamId]) {
    sockets[streamId].close();
  }
  
  connectPromises[streamId] = (async () => {
    try {
      // 4. Connect
      const ws = await createWebSocket(streamId);
      
      // 5. Re-authenticate (if required by exchange)
      if (requiresAuth(streamId)) {
        await authenticate(ws);
      }
      
      // 6. Re-subscribe to channels
      await subscribe(ws, streamId);
      
      // 7. Immediate REST catch-up reconcile
      await reconcileTruth();
      
      // 8. Store socket with generation
      sockets[streamId] = { ws, generation };
      state.health[`${streamId}Healthy`] = true;
      
    } finally {
      delete connectPromises[streamId];
    }
  })();
  
  return connectPromises[streamId];
};
```

**Invariant**: Stale socket events are ignored via generation check:

```typescript
ws.on("message", (data) => {
  if (socketGenerations[streamId] !== generation) {
    return; // Stale event from old socket
  }
  processMessage(data);
});
```

### Backpressure Handling

WS feeds can spike (high volatility, exchange reconnects). Explicitly handle backpressure:

```typescript
// Message processing is non-blocking
ws.on("message", (raw) => {
  // Parse synchronously (fast)
  const msg = parseMessage(raw);
  
  // Update state synchronously (no async)
  updateState(msg);
});

// For high-volume feeds, use bounded queue with drop policy
const messageQueue = new BoundedQueue<Message>({
  maxSize: 1000,
  onOverflow: (dropped) => {
    alertService.send({ type: "WS_BACKPRESSURE", dropped });
    // Update health to trigger more aggressive REST polling
    state.health.wsBackpressure = true;
  },
});
```

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

```typescript
const evaluateHealthResponse = () => {
  const { health, position } = state;
  
  // Both failing = emergency
  if (!health.restHealthy && !health.requiredStreamsHealthy) {
    if (position.open) return { action: "EMERGENCY_EXIT" };
    return { action: "FULL_PAUSE" };
  }
  
  // WS stale handling depends on position
  if (!health.requiredStreamsHealthy) {
    if (!position.open) {
      return { action: "PAUSE_ENTRIES" };
    }
    
    const positionAgeMs = Date.now() - position.openedAt;
    if (positionAgeMs > 30_000) {
      return { action: "FORCE_EXIT", reason: "ws_stale_with_position" };
    }
    return { action: "PAUSE_ENTRIES" }; // Wait briefly
  }
  
  // REST failing with position = risky
  if (!health.restHealthy && position.open) {
    if (position.marginBufferBps < 500) { // < 5% buffer
      return { action: "FORCE_EXIT", reason: "rest_failing_low_margin" };
    }
    return { action: "REDUCE_RISK" };
  }
  
  return { action: "CONTINUE" };
};
```

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

```typescript
const startup = async () => {
  // 1. Load persisted state from DB
  const persisted = await db.getLatestState();
  
  // 2. Reconcile with exchange (REST) - establishes truth before any trading
  const truth = await reconciler.fetchTruth();
  
  // 3. Merge and validate
  state = mergeState(persisted, truth);
  
  // 4. Initialize per-stream health (all false until connected)
  state.health = {
    spotTickerHealthy: false,
    perpMarkHealthy: false,
    orderFeedHealthy: false,
    restHealthy: true, // REST just succeeded
  };
  
  // 5. If position open and state uncertain, PAUSE
  if (state.position.open && !state.health.confident) {
    state.mode = "PAUSED";
    await alertService.send({ type: "STARTUP_PAUSED" });
  }
  
  // 6. Connect WebSockets (follows reconnect semantics with catch-up)
  //    Each connect will: auth → subscribe → reconcile
  await Promise.all([
    connectWebSocket("spotTicker"),
    connectWebSocket("perpMark"),
    connectWebSocket("orderFeed"),
  ]);
  
  // 7. Start normal operation only after WS connected and caught up
  start();
};
```

## References
- Architecture Design Document, Sections 6-9
- [ADR-0012: State Machines](0012-state-machines.md) for order/hedge lifecycle
- [ADR-0010: Exchange Adapters](0010-exchange-adapters.md) for adapter interface
