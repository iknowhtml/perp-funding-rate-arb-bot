/**
 * Emergency action functions for risk management.
 *
 * Provides kill switch, reduce-only mode, and emergency condition detection.
 * Uses AlertCallback (simple function type) rather than a full AlertService.
 *
 * @see {@link ../../../adrs/0013-risk-management.md ADR-0013: Risk Management Engine}
 */

import type { AlertCallback, EmergencyAction, EmergencyActionType, RiskAssessment } from "./types";

/**
 * Trigger the kill switch: exit all positions and halt trading.
 *
 * Sends a critical alert via callback and returns the emergency action record.
 *
 * @param reason - Human-readable reason for triggering the kill switch
 * @param onAlert - Callback to send the emergency alert
 * @returns The recorded EmergencyAction
 */
export const triggerKillSwitch = async (
  reason: string,
  onAlert: AlertCallback,
): Promise<EmergencyAction> => {
  const emergencyAction: EmergencyAction = {
    type: "KILL_SWITCH",
    reason,
    timestamp: new Date(),
  };
  await onAlert(emergencyAction);
  return emergencyAction;
};

/**
 * Enter reduce-only mode: allow exits but block new entries.
 *
 * Sends a warning alert via callback and returns the emergency action record.
 *
 * @param reason - Human-readable reason for entering reduce-only mode
 * @param onAlert - Callback to send the emergency alert
 * @returns The recorded EmergencyAction
 */
export const enterReduceOnlyMode = async (
  reason: string,
  onAlert: AlertCallback,
): Promise<EmergencyAction> => {
  const emergencyAction: EmergencyAction = {
    type: "REDUCE_ONLY",
    reason,
    timestamp: new Date(),
  };
  await onAlert(emergencyAction);
  return emergencyAction;
};

/**
 * Determine if an emergency action is needed based on risk assessment.
 *
 * @param assessment - The current risk assessment
 * @returns The type of emergency action needed, or null if none required
 */
export const checkEmergencyConditions = (
  assessment: RiskAssessment,
): EmergencyActionType | null => {
  if (assessment.level === "BLOCKED" || assessment.action === "BLOCK") {
    return "KILL_SWITCH";
  }
  if (assessment.level === "DANGER" || assessment.action === "EXIT") {
    return "KILL_SWITCH";
  }
  if (assessment.action === "PAUSE") {
    return "REDUCE_ONLY";
  }
  return null;
};
