/**
 * Order state machine for tracking order lifecycle transitions.
 *
 * @see {@link ../../../adrs/0012-state-machines.md ADR-0012: State Machines}
 */

import * as v from "valibot";

import type { OrderSide } from "@/adapters/types";

import type { TransitionResult } from "./types";

/**
 * Order status representing the bot's internal lifecycle.
 *
 * Distinct from ExchangeOrderStatus which represents exchange API responses.
 */
export type OrderStatus =
  | "CREATED"
  | "SUBMITTED"
  | "ACKED"
  | "PARTIAL"
  | "FILLED"
  | "CANCELED"
  | "REJECTED";

/**
 * Valid transitions from each order status.
 *
 * Terminal states (FILLED, CANCELED, REJECTED) have empty arrays.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  CREATED: ["SUBMITTED"],
  SUBMITTED: ["ACKED", "REJECTED", "CANCELED"],
  ACKED: ["PARTIAL", "FILLED", "CANCELED", "REJECTED"],
  PARTIAL: ["PARTIAL", "FILLED", "CANCELED"],
  FILLED: [], // Terminal state
  CANCELED: [], // Terminal state
  REJECTED: [], // Terminal state
};

/**
 * Terminal order statuses that cannot transition to any other state.
 */
export const ORDER_TERMINAL_STATES: readonly OrderStatus[] = [
  "FILLED",
  "CANCELED",
  "REJECTED",
] as const;

/**
 * Order event types for state transitions.
 */
export type OrderEvent =
  | { type: "SUBMIT"; orderId: string }
  | { type: "ACK"; exchangeOrderId: string }
  | { type: "PARTIAL_FILL"; filledQtyBase: bigint; avgPriceQuote: bigint }
  | { type: "FILL"; filledQtyBase: bigint; avgPriceQuote: bigint }
  | { type: "CANCEL"; reason: string }
  | { type: "REJECT"; error: string }
  | { type: "TIMEOUT"; reason: string };

/**
 * Managed order with state machine lifecycle tracking.
 *
 * Includes timeout tracking and intent ID for idempotency.
 */
export interface ManagedOrder {
  id: string;
  intentId: string;
  symbol: string;
  side: OrderSide;
  quantityBase: bigint;
  filledQuantityBase: bigint;
  priceQuote: bigint | null;
  avgFillPriceQuote: bigint | null;
  status: OrderStatus;
  exchangeOrderId: string | null;
  submittedAt: Date | null;
  ackedAt: Date | null;
  cancelReason: string | null;
  rejectError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Timeout constants for order lifecycle.
 */
export const ORDER_ACK_TIMEOUT_MS = 30_000; // 30 seconds
export const ORDER_FILL_TIMEOUT_MS = 60_000; // 60 seconds

/**
 * Check if an order status is terminal.
 */
export const isTerminalOrderStatus = (status: OrderStatus): boolean =>
  ORDER_TERMINAL_STATES.includes(status);

/**
 * Map event type to target order status.
 */
const eventToStatus = (event: OrderEvent): OrderStatus => {
  switch (event.type) {
    case "SUBMIT":
      return "SUBMITTED";
    case "ACK":
      return "ACKED";
    case "PARTIAL_FILL":
      return "PARTIAL";
    case "FILL":
      return "FILLED";
    case "CANCEL":
    case "TIMEOUT":
      return "CANCELED";
    case "REJECT":
      return "REJECTED";
  }
};

/**
 * Apply event data to order, returning updated fields.
 */
const applyEvent = (order: ManagedOrder, event: OrderEvent): Partial<ManagedOrder> => {
  const now = new Date();
  const updates: Partial<ManagedOrder> = {
    updatedAt: now,
  };

  switch (event.type) {
    case "SUBMIT":
      updates.submittedAt = now;
      break;
    case "ACK":
      updates.exchangeOrderId = event.exchangeOrderId;
      updates.ackedAt = now;
      break;
    case "PARTIAL_FILL":
      updates.filledQuantityBase = order.filledQuantityBase + event.filledQtyBase;
      updates.avgFillPriceQuote = event.avgPriceQuote;
      break;
    case "FILL":
      updates.filledQuantityBase = order.quantityBase;
      updates.avgFillPriceQuote = event.avgPriceQuote;
      break;
    case "CANCEL":
      updates.cancelReason = event.reason;
      break;
    case "REJECT":
      updates.rejectError = event.error;
      break;
    case "TIMEOUT":
      updates.cancelReason = `Timeout: ${event.reason}`;
      break;
  }

  return updates;
};

/**
 * Transition an order to a new state based on an event.
 *
 * Validates the transition is allowed and applies event data.
 *
 * @param order - Current order state
 * @param event - Event triggering the transition
 * @returns Transition result with new state or error
 */
export const transitionOrder = (
  order: ManagedOrder,
  event: OrderEvent,
): TransitionResult<ManagedOrder> => {
  // Terminal states cannot transition
  if (isTerminalOrderStatus(order.status)) {
    return {
      ok: false,
      error: `Cannot transition from terminal state: ${order.status}`,
    };
  }

  const targetStatus = eventToStatus(event);
  const validNextStates = ORDER_TRANSITIONS[order.status];

  if (!validNextStates.includes(targetStatus)) {
    return {
      ok: false,
      error: `Invalid transition: ${order.status} -> ${targetStatus}`,
    };
  }

  const eventUpdates = applyEvent(order, event);
  const newState: ManagedOrder = {
    ...order,
    ...eventUpdates,
    status: targetStatus,
  };

  return {
    ok: true,
    state: newState,
    from: order.status,
    to: targetStatus,
  };
};

/**
 * Create a new managed order in CREATED state.
 *
 * @param params - Order creation parameters
 * @returns New managed order
 */
export const createManagedOrder = (params: {
  id: string;
  intentId: string;
  symbol: string;
  side: OrderSide;
  quantityBase: bigint;
  priceQuote: bigint | null;
}): ManagedOrder => {
  const now = new Date();
  return {
    id: params.id,
    intentId: params.intentId,
    symbol: params.symbol,
    side: params.side,
    quantityBase: params.quantityBase,
    filledQuantityBase: 0n,
    priceQuote: params.priceQuote,
    avgFillPriceQuote: null,
    status: "CREATED",
    exchangeOrderId: null,
    submittedAt: null,
    ackedAt: null,
    cancelReason: null,
    rejectError: null,
    createdAt: now,
    updatedAt: now,
  };
};

/**
 * Valibot schema for OrderStatus.
 */
export const orderStatusSchema = v.picklist([
  "CREATED",
  "SUBMITTED",
  "ACKED",
  "PARTIAL",
  "FILLED",
  "CANCELED",
  "REJECTED",
] as const);

/**
 * Type guard for OrderStatus.
 */
export const isOrderStatus = (value: unknown): value is OrderStatus =>
  v.is(orderStatusSchema, value);
