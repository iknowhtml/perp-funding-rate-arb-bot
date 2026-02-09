---
name: Execution Engine
overview: Implement execution engine for entering and exiting hedged positions with safety checks.
todos:
  - id: execution-types
    content: Define execution types and result interfaces
    status: pending
  - id: fill-confirmation
    content: Implement order fill confirmation polling with timeout
    status: pending
  - id: partial-fill-handling
    content: Implement partial fill detection and completion logic
    status: pending
  - id: enter-hedge
    content: Implement enter hedge execution (perp short + spot buy)
    status: pending
  - id: exit-hedge
    content: Implement exit hedge execution (spot sell + perp buy)
    status: pending
  - id: slippage-validation
    content: Implement pre-trade slippage validation
    status: pending
  - id: drift-correction
    content: Implement hedge drift detection and correction
    status: pending
  - id: circuit-breaker
    content: Implement execution circuit breaker for consecutive failures
    status: pending
  - id: tests
    content: Add unit tests for execution engine
    status: pending
  - id: lifecycle-management
    content: Move plan to implemented/ directory after completion (update todos, check validation boxes, update roadmap link, move file, delete from active/)
    status: pending
isProject: false
---

> **Note**: This plan is part of Phase 3 (Core Logic) in [MVP Roadmap](../README.md).

# Execution Engine

## Overview

Implement the execution engine that safely enters and exits hedged positions. The engine:
1. Validates risk before executing
2. Estimates and validates slippage
3. Executes perp and spot orders atomically
4. Detects and corrects hedge drift
5. Persists execution for audit trail

Reference: [ADR-0001: Bot Architecture](../../../../../adrs/0001-bot-architecture.md), [ADR-0015: Execution Safety & Slippage](../../../../../adrs/0015-execution-safety-slippage.md)

## Tasks

### 1. Execution Types

Create `src/worker/execution/types.ts`:

```typescript
export interface ExecutionResult {
  success: boolean;
  aborted: boolean;
  reason?: string;
  perpOrder?: OrderResult;
  spotOrder?: OrderResult;
  drift?: HedgeDrift;
  slippageAnalysis?: SlippageAnalysis;
  timestamp: Date;
}

export interface HedgeDrift {
  perpNotionalCents: bigint;
  spotNotionalCents: bigint;
  driftBps: bigint;
  needsCorrection: boolean;
}

export interface SlippageAnalysis {
  expectedSlippageBps: bigint;
  realizedSlippageBps: bigint;
  differencesBps: bigint;
  withinLimits: boolean;
}

// Timeout constants
export const ORDER_ACK_TIMEOUT_MS = 30_000; // 30 seconds
export const ORDER_FILL_TIMEOUT_MS = 60_000; // 60 seconds
export const MAX_PARTIAL_FILL_RETRIES = 3;
```

### 1a. Fill Confirmation Polling

Create `src/worker/execution/fill-confirmation.ts`:

**CRITICAL**: Never assume an order is filled without exchange confirmation.

```typescript
import pRetry from "p-retry";
import pTimeout from "p-timeout";

export const confirmOrderFill = async (
  adapter: ExchangeAdapter,
  orderId: string,
  timeoutMs: number = ORDER_FILL_TIMEOUT_MS,
): Promise<OrderResult> => {
  const poll = async (): Promise<OrderResult> => {
    const order = await adapter.getOrder(orderId);
    
    // Terminal states
    if (order.status === "FILLED" || 
        order.status === "CANCELED" || 
        order.status === "REJECTED") {
      return order;
    }
    
    throw new Error(`Order ${orderId} still pending: ${order.status}`);
  };

  return pTimeout(
    pRetry(poll, {
      retries: 10,
      minTimeout: 500,
      maxTimeout: 5000,
      factor: 1.5,
    }),
    { milliseconds: timeoutMs },
  );
};
```

### 1b. Partial Fill Handling

Create `src/worker/execution/partial-fills.ts`:

```typescript
export const handlePartialFills = async (
  perpOrder: OrderResult,
  spotOrder: OrderResult,
  adapter: ExchangeAdapter,
  logger: Logger,
): Promise<void> => {
  // Complete perp fill if partial
  if (perpOrder.status === "PARTIALLY_FILLED") {
    const remaining = perpOrder.quantity - perpOrder.filledQuantity;
    logger.warn("Completing partial perp fill", { orderId: perpOrder.orderId, remaining });
    
    await pRetry(
      async () => {
        const order = await adapter.createOrder({
          symbol: perpOrder.symbol,
          side: perpOrder.side,
          type: "MARKET",
          quantity: remaining,
        });
        return confirmOrderFill(adapter, order.orderId);
      },
      { retries: MAX_PARTIAL_FILL_RETRIES },
    );
  }
  
  // Complete spot fill if partial
  if (spotOrder.status === "PARTIALLY_FILLED") {
    const remaining = spotOrder.quantity - spotOrder.filledQuantity;
    logger.warn("Completing partial spot fill", { orderId: spotOrder.orderId, remaining });
    
    await pRetry(
      async () => {
        const order = await adapter.createOrder({
          symbol: spotOrder.symbol,
          side: spotOrder.side,
          type: "MARKET",
          quantity: remaining,
        });
        return confirmOrderFill(adapter, order.orderId);
      },
      { retries: MAX_PARTIAL_FILL_RETRIES },
    );
  }
};
```

### 1c. Execution Circuit Breaker

Create `src/worker/execution/circuit-breaker.ts`:

```typescript
import { CircuitBreaker, ConsecutiveBreaker, handleAll } from "cockatiel";

export const createExecutionCircuitBreaker = (
  alertService: AlertService,
) => {
  const breaker = new CircuitBreaker(handleAll, {
    halfOpenAfter: 30_000, // Try again after 30 seconds
    breaker: new ConsecutiveBreaker(2), // Open after 2 consecutive failures
  });

  breaker.onStateChange((state) => {
    if (state === "open") {
      alertService.sendCritical({
        type: "EXECUTION_CIRCUIT_BREAKER_OPEN",
        message: "Execution circuit breaker opened after consecutive failures",
      });
    } else if (state === "closed") {
      alertService.sendInfo({
        type: "EXECUTION_CIRCUIT_BREAKER_CLOSED",
        message: "Execution circuit breaker closed, resuming normal operation",
      });
    }
  });

  return breaker;
};
```

### 2. Enter Hedge Execution

Create `src/worker/execution/enter-hedge.ts`:

```typescript
export interface EnterHedgeParams {
  sizeCents: bigint;
  symbol: string;
  intentId: string;
}

export const executeEnterHedge = async (
  params: EnterHedgeParams,
  adapter: ExchangeAdapter,
  state: BotState,
  riskConfig: RiskConfig,
  slippageConfig: SlippageConfig,
  executionCircuitBreaker: CircuitBreaker,
  logger: Logger,
): Promise<ExecutionResult> => {
  const { sizeCents, symbol, intentId } = params;

  // 0. Check circuit breaker
  if (executionCircuitBreaker.state === "open") {
    return {
      success: false,
      aborted: true,
      reason: "execution_circuit_breaker_open",
      timestamp: new Date(),
    };
  }

  // 1. Re-check risk (two-phase check per ADR-0001)
  const risk = evaluateRisk(state, riskConfig);
  if (risk.level === "DANGER" || risk.action === "BLOCK") {
    return {
      success: false,
      aborted: true,
      reason: `Risk check failed: ${risk.reasons.join(", ")}`,
      timestamp: new Date(),
    };
  }

  // 2. Get order book and estimate slippage
  const orderBook = await adapter.getOrderBook(symbol);
  const slippageEstimate = estimateSlippage(
    orderBook,
    "BUY",
    sizeCents,
    slippageConfig.maxSlippageBps,
  );

  if (!slippageEstimate.canExecute) {
    return {
      success: false,
      aborted: true,
      reason: `Slippage ${slippageEstimate.slippageBps}bps exceeds limit`,
      timestamp: new Date(),
    };
  }

  // 3. Place perp short order (through circuit breaker)
  logger.info("Placing perp short order", { intentId, sizeCents });
  const perpOrderResult = await executionCircuitBreaker.execute(async () => {
    const order = await adapter.createOrder({
      symbol: `${symbol}-PERP`,
      side: "SELL",
      type: "MARKET",
      quantity: sizeCents,
    });
    // CRITICAL: Confirm fill with polling
    return confirmOrderFill(adapter, order.orderId, ORDER_FILL_TIMEOUT_MS);
  });

  // 4. Place spot buy order (through circuit breaker)
  logger.info("Placing spot buy order", { intentId, sizeCents });
  const spotOrderResult = await executionCircuitBreaker.execute(async () => {
    const order = await adapter.createOrder({
      symbol,
      side: "BUY",
      type: "MARKET",
      quantity: sizeCents,
    });
    // CRITICAL: Confirm fill with polling
    return confirmOrderFill(adapter, order.orderId, ORDER_FILL_TIMEOUT_MS);
  });

  // 5. Handle partial fills
  if (perpOrderResult.status === "PARTIALLY_FILLED" || 
      spotOrderResult.status === "PARTIALLY_FILLED") {
    logger.warn("Partial fills detected, completing", { intentId });
    await handlePartialFills(perpOrderResult, spotOrderResult, adapter, logger);
  }

  // 6. Verify hedge drift
  const drift = calculateHedgeDrift(perpOrderResult, spotOrderResult);
  if (drift.needsCorrection) {
    logger.warn("Hedge drift detected", { drift, intentId });
    await correctDrift(drift, adapter, symbol, logger);
  }

  // 7. Persist execution
  await persistExecution({
    intentId,
    type: "ENTER_HEDGE",
    perpOrder: perpOrderResult,
    spotOrder: spotOrderResult,
    drift,
  });

  return {
    success: true,
    aborted: false,
    perpOrder: perpOrderResult,
    spotOrder: spotOrderResult,
    drift,
    timestamp: new Date(),
  };
};
```

### 3. Exit Hedge Execution

Create `src/worker/execution/exit-hedge.ts`:

```typescript
export interface ExitHedgeParams {
  reason: string;
  intentId: string;
}

export const executeExitHedge = async (
  params: ExitHedgeParams,
  adapter: ExchangeAdapter,
  state: BotState,
  logger: Logger,
): Promise<ExecutionResult> => {
  const { reason, intentId } = params;
  const position = state.position;

  if (!position?.open) {
    return {
      success: false,
      aborted: true,
      reason: "No position to exit",
      timestamp: new Date(),
    };
  }

  // 1. Re-check risk for exit sequence
  const risk = evaluateRisk(state, riskConfig);

  // 2. Place spot sell order first
  logger.info("Placing spot sell order", { intentId, reason });
  const spotOrder = await adapter.createOrder({
    symbol: position.symbol,
    side: "SELL",
    type: "MARKET",
    quantity: position.spotQuantityBase,
  });

  // 3. Close perp short
  logger.info("Closing perp position", { intentId, reason });
  const perpOrder = await adapter.createOrder({
    symbol: `${position.symbol}-PERP`,
    side: "BUY",
    type: "MARKET",
    quantity: position.perpQuantityBase,
  });

  // 4. Verify flat
  const isFlat = await verifyFlatPosition(adapter, position.symbol);
  if (!isFlat) {
    logger.error("Not flat after exit", { intentId });
    await alertService.send({ type: "NOT_FLAT_AFTER_EXIT", intentId });
  }

  // 5. Persist execution
  await persistExecution({
    intentId,
    type: "EXIT_HEDGE",
    reason,
    spotOrder,
    perpOrder,
  });

  return {
    success: true,
    aborted: false,
    perpOrder,
    spotOrder,
    timestamp: new Date(),
  };
};
```

### 4. Slippage Validation

Create `src/worker/execution/slippage.ts`:

```typescript
export const validateExecution = async (
  adapter: ExchangeAdapter,
  params: OrderParams,
  config: SlippageConfig,
): Promise<{ valid: boolean; reason?: string; slippageEstimate?: SlippageEstimate }> => {
  // 1. Get order book
  const orderBook = await adapter.getOrderBook(params.symbol);

  // 2. Estimate slippage
  const slippageEstimate = estimateSlippage(
    orderBook,
    params.side,
    params.quantity,
    config.maxSlippageBps,
  );

  // 3. Check slippage limit
  if (!slippageEstimate.canExecute) {
    return {
      valid: false,
      reason: `Slippage ${slippageEstimate.slippageBps}bps exceeds limit ${config.maxSlippageBps}bps`,
      slippageEstimate,
    };
  }

  // 4. Check liquidity
  if (slippageEstimate.availableDepth < slippageEstimate.requiredDepth * config.minLiquidityMultiplier) {
    return {
      valid: false,
      reason: `Insufficient liquidity`,
      slippageEstimate,
    };
  }

  return { valid: true, slippageEstimate };
};
```

### 5. Hedge Drift Correction

```typescript
const MAX_DRIFT_BPS = 50n; // 0.5%

export const calculateHedgeDrift = (
  perpOrder: OrderResult,
  spotOrder: OrderResult,
): HedgeDrift => {
  const perpNotional = perpOrder.filledQuantity * perpOrder.averagePrice;
  const spotNotional = spotOrder.filledQuantity * spotOrder.averagePrice;
  
  const diff = perpNotional > spotNotional 
    ? perpNotional - spotNotional 
    : spotNotional - perpNotional;
  
  const driftBps = (diff * 10000n) / perpNotional;

  return {
    perpNotionalCents: perpNotional,
    spotNotionalCents: spotNotional,
    driftBps,
    needsCorrection: driftBps > MAX_DRIFT_BPS,
  };
};

export const correctDrift = async (
  drift: HedgeDrift,
  adapter: ExchangeAdapter,
  symbol: string,
): Promise<void> => {
  const diff = drift.perpNotionalCents - drift.spotNotionalCents;
  
  if (diff > 0n) {
    // Need more spot
    await adapter.createOrder({
      symbol,
      side: "BUY",
      type: "MARKET",
      quantity: diff,
    });
  } else {
    // Need more perp
    await adapter.createOrder({
      symbol: `${symbol}-PERP`,
      side: "SELL",
      type: "MARKET",
      quantity: -diff,
    });
  }
};
```

## File Structure

```
src/worker/execution/
├── types.ts              # Execution type definitions
├── enter-hedge.ts        # Enter hedge logic
├── enter-hedge.test.ts
├── exit-hedge.ts         # Exit hedge logic
├── exit-hedge.test.ts
├── slippage.ts           # Slippage validation
├── slippage.test.ts
├── drift.ts              # Drift detection and correction
├── drift.test.ts
├── persistence.ts        # Execution persistence
└── index.ts              # Re-exports
```

## Dependencies

```bash
# Required for fill confirmation and retry handling
pnpm add p-retry p-timeout

# Already installed
# cockatiel (circuit breaker)
```

## Validation

- [ ] Two-phase risk check before execution
- [ ] Slippage estimated and validated
- [ ] **Order fill confirmation polling works**
- [ ] **Partial fills detected and completed**
- [ ] **Circuit breaker prevents consecutive failures**
- [ ] Perp and spot orders executed correctly
- [ ] Hedge drift detected and corrected
- [ ] Execution persisted for audit
- [ ] Unit tests pass

## References

- [MVP Roadmap](../README.md)
- [ADR-0001: Bot Architecture](../../../../../adrs/0001-bot-architecture.md) — Execution jobs
- [ADR-0015: Execution Safety & Slippage](../../../../../adrs/0015-execution-safety-slippage.md)
