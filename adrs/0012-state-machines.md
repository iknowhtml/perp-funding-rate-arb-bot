# ADR 0012: State Machines for Order and Position Lifecycle

- **Status:** Accepted
- **Date:** 2026-02-04
- **Owners:** -
- **Related:**
  - [ADR-0001: Bot Architecture](0001-bot-architecture.md)
  - [ADR-0010: Exchange Adapters](0010-exchange-adapters.md)

## Context

The bot manages complex multi-step flows:
- Order lifecycle: CREATED → SUBMITTED → ACKED → PARTIAL/FILLED/CANCELED/REJECTED
- Hedge lifecycle: IDLE → ENTERING → ACTIVE → EXITING → CLOSED
- Position states with entry/exit phases

These flows need:
- Clear valid state transitions
- Invalid transitions caught at compile time (where possible) or runtime
- State history for debugging and audit
- Idempotency for retries

## Decision

Use explicit state machines with:

### 1. Discriminated Union Types for States

```typescript
export type OrderStatus =
  | "CREATED"
  | "SUBMITTED"
  | "ACKED"
  | "PARTIAL"
  | "FILLED"
  | "CANCELED"
  | "REJECTED";

export type HedgeState =
  | { phase: "IDLE" }
  | { phase: "ENTERING_PERP"; intentId: string }
  | { phase: "ENTERING_SPOT"; perpFilled: boolean }
  | { phase: "ACTIVE"; notionalCents: bigint; spotQtySats: bigint; perpQtySats: bigint }
  | { phase: "EXITING_SPOT" }
  | { phase: "EXITING_PERP" }
  | { phase: "CLOSED"; pnlCents: bigint };
```

### 2. Explicit Transition Tables

```typescript
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  CREATED: ["SUBMITTED"],
  SUBMITTED: ["ACKED", "REJECTED"],
  ACKED: ["PARTIAL", "FILLED", "CANCELED", "REJECTED"],
  PARTIAL: ["PARTIAL", "FILLED", "CANCELED"],
  FILLED: [], // Terminal state
  CANCELED: [], // Terminal state
  REJECTED: [], // Terminal state
};
```

### 3. Transition Functions with Validation

```typescript
export const transitionOrder = (
  order: Order,
  event: OrderEvent,
): Order | { error: string } => {
  const validNextStates = ORDER_TRANSITIONS[order.status];
  const nextStatus = eventToStatus(event);
  
  if (!validNextStates.includes(nextStatus)) {
    return { error: `Invalid transition: ${order.status} -> ${nextStatus}` };
  }
  
  return { ...order, status: nextStatus, ...applyEvent(order, event) };
};
```

### 4. Event Types for State Transitions

```typescript
export type OrderEvent =
  | { type: "SUBMIT"; orderId: string }
  | { type: "ACK"; exchangeOrderId: string }
  | { type: "PARTIAL_FILL"; filledQty: bigint; avgPrice: bigint }
  | { type: "FILL"; filledQty: bigint; avgPrice: bigint }
  | { type: "CANCEL"; reason: string }
  | { type: "REJECT"; error: string }
  | { type: "TIMEOUT"; reason: string }; // ACK timeout or fill timeout
```

### 4a. Order ACK Timeout Handling

Orders can get stuck in SUBMITTED state if the exchange never acknowledges. Implement timeout handling:

```typescript
export const ORDER_ACK_TIMEOUT_MS = 30_000; // 30 seconds
export const ORDER_FILL_TIMEOUT_MS = 60_000; // 60 seconds

export interface OrderWithTimeout extends Order {
  submittedAt: Date;
  ackedAt?: Date;
  timeoutAt?: Date;
}

export const checkOrderTimeout = (order: OrderWithTimeout): OrderEvent | null => {
  const now = Date.now();
  
  // Check ACK timeout (SUBMITTED state)
  if (order.status === "SUBMITTED" && order.submittedAt) {
    const elapsed = now - order.submittedAt.getTime();
    if (elapsed > ORDER_ACK_TIMEOUT_MS) {
      return { type: "TIMEOUT", reason: "ack_timeout" };
    }
  }
  
  // Check fill timeout (ACKED or PARTIAL state)
  if ((order.status === "ACKED" || order.status === "PARTIAL") && order.ackedAt) {
    const elapsed = now - order.ackedAt.getTime();
    if (elapsed > ORDER_FILL_TIMEOUT_MS) {
      return { type: "TIMEOUT", reason: "fill_timeout" };
    }
  }
  
  return null;
};
```

### 4b. Fill Confirmation Polling

Never assume an order is filled without explicit confirmation from the exchange:

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
    
    if (order.status === "FILLED" || order.status === "CANCELED" || order.status === "REJECTED") {
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

### 5. Idempotency via Intent IDs

```typescript
export interface ExecutionContext {
  intentId: string; // UUID for this specific intent
  ordersSubmitted: string[]; // Exchange order IDs already submitted
  retryCount: number;
}
```

### 6. State Persistence for Audit Trail

```typescript
export interface StateTransition {
  id: string;
  timestamp: Date;
  entityType: "order" | "position" | "hedge";
  entityId: string;
  fromState: string;
  toState: string;
  event: unknown; // JSON serialized event
  correlationId: string;
}
```

## Consequences

### Positive
- All valid transitions are documented and enforced
- Invalid transitions are caught early
- State history is trackable for debugging
- Idempotency prevents duplicate actions on retry
- Timeout handling prevents stuck orders

### Negative
- More boilerplate than ad-hoc state management
- Need to update transition tables when adding states
- Timeout handling adds complexity

### Risks
- **Incomplete transition table**: Mitigated by TypeScript exhaustiveness checking
- **Stale state in DB**: Mitigated by reconciliation with exchange REST API
- **Timeout during execution**: Mitigated by fill confirmation polling with retries
- **Network partition**: Mitigated by idempotency keys and reconciler

## Dependencies

```bash
# Recommended for timeout and retry handling
pnpm add p-retry p-timeout
```

## References
- [XState concepts](https://xstate.js.org/docs/concepts/)
- [ADR-0001: Bot Architecture](0001-bot-architecture.md) for execution context
