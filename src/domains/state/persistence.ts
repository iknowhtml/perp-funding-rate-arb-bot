/**
 * State transition persistence for audit trail.
 *
 * MVP: In-memory logger with structured logging.
 * Future: Database persistence via Drizzle migration.
 *
 * @see {@link ../../../adrs/0012-state-machines.md ADR-0012: State Machines}
 */

import { randomUUID } from "node:crypto";

import { logger } from "@/lib/logger";

import type { StateTransition } from "./types";

/**
 * Transition logger interface for recording state transitions.
 */
export interface TransitionLogger {
  /**
   * Log a state transition.
   */
  log(transition: StateTransition): void;

  /**
   * Get all transitions for a specific entity.
   */
  getTransitions(entityId: string): readonly StateTransition[];

  /**
   * Get all recorded transitions.
   */
  getAll(): readonly StateTransition[];

  /**
   * Clear all recorded transitions.
   */
  clear(): void;
}

/**
 * Create a new state transition object with auto-generated ID and timestamp.
 */
export const createStateTransition = (params: {
  entityType: "order" | "hedge";
  entityId: string;
  fromState: string;
  toState: string;
  event: Record<string, unknown>;
  correlationId: string;
}): StateTransition => {
  return {
    id: randomUUID(),
    timestamp: new Date(),
    entityType: params.entityType,
    entityId: params.entityId,
    fromState: params.fromState,
    toState: params.toState,
    event: params.event,
    correlationId: params.correlationId,
  };
};

/**
 * Create a transition logger instance.
 *
 * Stores transitions in memory and logs them via structured logger.
 */
export const createTransitionLogger = (): TransitionLogger => {
  const transitions: StateTransition[] = [];

  return {
    log: (transition: StateTransition): void => {
      transitions.push(transition);

      // Log via structured logger for observability
      logger.info("State transition", {
        transition: {
          id: transition.id,
          entityType: transition.entityType,
          entityId: transition.entityId,
          fromState: transition.fromState,
          toState: transition.toState,
          event: transition.event,
          correlationId: transition.correlationId,
          timestamp: transition.timestamp.toISOString(),
        },
      });
    },

    getTransitions: (entityId: string): readonly StateTransition[] => {
      return transitions.filter((t) => t.entityId === entityId);
    },

    getAll: (): readonly StateTransition[] => {
      return [...transitions];
    },

    clear: (): void => {
      transitions.length = 0;
    },
  };
};
