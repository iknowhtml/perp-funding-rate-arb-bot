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
  | { type: "REJECT"; error: string };
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

### Negative
- More boilerplate than ad-hoc state management
- Need to update transition tables when adding states

### Risks
- **Incomplete transition table**: Mitigated by TypeScript exhaustiveness checking
- **Stale state in DB**: Mitigated by reconciliation with exchange REST API

## References
- [XState concepts](https://xstate.js.org/docs/concepts/)
- [ADR-0001: Bot Architecture](0001-bot-architecture.md) for execution context
