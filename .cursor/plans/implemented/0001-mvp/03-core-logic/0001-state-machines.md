---
name: State Machines
overview: Implement order and hedge state machines for tracking lifecycle transitions with validation.
todos:
  - id: order-state-machine
    content: Implement order state machine with transition validation
    status: completed
  - id: hedge-state-machine
    content: Implement hedge state machine with phase transitions
    status: completed
  - id: state-persistence
    content: Add state transition persistence for audit trail
    status: completed
  - id: tests
    content: Add unit tests for state machines
    status: completed
  - id: lifecycle-management
    content: Move plan to implemented/ directory after completion (update todos, check validation boxes, update roadmap link, move file, delete from active/)
    status: completed
isProject: false
---

> **Note**: This plan is part of Phase 3 (Core Logic) in [MVP Roadmap](../README.md).

# State Machines

## Overview

Implement explicit state machines for order lifecycle and hedge lifecycle management. State machines provide:
- Clear valid state transitions
- Invalid transitions caught at runtime
- State history for debugging and audit
- Idempotency for retries

Reference: [ADR-0012: State Machines](../../../../../adrs/0012-state-machines.md)

## Tasks

### 1. Order State Machine

Create `src/domains/state/order-state.ts`:

```typescript
export type OrderStatus =
  | "CREATED"
  | "SUBMITTED"
  | "ACKED"
  | "PARTIAL"
  | "FILLED"
  | "CANCELED"
  | "REJECTED";

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  CREATED: ["SUBMITTED"],
  SUBMITTED: ["ACKED", "REJECTED"],
  ACKED: ["PARTIAL", "FILLED", "CANCELED", "REJECTED"],
  PARTIAL: ["PARTIAL", "FILLED", "CANCELED"],
  FILLED: [], // Terminal state
  CANCELED: [], // Terminal state
  REJECTED: [], // Terminal state
};

export type OrderEvent =
  | { type: "SUBMIT"; orderId: string }
  | { type: "ACK"; exchangeOrderId: string }
  | { type: "PARTIAL_FILL"; filledQtyBase: bigint; avgPriceQuote: bigint }
  | { type: "FILL"; filledQtyBase: bigint; avgPriceQuote: bigint }
  | { type: "CANCEL"; reason: string }
  | { type: "REJECT"; error: string };

export const transitionOrder = (
  order: Order,
  event: OrderEvent,
): Order | { error: string } => {
  // Implementation with validation
};
```

### 2. Hedge State Machine

Create `src/domains/state/hedge-state.ts`:

```typescript
export type HedgeState =
  | { phase: "IDLE" }
  | { phase: "ENTERING_PERP"; intentId: string; symbol: string }
  | { phase: "ENTERING_SPOT"; perpFilled: boolean; symbol: string }
  | { phase: "ACTIVE"; symbol: string; notionalQuote: bigint; spotQtyBase: bigint; perpQtyBase: bigint }
  | { phase: "EXITING_SPOT"; symbol: string }
  | { phase: "EXITING_PERP"; symbol: string }
  | { phase: "CLOSED"; symbol: string; pnlQuote: bigint };

export const HEDGE_TRANSITIONS: Record<string, string[]> = {
  IDLE: ["ENTERING_PERP"],
  ENTERING_PERP: ["ENTERING_SPOT", "IDLE"], // Can abort
  ENTERING_SPOT: ["ACTIVE", "IDLE"], // Can abort
  ACTIVE: ["EXITING_SPOT"],
  EXITING_SPOT: ["EXITING_PERP"],
  EXITING_PERP: ["CLOSED"],
  CLOSED: [], // Terminal state
};

export type HedgeEvent =
  | { type: "START_ENTRY"; intentId: string; symbol: string }
  | { type: "PERP_FILLED"; filledQtyBase: bigint }
  | { type: "SPOT_FILLED"; filledQtyBase: bigint }
  | { type: "START_EXIT"; reason: string }
  | { type: "SPOT_SOLD" }
  | { type: "PERP_CLOSED"; pnlQuote: bigint }
  | { type: "ABORT"; reason: string };

export const transitionHedge = (
  state: HedgeState,
  event: HedgeEvent,
): HedgeState | { error: string } => {
  // Implementation with validation
};
```

### 3. State Transition Persistence

Create `src/domains/state/persistence.ts`:

```typescript
export interface StateTransition {
  id: string;
  timestamp: Date;
  entityType: "order" | "hedge";
  entityId: string;
  fromState: string;
  toState: string;
  event: unknown; // JSON serialized event
  correlationId: string;
}

export const persistTransition = async (
  transition: StateTransition,
): Promise<void> => {
  // Save to database for audit trail
};
```

### 4. Intent ID for Idempotency

```typescript
export interface ExecutionContext {
  intentId: string; // UUID for this specific intent
  ordersSubmitted: string[]; // Exchange order IDs already submitted
  retryCount: number;
}
```

## File Structure

```
src/domains/state/
├── order-state.ts        # Order state machine
├── order-state.test.ts   # Order state tests
├── hedge-state.ts        # Hedge state machine
├── hedge-state.test.ts   # Hedge state tests
├── persistence.ts        # State persistence
├── persistence.test.ts   # Persistence tests
├── types.ts              # Shared types
└── index.ts              # Re-exports
```

## Dependencies

No new dependencies required.

## Validation

- [x] Order state machine enforces valid transitions
- [x] Hedge state machine enforces valid transitions
- [x] Invalid transitions return error objects
- [x] State transitions are persisted to database (in-memory logger for MVP)
- [x] All terminal states are properly handled
- [x] Unit tests pass

## References

- [MVP Roadmap](../../active/0001-mvp/README.md)
- [ADR-0012: State Machines](../../../../../adrs/0012-state-machines.md)
- [ADR-0001: Bot Architecture](../../../../../adrs/0001-bot-architecture.md)
