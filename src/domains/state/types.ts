/**
 * Shared types for state machine transitions and persistence.
 *
 * @see {@link ../../../adrs/0012-state-machines.md ADR-0012: State Machines}
 */

import * as v from "valibot";

/**
 * Result type for state machine transitions.
 *
 * Returns either a successful transition with the new state, or an error.
 */
export type TransitionResult<T> =
  | { ok: true; state: T; from: string; to: string }
  | { ok: false; error: string };

/**
 * State transition record for audit trail.
 *
 * Records every state transition with metadata for debugging and compliance.
 */
export interface StateTransition {
  id: string;
  timestamp: Date;
  entityType: "order" | "hedge";
  entityId: string;
  fromState: string;
  toState: string;
  event: Record<string, unknown>;
  correlationId: string;
}

/**
 * Type guard for successful transition results.
 */
export const isTransitionOk = <T>(
  result: TransitionResult<T>,
): result is { ok: true; state: T; from: string; to: string } => result.ok;

/**
 * Valibot schema for StateTransition.
 */
export const stateTransitionSchema = v.object({
  id: v.string(),
  timestamp: v.date(),
  entityType: v.picklist(["order", "hedge"] as const),
  entityId: v.string(),
  fromState: v.string(),
  toState: v.string(),
  event: v.record(v.string(), v.unknown()),
  correlationId: v.string(),
});

/**
 * Type guard for StateTransition.
 */
export const isStateTransition = (value: unknown): value is StateTransition =>
  v.is(stateTransitionSchema, value);
