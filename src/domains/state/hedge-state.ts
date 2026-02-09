/**
 * Hedge state machine for tracking hedge lifecycle transitions.
 *
 * @see {@link ../../../adrs/0012-state-machines.md ADR-0012: State Machines}
 */

import * as v from "valibot";

import type { TransitionResult } from "./types";

/**
 * Hedge phase types.
 */
export type HedgePhase =
  | "IDLE"
  | "ENTERING_PERP"
  | "ENTERING_SPOT"
  | "ACTIVE"
  | "EXITING_SPOT"
  | "EXITING_PERP"
  | "CLOSED";

/**
 * Hedge state discriminated union.
 *
 * Each phase carries different data relevant to that phase.
 */
export type HedgeState =
  | { phase: "IDLE" }
  | { phase: "ENTERING_PERP"; intentId: string; symbol: string }
  | { phase: "ENTERING_SPOT"; perpFilled: boolean; symbol: string }
  | {
      phase: "ACTIVE";
      symbol: string;
      notionalQuote: bigint;
      spotQtyBase: bigint;
      perpQtyBase: bigint;
    }
  | { phase: "EXITING_SPOT"; symbol: string }
  | { phase: "EXITING_PERP"; symbol: string }
  | { phase: "CLOSED"; symbol: string; pnlQuote: bigint };

/**
 * Valid transitions from each hedge phase.
 *
 * CLOSED is terminal (empty array).
 */
export const HEDGE_TRANSITIONS: Record<HedgePhase, HedgePhase[]> = {
  IDLE: ["ENTERING_PERP"],
  ENTERING_PERP: ["ENTERING_SPOT", "IDLE"], // Can abort
  ENTERING_SPOT: ["ACTIVE", "IDLE"], // Can abort
  ACTIVE: ["EXITING_SPOT"],
  EXITING_SPOT: ["EXITING_PERP"],
  EXITING_PERP: ["CLOSED"],
  CLOSED: [], // Terminal state
};

/**
 * Terminal hedge phase.
 */
export const HEDGE_TERMINAL_PHASE: HedgePhase = "CLOSED";

/**
 * Hedge event types for state transitions.
 */
export type HedgeEvent =
  | { type: "START_ENTRY"; intentId: string; symbol: string }
  | { type: "PERP_FILLED"; filledQtyBase: bigint }
  | { type: "SPOT_FILLED"; filledQtyBase: bigint }
  | { type: "START_EXIT"; reason: string }
  | { type: "SPOT_SOLD" }
  | { type: "PERP_CLOSED"; pnlQuote: bigint }
  | { type: "ABORT"; reason: string };

/**
 * Check if a hedge phase is terminal.
 */
export const isTerminalHedgePhase = (phase: HedgePhase): boolean => phase === "CLOSED";

/**
 * Map event type to target hedge phase.
 */
const eventToPhase = (event: HedgeEvent): HedgePhase => {
  switch (event.type) {
    case "START_ENTRY":
      return "ENTERING_PERP";
    case "PERP_FILLED":
      return "ENTERING_SPOT";
    case "SPOT_FILLED":
      return "ACTIVE";
    case "START_EXIT":
      return "EXITING_SPOT";
    case "SPOT_SOLD":
      return "EXITING_PERP";
    case "PERP_CLOSED":
      return "CLOSED";
    case "ABORT":
      return "IDLE";
  }
};

/**
 * Construct new hedge state from current state and event.
 */
const applyHedgeEvent = (state: HedgeState, event: HedgeEvent): HedgeState => {
  switch (event.type) {
    case "START_ENTRY":
      return {
        phase: "ENTERING_PERP",
        intentId: event.intentId,
        symbol: event.symbol,
      };
    case "PERP_FILLED":
      if (state.phase === "ENTERING_PERP") {
        return {
          phase: "ENTERING_SPOT",
          perpFilled: true,
          symbol: state.symbol,
        };
      }
      throw new Error(`PERP_FILLED event invalid in phase: ${state.phase}`);
    case "SPOT_FILLED":
      if (state.phase === "ENTERING_SPOT") {
        // For MVP, we don't have full position data here, so we use placeholder values
        // In production, this would come from the position derivation system
        return {
          phase: "ACTIVE",
          symbol: state.symbol,
          notionalQuote: 0n, // Will be updated by position derivation
          spotQtyBase: event.filledQtyBase,
          perpQtyBase: 0n, // Will be updated by position derivation
        };
      }
      throw new Error(`SPOT_FILLED event invalid in phase: ${state.phase}`);
    case "START_EXIT":
      if (state.phase === "ACTIVE") {
        return {
          phase: "EXITING_SPOT",
          symbol: state.symbol,
        };
      }
      throw new Error(`START_EXIT event invalid in phase: ${state.phase}`);
    case "SPOT_SOLD":
      if (state.phase === "EXITING_SPOT") {
        return {
          phase: "EXITING_PERP",
          symbol: state.symbol,
        };
      }
      throw new Error(`SPOT_SOLD event invalid in phase: ${state.phase}`);
    case "PERP_CLOSED":
      if (state.phase === "EXITING_PERP") {
        return {
          phase: "CLOSED",
          symbol: state.symbol,
          pnlQuote: event.pnlQuote,
        };
      }
      throw new Error(`PERP_CLOSED event invalid in phase: ${state.phase}`);
    case "ABORT":
      return {
        phase: "IDLE",
      };
    default: {
      // Exhaustiveness check
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
};

/**
 * Transition a hedge to a new state based on an event.
 *
 * Validates the transition is allowed and constructs the new state variant.
 *
 * @param state - Current hedge state
 * @param event - Event triggering the transition
 * @returns Transition result with new state or error
 */
export const transitionHedge = (
  state: HedgeState,
  event: HedgeEvent,
): TransitionResult<HedgeState> => {
  // Terminal state cannot transition
  if (isTerminalHedgePhase(state.phase)) {
    return {
      ok: false,
      error: `Cannot transition from terminal phase: ${state.phase}`,
    };
  }

  const targetPhase = eventToPhase(event);
  const validNextPhases = HEDGE_TRANSITIONS[state.phase];

  if (!validNextPhases.includes(targetPhase)) {
    return {
      ok: false,
      error: `Invalid transition: ${state.phase} -> ${targetPhase}`,
    };
  }

  try {
    const newState = applyHedgeEvent(state, event);
    return {
      ok: true,
      state: newState,
      from: state.phase,
      to: targetPhase,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * Valibot schema for HedgePhase.
 */
export const hedgePhaseSchema = v.picklist([
  "IDLE",
  "ENTERING_PERP",
  "ENTERING_SPOT",
  "ACTIVE",
  "EXITING_SPOT",
  "EXITING_PERP",
  "CLOSED",
] as const);

/**
 * Type guard for HedgePhase.
 */
export const isHedgePhase = (value: unknown): value is HedgePhase => v.is(hedgePhaseSchema, value);
