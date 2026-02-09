/**
 * Risk management module exports.
 *
 * @see {@link ../../../adrs/0013-risk-management.md ADR-0013: Risk Management Engine}
 */

// Types
export type {
  AlertCallback,
  EmergencyAction,
  EmergencyActionType,
  RiskAction,
  RiskAssessment,
  RiskLevel,
  RiskMetrics,
  RiskSnapshot,
} from "./types";

// Type guards
export {
  isEmergencyAction,
  isRiskAction,
  isRiskAssessment,
  isRiskLevel,
} from "./types";

// Schemas
export {
  emergencyActionSchema,
  emergencyActionTypeSchema,
  riskActionSchema,
  riskAssessmentSchema,
  riskLevelSchema,
  riskMetricsSchema,
} from "./types";

// Escalation helpers
export { escalateRiskAction, escalateRiskLevel } from "./types";

// Config
export type { RiskConfig } from "./config";
export { DEFAULT_RISK_CONFIG, RiskConfigSchema } from "./config";

// Evaluation
export { calculateRiskMetrics, evaluateRisk } from "./evaluate";

// Position sizing
export { calculateMaxPositionSizeQuote } from "./position-sizing";

// Emergency actions
export {
  checkEmergencyConditions,
  enterReduceOnlyMode,
  triggerKillSwitch,
} from "./emergency";
