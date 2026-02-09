---
name: Evaluation Loop
overview: Implement the main evaluation loop (brain tick) that ties together health, risk, strategy, and execution.
todos:
  - id: health-evaluation
    content: Implement health evaluation and response rules
    status: pending
  - id: evaluation-pipeline
    content: Implement main evaluation pipeline (health → risk → strategy → execution)
    status: pending
  - id: worker-integration
    content: Integrate evaluation loop with worker and scheduler (2s tick)
    status: pending
  - id: startup-sequence
    content: Implement proper startup sequence
    status: pending
  - id: tests
    content: Add unit tests for evaluation loop
    status: pending
  - id: lifecycle-management
    content: Move plan to implemented/ directory after completion (update todos, check validation boxes, update roadmap link, move file, delete from active/)
    status: pending
isProject: false
---

> **Note**: This plan is part of Phase 3 (Core Logic) in [MVP Roadmap](../README.md).

# Evaluation Loop

## Overview

Implement the main evaluation loop ("brain tick") that runs every 2 seconds and:
1. Evaluates health and determines response
2. Computes risk assessment
3. Generates trading intent from strategy
4. Queues execution through serial queue

This ties together all the core logic components into a cohesive decision pipeline.

Reference: [ADR-0001: Bot Architecture](../../../../../adrs/0001-bot-architecture.md)

## Tasks

### 1. Health Evaluation

Create `src/worker/evaluator/health.ts`:

```typescript
export type HealthAction =
  | "EMERGENCY_EXIT"
  | "FORCE_EXIT"
  | "FULL_PAUSE"
  | "PAUSE_ENTRIES"
  | "REDUCE_RISK"
  | "CONTINUE";

export interface HealthResponse {
  action: HealthAction;
  reason?: string;
}

export const evaluateHealthResponse = (state: BotState): HealthResponse => {
  const { health, position } = state;

  // Both failing = emergency
  if (!health.restHealthy && !health.requiredStreamsHealthy) {
    if (position?.open) return { action: "EMERGENCY_EXIT", reason: "all_feeds_down" };
    return { action: "FULL_PAUSE" };
  }

  // WS stale handling depends on position
  if (!health.requiredStreamsHealthy) {
    if (!position?.open) {
      return { action: "PAUSE_ENTRIES" };
    }

    const positionAgeMs = Date.now() - (position.openedAt?.getTime() ?? 0);
    if (positionAgeMs > 30_000) {
      return { action: "FORCE_EXIT", reason: "ws_stale_with_position" };
    }
    return { action: "PAUSE_ENTRIES" }; // Wait briefly
  }

  // REST failing with position = risky
  if (!health.restHealthy && position?.open) {
    if (position.marginBufferBps < 500n) { // < 5% buffer
      return { action: "FORCE_EXIT", reason: "rest_failing_low_margin" };
    }
    return { action: "REDUCE_RISK" };
  }

  return { action: "CONTINUE" };
};
```

### 2. Evaluation Pipeline

Create `src/worker/evaluator/evaluate.ts`:

```typescript
export const evaluate = async (
  state: BotState,
  executionQueue: SerialQueue,
  riskConfig: RiskConfig,
  strategyConfig: StrategyConfig,
  logger: Logger,
): Promise<void> => {
  // Never overlap decisions with execution
  if (executionQueue.busy()) {
    logger.debug("Skipping evaluation: execution in progress");
    return;
  }

  // 1. Evaluate health and determine response
  const healthResponse = evaluateHealthResponse(state);

  switch (healthResponse.action) {
    case "EMERGENCY_EXIT":
    case "FORCE_EXIT":
      if (state.position?.open) {
        executionQueue.push(() =>
          executeExitHedge({
            reason: healthResponse.reason ?? "health_degraded",
            intentId: generateIntentId(),
          })
        );
      }
      return;
    case "FULL_PAUSE":
    case "PAUSE_ENTRIES":
      // Don't exit, but don't enter either
      return;
    case "REDUCE_RISK":
      // Continue but with tighter limits (handled by risk engine)
      break;
    case "CONTINUE":
      break;
  }

  // 2. Compute risk
  const risk = evaluateRisk(state, riskConfig);

  if (risk.action === "EXIT" && state.position?.open) {
    executionQueue.push(() =>
      executeExitHedge({
        reason: risk.reasons.join(", "),
        intentId: generateIntentId(),
      })
    );
    return;
  }

  if (risk.action === "PAUSE" || risk.action === "BLOCK") {
    return;
  }

  // 3. Compute intent from strategy
  const marketState: MarketState = {
    position: state.position,
    fundingRate: state.fundingRate,
    fundingHistory: state.fundingHistory,
  };

  const intent = evaluateStrategy(marketState, risk, strategyConfig);

  // 4. Act (through queue)
  if (intent.type === "ENTER_HEDGE") {
    executionQueue.push(() =>
      executeEnterHedge({
        sizeCents: intent.params.sizeCents,
        symbol: state.symbol,
        intentId: generateIntentId(),
      })
    );
  } else if (intent.type === "EXIT_HEDGE") {
    executionQueue.push(() =>
      executeExitHedge({
        reason: intent.reason,
        intentId: generateIntentId(),
      })
    );
  }
};
```

### 3. Worker Integration

Create `src/worker/worker.ts`:

**CRITICAL**: Use `setTimeout` recursion instead of `setInterval` to prevent blocking:

```typescript
export interface Worker {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export const createWorker = (config: WorkerConfig): Worker => {
  const stateStore = createStateStore();
  const executionQueue = createSerialQueue();
  const dataPlane = createDataPlane({ ... });
  const reconciler = createReconciler({ ... });
  const metrics = createMetrics();
  
  let evaluateTimeout: NodeJS.Timeout | null = null;
  let running = false;

  // Use setTimeout recursion to prevent blocking
  // This ensures the next tick only schedules after the current one completes
  const scheduleNextEvaluation = (): void => {
    if (!running) return;
    
    evaluateTimeout = setTimeout(async () => {
      const startTime = performance.now();
      
      try {
        const state = stateStore.getState();
        await evaluate(state, executionQueue, config.risk, config.strategy, logger);
      } catch (error) {
        logger.error("Evaluation failed", { error });
        metrics.evaluationErrors.inc();
      } finally {
        // Track evaluation latency
        const latencyMs = performance.now() - startTime;
        metrics.evaluationLatency.observe(latencyMs);
        
        // Warn if evaluation took too long
        if (latencyMs > 1500) {
          logger.warn("Evaluation took too long", { latencyMs });
        }
        
        // Schedule next tick (after current completes)
        scheduleNextEvaluation();
      }
    }, 2000);
  };

  return {
    start: async () => {
      // 1. Startup sequence
      await startup(stateStore, reconciler, dataPlane);

      // 2. Start data plane (WebSockets + REST polling)
      await dataPlane.start();

      // 3. Start reconciler
      reconciler.start();

      // 4. Start evaluation loop (2s tick with setTimeout recursion)
      running = true;
      scheduleNextEvaluation();
      
      logger.info("Worker started");
    },

    stop: async () => {
      running = false;
      if (evaluateTimeout) {
        clearTimeout(evaluateTimeout);
        evaluateTimeout = null;
      }
      reconciler.stop();
      await dataPlane.stop();
      logger.info("Worker stopped");
    },
  };
};
```

**Why `setTimeout` recursion instead of `setInterval`?**

1. **Prevents overlap**: `setInterval` fires every N ms regardless of whether the previous call finished. If evaluation takes longer than 2s, callbacks pile up.
2. **Backpressure handling**: If evaluation is slow, we naturally slow down the loop rather than queueing more work.
3. **Clean shutdown**: With `setTimeout`, we can reliably stop after the current tick completes.
4. **Latency tracking**: We can accurately measure per-tick latency without overlap confusion.

### 4. Startup Sequence

```typescript
export const startup = async (
  stateStore: StateStore,
  reconciler: Reconciler,
  dataPlane: DataPlane,
): Promise<void> => {
  // 1. Load persisted state from DB
  const persisted = await db.getLatestState();

  // 2. Reconcile with exchange (REST) - establishes truth before any trading
  const result = await reconciler.runNow();

  // 3. Initialize per-stream health (all false until connected)
  stateStore.setHealth({
    spotTickerHealthy: false,
    perpMarkHealthy: false,
    orderFeedHealthy: false,
    restHealthy: true, // REST just succeeded
  });

  // 4. If position open and state uncertain, PAUSE
  const state = stateStore.getState();
  if (state.position?.open && result.inconsistencies.length > 0) {
    stateStore.setMode("PAUSED");
    await alertService.send({ type: "STARTUP_PAUSED" });
  }

  // 5. Connect WebSockets (follows reconnect semantics with catch-up)
  // DataPlane.start() handles this
};
```

## File Structure

```
src/worker/
├── evaluator/
│   ├── health.ts         # Health evaluation
│   ├── health.test.ts
│   ├── evaluate.ts       # Main evaluation pipeline
│   ├── evaluate.test.ts
│   └── index.ts
├── worker.ts             # Worker orchestration
├── worker.test.ts
└── index.ts              # Re-exports
```

## Dependencies

```bash
# Already installed
# prom-client (metrics)
```

## Validation

- [ ] Health evaluation follows stale data response rules
- [ ] Evaluation pipeline executes in correct order
- [ ] Queue prevents overlapping executions
- [ ] **setTimeout recursion prevents evaluation overlap**
- [ ] **Evaluation latency is tracked via metrics**
- [ ] **Slow evaluations (>1500ms) are logged as warnings**
- [ ] Startup sequence initializes state correctly
- [ ] Worker starts and stops cleanly
- [ ] Unit tests pass

## References

- [MVP Roadmap](../README.md)
- [ADR-0001: Bot Architecture](../../../../../adrs/0001-bot-architecture.md) — Evaluation pipeline
- [ADR-0012: State Machines](../../../../../adrs/0012-state-machines.md)
- [ADR-0013: Risk Management Engine](../../../../../adrs/0013-risk-management.md)
- [ADR-0014: Funding Rate Strategy](../../../../../adrs/0014-funding-rate-strategy.md)
