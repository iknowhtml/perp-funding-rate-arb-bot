/**
 * State machine exports.
 *
 * @see {@link ../../adrs/0012-state-machines.md ADR-0012: State Machines}
 */

// Shared types
export type { StateTransition, TransitionResult } from "./types";
export { isStateTransition, isTransitionOk, stateTransitionSchema } from "./types";

// Order state machine
export type { ManagedOrder, OrderEvent, OrderStatus } from "./order-state";
export {
  createManagedOrder,
  isOrderStatus,
  isTerminalOrderStatus,
  ORDER_ACK_TIMEOUT_MS,
  ORDER_FILL_TIMEOUT_MS,
  ORDER_TERMINAL_STATES,
  ORDER_TRANSITIONS,
  orderStatusSchema,
  transitionOrder,
} from "./order-state";

// Hedge state machine
export type { HedgeEvent, HedgePhase, HedgeState } from "./hedge-state";
export {
  HEDGE_TERMINAL_PHASE,
  HEDGE_TRANSITIONS,
  hedgePhaseSchema,
  isHedgePhase,
  isTerminalHedgePhase,
  transitionHedge,
} from "./hedge-state";

// Persistence
export type { TransitionLogger } from "./persistence";
export { createStateTransition, createTransitionLogger } from "./persistence";
