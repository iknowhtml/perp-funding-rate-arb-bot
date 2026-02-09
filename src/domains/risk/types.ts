/**
 * Risk management types, schemas, and type guards.
 *
 * @see {@link ../../../adrs/0013-risk-management.md ADR-0013: Risk Management Engine}
 */

import * as v from "valibot";

// --- Risk Levels and Actions ---

/**
 * Risk levels ordered by severity: SAFE < CAUTION < WARNING < DANGER < BLOCKED.
 */
export type RiskLevel = "SAFE" | "CAUTION" | "WARNING" | "DANGER" | "BLOCKED";

/**
 * Risk actions ordered by escalation: ALLOW < PAUSE < EXIT < BLOCK.
 */
export type RiskAction = "ALLOW" | "PAUSE" | "EXIT" | "BLOCK";

/** Numeric severity for RiskLevel comparison (higher = more severe). */
const RISK_LEVEL_SEVERITY: Record<RiskLevel, number> = {
  SAFE: 0,
  CAUTION: 1,
  WARNING: 2,
  DANGER: 3,
  BLOCKED: 4,
};

/** Numeric severity for RiskAction comparison (higher = more severe). */
const RISK_ACTION_SEVERITY: Record<RiskAction, number> = {
  ALLOW: 0,
  PAUSE: 1,
  EXIT: 2,
  BLOCK: 3,
};

/**
 * Escalate risk level to the more severe of two levels.
 * Ensures severity only increases, never decreases.
 */
export const escalateRiskLevel = (current: RiskLevel, next: RiskLevel): RiskLevel =>
  RISK_LEVEL_SEVERITY[next] > RISK_LEVEL_SEVERITY[current] ? next : current;

/**
 * Escalate risk action to the more severe of two actions.
 * Ensures action severity only increases, never decreases.
 */
export const escalateRiskAction = (current: RiskAction, next: RiskAction): RiskAction =>
  RISK_ACTION_SEVERITY[next] > RISK_ACTION_SEVERITY[current] ? next : current;

// --- Risk Metrics and Assessment ---

/**
 * Computed risk metrics from current state.
 *
 * All amounts in quote currency smallest units (`*Quote`),
 * all ratios in basis points (`*Bps`).
 */
export interface RiskMetrics {
  notionalQuote: bigint;
  leverageBps: bigint;
  marginUtilizationBps: bigint;
  liquidationDistanceBps: bigint;
  dailyPnlQuote: bigint;
  drawdownBps: bigint;
}

/**
 * Result of risk evaluation.
 */
export interface RiskAssessment {
  level: RiskLevel;
  action: RiskAction;
  reasons: string[];
  metrics: RiskMetrics;
}

// --- Risk Snapshot (Input) ---

/**
 * Input snapshot for risk evaluation, decoupled from BotState.
 *
 * Caller constructs this from BotState + Position + Balance data.
 * This keeps the risk engine pure and testable.
 */
export interface RiskSnapshot {
  equityQuote: bigint;
  marginUsedQuote: bigint;
  position: {
    side: "LONG" | "SHORT";
    notionalQuote: bigint;
    leverageBps: bigint;
    markPriceQuote: bigint;
    liquidationPriceQuote: bigint | null;
  } | null;
  dailyPnlQuote: bigint;
  peakEquityQuote: bigint;
}

// --- Emergency Actions ---

export type EmergencyActionType = "KILL_SWITCH" | "REDUCE_ONLY" | "ALERT";

export interface EmergencyAction {
  type: EmergencyActionType;
  reason: string;
  timestamp: Date;
}

/**
 * Alert callback for emergency actions.
 * Simple function type — no full AlertService exists yet.
 */
export type AlertCallback = (action: EmergencyAction) => Promise<void>;

// --- Valibot Schemas ---

export const riskLevelSchema = v.picklist([
  "SAFE",
  "CAUTION",
  "WARNING",
  "DANGER",
  "BLOCKED",
] as const);

export const riskActionSchema = v.picklist(["ALLOW", "PAUSE", "EXIT", "BLOCK"] as const);

export const riskMetricsSchema = v.object({
  notionalQuote: v.bigint(),
  leverageBps: v.bigint(),
  marginUtilizationBps: v.bigint(),
  liquidationDistanceBps: v.bigint(),
  dailyPnlQuote: v.bigint(),
  drawdownBps: v.bigint(),
});

export const riskAssessmentSchema = v.object({
  level: riskLevelSchema,
  action: riskActionSchema,
  reasons: v.array(v.string()),
  metrics: riskMetricsSchema,
});

export const emergencyActionTypeSchema = v.picklist([
  "KILL_SWITCH",
  "REDUCE_ONLY",
  "ALERT",
] as const);

export const emergencyActionSchema = v.object({
  type: emergencyActionTypeSchema,
  reason: v.string(),
  timestamp: v.date(),
});

// --- Type Guards ---

export const isRiskLevel = (value: unknown): value is RiskLevel => v.is(riskLevelSchema, value);

export const isRiskAction = (value: unknown): value is RiskAction => v.is(riskActionSchema, value);

export const isRiskAssessment = (value: unknown): value is RiskAssessment =>
  v.is(riskAssessmentSchema, value);

export const isEmergencyAction = (value: unknown): value is EmergencyAction =>
  v.is(emergencyActionSchema, value);
