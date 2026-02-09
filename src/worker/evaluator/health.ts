/**
 * Health evaluation for the evaluation pipeline.
 *
 * Determines health response (EMERGENCY_EXIT, FORCE_EXIT, PAUSE, etc.) from
 * a HealthSnapshot. Caller builds the snapshot from isStateFresh() and
 * HealthMonitor.
 *
 * @see {@link ../../../adrs/0001-bot-architecture.md ADR-0001: Bot Architecture}
 */

import type { DerivedPosition } from "@/domains/position";

/**
 * Actions the evaluation pipeline can take based on health.
 */
export type HealthAction =
  | "EMERGENCY_EXIT"
  | "FORCE_EXIT"
  | "FULL_PAUSE"
  | "PAUSE_ENTRIES"
  | "REDUCE_RISK"
  | "CONTINUE";

/**
 * Snapshot of health state for evaluation.
 * Built by caller from isStateFresh(), HealthMonitor, and derived position.
 */
export interface HealthSnapshot {
  /** REST data (ticker, funding, account) is fresh. */
  restFresh: boolean;
  /** WebSocket streams are healthy. */
  wsFresh: boolean;
  /** Current derived position, or null if flat. */
  position: DerivedPosition | null;
}

/**
 * Response from health evaluation.
 */
export interface HealthResponse {
  action: HealthAction;
  reason?: string;
}

/** Margin buffer threshold for force exit when REST is failing (5% = 500 bps). */
const LOW_MARGIN_BUFFER_BPS = 500n;

/** Position age threshold for force exit when WS is stale (30s). */
const WS_STALE_POSITION_AGE_MS = 30_000;

/**
 * Evaluate health and determine the appropriate response action.
 *
 * Logic (per ADR-0001):
 * - Both REST and WS failing: emergency exit if position open, else full pause.
 * - WS stale: pause entries if no position; if position and age > 30s, force exit; else pause entries.
 * - REST failing with position: force exit if margin buffer < 5%, else reduce risk.
 * - Otherwise: continue.
 */
export const evaluateHealthResponse = (snapshot: HealthSnapshot): HealthResponse => {
  const { restFresh, wsFresh, position } = snapshot;

  // Both failing = emergency
  if (!restFresh && !wsFresh) {
    if (position?.open) {
      return { action: "EMERGENCY_EXIT", reason: "all_feeds_down" };
    }
    return { action: "FULL_PAUSE" };
  }

  // WS stale handling depends on position
  if (!wsFresh) {
    if (!position?.open) {
      return { action: "PAUSE_ENTRIES" };
    }
    const positionAgeMs = Date.now() - (position.entryTime?.getTime() ?? 0);
    if (positionAgeMs > WS_STALE_POSITION_AGE_MS) {
      return { action: "FORCE_EXIT", reason: "ws_stale_with_position" };
    }
    return { action: "PAUSE_ENTRIES" };
  }

  // REST failing with position = risky
  if (!restFresh && position?.open) {
    if (position.marginBufferBps < LOW_MARGIN_BUFFER_BPS) {
      return { action: "FORCE_EXIT", reason: "rest_failing_low_margin" };
    }
    return { action: "REDUCE_RISK" };
  }

  return { action: "CONTINUE" };
};
