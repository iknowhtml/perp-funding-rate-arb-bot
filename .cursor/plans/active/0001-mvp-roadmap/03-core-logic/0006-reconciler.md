---
name: Reconciler
overview: Implement periodic reconciliation with exchange REST API to correct state drift.
todos:
  - id: reconciler-types
    content: Define reconciler types and interfaces
    status: pending
  - id: fetch-truth
    content: Implement truth fetching from exchange REST API
    status: pending
  - id: inconsistency-detection
    content: Implement inconsistency detection logic
    status: pending
  - id: state-correction
    content: Implement state correction logic
    status: pending
  - id: scheduled-reconcile
    content: Integrate reconciler with scheduler (60s interval)
    status: pending
  - id: tests
    content: Add unit tests for reconciler
    status: pending
  - id: lifecycle-management
    content: Move plan to implemented/ directory after completion (update todos, check validation boxes, update roadmap link, move file, delete from active/)
    status: pending
isProject: false
---

> **Note**: This plan is part of Phase 3 (Core Logic) in [MVP Roadmap](../README.md).

# Reconciler

## Overview

Implement periodic reconciliation with exchange REST API to ensure internal state matches exchange truth. The reconciler:
1. Fetches balances/positions/orders/fills via REST
2. Detects inconsistencies with in-memory state
3. Corrects state drift
4. Triggers alerts on critical inconsistencies

REST is the authoritative truth source; WebSocket provides low-latency hints.

Reference: [ADR-0001: Bot Architecture](../../../../adrs/0001-bot-architecture.md)

## Tasks

### 1. Reconciler Types

Create `src/worker/reconciler/types.ts`:

```typescript
export interface ReconcilerConfig {
  intervalMs: number; // Default: 60000 (60s)
  tolerances: {
    sizeBps: bigint;   // Position size tolerance
    priceBps: bigint;  // Price tolerance
    balanceBps: bigint; // Balance tolerance
  };
}

export interface ExchangeTruth {
  balances: Balance[];
  positions: Position[];
  openOrders: Order[];
  recentFills: Fill[];
  timestamp: Date;
}

export interface ReconciliationResult {
  consistent: boolean;
  inconsistencies: Inconsistency[];
  corrections: Correction[];
  timestamp: Date;
}

export interface Inconsistency {
  type: "balance" | "position" | "order";
  field: string;
  expected: string;
  actual: string;
  severity: "warning" | "critical";
}

export interface Correction {
  type: string;
  field: string;
  from: string;
  to: string;
  source: "rest";
}
```

### 2. Fetch Truth from Exchange

Create `src/worker/reconciler/fetch-truth.ts`:

```typescript
export const fetchExchangeTruth = async (
  adapter: ExchangeAdapter,
  symbols: string[],
): Promise<ExchangeTruth> => {
  const [balances, positions, openOrders, recentFills] = await Promise.all([
    adapter.getBalances(),
    adapter.getPositions(),
    adapter.getOpenOrders(),
    adapter.getRecentFills({ limit: 100 }),
  ]);

  return {
    balances,
    positions,
    openOrders,
    recentFills,
    timestamp: new Date(),
  };
};
```

### 3. Inconsistency Detection

Create `src/worker/reconciler/detect.ts`:

```typescript
export const detectInconsistencies = (
  state: BotState,
  truth: ExchangeTruth,
  tolerances: ReconcilerConfig["tolerances"],
): Inconsistency[] => {
  const inconsistencies: Inconsistency[] = [];

  // Check position size
  const statePosition = state.position;
  const truthPosition = truth.positions.find((p) => p.symbol === state.symbol);

  if (statePosition?.open && truthPosition) {
    const sizeDiff = statePosition.perpQuantityBase - truthPosition.sizeBase;
    const sizeDiffBps = (sizeDiff * 10000n) / (statePosition.perpQuantityBase || 1n);

    if (sizeDiffBps > tolerances.sizeBps || sizeDiffBps < -tolerances.sizeBps) {
      inconsistencies.push({
        type: "position",
        field: "perpQuantityBase",
        expected: truthPosition.sizeBase.toString(),
        actual: statePosition.perpQuantityBase.toString(),
        severity: sizeDiffBps > 100n ? "critical" : "warning",
      });
    }
  }

  // Check if we think we're flat but exchange says otherwise
  if (!statePosition?.open && truthPosition && truthPosition.sizeBase > 0n) {
    inconsistencies.push({
      type: "position",
      field: "open",
      expected: "true",
      actual: "false",
      severity: "critical",
    });
  }

  // Check balances
  for (const truthBalance of truth.balances) {
    const stateBalance = state.balances.get(truthBalance.asset);
    if (stateBalance) {
      const diff = stateBalance.totalBase - truthBalance.totalBase;
      const diffBps = (diff * 10000n) / (truthBalance.totalBase || 1n);

      if (diffBps > tolerances.balanceBps || diffBps < -tolerances.balanceBps) {
        inconsistencies.push({
          type: "balance",
          field: truthBalance.asset,
          expected: truthBalance.totalBase.toString(),
          actual: stateBalance.totalBase.toString(),
          severity: diffBps > 500n ? "critical" : "warning",
        });
      }
    }
  }

  return inconsistencies;
};
```

### 4. State Correction

Create `src/worker/reconciler/correct.ts`:

```typescript
export const correctState = (
  state: BotState,
  truth: ExchangeTruth,
  inconsistencies: Inconsistency[],
  stateStore: StateStore,
  logger: Logger,
): Correction[] => {
  const corrections: Correction[] = [];

  // Always trust REST for position state
  for (const position of truth.positions) {
    const correction: Correction = {
      type: "position",
      field: position.symbol,
      from: JSON.stringify(state.position),
      to: JSON.stringify(position),
      source: "rest",
    };
    corrections.push(correction);
  }

  // Update state store
  stateStore.updatePositions(truth.positions);
  stateStore.updateBalances(truth.balances);
  stateStore.updateOrders(truth.openOrders);
  stateStore.setLastReconcileTime(truth.timestamp);

  // Log corrections
  for (const correction of corrections) {
    logger.info("State corrected by reconciler", { correction });
  }

  return corrections;
};
```

### 5. Scheduled Reconciliation

Create `src/worker/reconciler/reconciler.ts`:

```typescript
export interface Reconciler {
  start(): void;
  stop(): void;
  runNow(): Promise<ReconciliationResult>;
}

export const createReconciler = (
  config: ReconcilerConfig,
  adapter: ExchangeAdapter,
  stateStore: StateStore,
  alertService: AlertService,
  logger: Logger,
): Reconciler => {
  let intervalId: NodeJS.Timeout | null = null;

  const reconcile = async (): Promise<ReconciliationResult> => {
    const state = stateStore.getState();
    
    // 1. Fetch truth from exchange
    const truth = await fetchExchangeTruth(adapter, [state.symbol]);

    // 2. Detect inconsistencies
    const inconsistencies = detectInconsistencies(state, truth, config.tolerances);

    // 3. Correct state
    const corrections = correctState(state, truth, inconsistencies, stateStore, logger);

    // 4. Alert on critical inconsistencies
    const criticalInconsistencies = inconsistencies.filter((i) => i.severity === "critical");
    if (criticalInconsistencies.length > 0) {
      await alertService.sendWarning({
        type: "RECONCILIATION_INCONSISTENCY",
        inconsistencies: criticalInconsistencies,
      });
    }

    return {
      consistent: inconsistencies.length === 0,
      inconsistencies,
      corrections,
      timestamp: new Date(),
    };
  };

  return {
    start: () => {
      intervalId = setInterval(() => {
        reconcile().catch((error) => {
          logger.error("Reconciliation failed", error as Error);
        });
      }, config.intervalMs);
    },
    stop: () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
    runNow: reconcile,
  };
};
```

## File Structure

```
src/worker/reconciler/
├── types.ts              # Reconciler type definitions
├── fetch-truth.ts        # Truth fetching logic
├── fetch-truth.test.ts
├── detect.ts             # Inconsistency detection
├── detect.test.ts
├── correct.ts            # State correction logic
├── correct.test.ts
├── reconciler.ts         # Main reconciler
├── reconciler.test.ts
└── index.ts              # Re-exports
```

## Dependencies

No new dependencies required.

## Validation

- [ ] Truth fetched correctly from REST API
- [ ] Position inconsistencies detected
- [ ] Balance inconsistencies detected
- [ ] State corrected from REST truth
- [ ] Critical inconsistencies trigger alerts
- [ ] Reconciler runs on 60s schedule
- [ ] Unit tests pass

## References

- [MVP Roadmap](../README.md)
- [ADR-0001: Bot Architecture](../../../../adrs/0001-bot-architecture.md) — Reconciler interaction
