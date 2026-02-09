/**
 * Risk evaluation logic.
 *
 * Computes risk metrics from a RiskSnapshot and evaluates risk level/action.
 * Reuses existing calculation functions from src/domains/position/metrics.ts.
 *
 * @see {@link ../../../adrs/0013-risk-management.md ADR-0013: Risk Management Engine}
 */

import { calculateLiquidationDistanceBps, calculateMarginUtilizationBps } from "@/domains/position";

import type { RiskConfig } from "./config";
import type { RiskAction, RiskAssessment, RiskLevel, RiskMetrics, RiskSnapshot } from "./types";
import { escalateRiskAction, escalateRiskLevel } from "./types";

/** Basis points per unit (1 = 10000 bps). */
const BPS_PER_UNIT = 10000n;

/**
 * Calculate risk metrics from a risk snapshot.
 *
 * Notional and leverage come directly from the snapshot (already computed by caller).
 * Margin utilization and liquidation distance are computed using reusable functions
 * from src/domains/position/metrics.ts.
 * Drawdown is computed from peak equity.
 */
export const calculateRiskMetrics = (snapshot: RiskSnapshot): RiskMetrics => {
  const notionalQuote = snapshot.position?.notionalQuote ?? 0n;
  const leverageBps = snapshot.position?.leverageBps ?? 0n;

  const marginUtilizationBps = calculateMarginUtilizationBps(
    snapshot.marginUsedQuote,
    snapshot.equityQuote,
  );

  const liquidationDistanceBps = snapshot.position
    ? calculateLiquidationDistanceBps(
        snapshot.position.markPriceQuote,
        snapshot.position.liquidationPriceQuote,
        snapshot.position.side,
      )
    : BPS_PER_UNIT; // 100% buffer if no position

  const drawdownBps =
    snapshot.peakEquityQuote > 0n
      ? ((snapshot.peakEquityQuote - snapshot.equityQuote) * BPS_PER_UNIT) /
        snapshot.peakEquityQuote
      : 0n;

  return {
    notionalQuote,
    leverageBps,
    marginUtilizationBps,
    liquidationDistanceBps,
    dailyPnlQuote: snapshot.dailyPnlQuote,
    drawdownBps,
  };
};

/**
 * Evaluate risk from a snapshot against configuration limits.
 *
 * Returns a RiskAssessment with level, action, reasons, and computed metrics.
 * Uses escalation helpers to ensure severity only increases across checks.
 *
 * Check order:
 * 1. Hard limits (BLOCK): position size, leverage
 * 2. Danger limits (EXIT): daily loss, drawdown, liquidation buffer
 * 3. Warning limits (PAUSE): margin utilization
 * 4. Soft limits (CAUTION): approaching any of the above
 */
export const evaluateRisk = (snapshot: RiskSnapshot, config: RiskConfig): RiskAssessment => {
  const metrics = calculateRiskMetrics(snapshot);
  const reasons: string[] = [];
  let level: RiskLevel = "SAFE";
  let action: RiskAction = "ALLOW";

  // Convert config USD values to quote units
  const quoteScale = 10n ** BigInt(config.quoteDecimals);
  const maxPositionSizeQuote = BigInt(config.maxPositionSizeUsd) * quoteScale;
  const maxLeverageBps = BigInt(config.maxLeverageBps);
  const maxDailyLossQuote = BigInt(config.maxDailyLossUsd) * quoteScale;
  const maxDrawdownBps = BigInt(config.maxDrawdownBps);
  const minLiquidationBufferBps = BigInt(config.minLiquidationBufferBps);
  const maxMarginUtilizationBps = BigInt(config.maxMarginUtilizationBps);
  const warningPositionSizeQuote = BigInt(config.warningPositionSizeUsd) * quoteScale;
  const warningMarginUtilizationBps = BigInt(config.warningMarginUtilizationBps);
  const warningLiquidationBufferBps = BigInt(config.warningLiquidationBufferBps);

  // 1. Check hard limits (BLOCK if exceeded)
  if (metrics.notionalQuote > maxPositionSizeQuote) {
    reasons.push("Position size exceeds maximum");
    level = escalateRiskLevel(level, "BLOCKED");
    action = escalateRiskAction(action, "BLOCK");
  }

  if (metrics.leverageBps > maxLeverageBps) {
    reasons.push("Leverage exceeds maximum");
    level = escalateRiskLevel(level, "BLOCKED");
    action = escalateRiskAction(action, "BLOCK");
  }

  // 2. Check danger limits (EXIT)
  if (metrics.dailyPnlQuote < -maxDailyLossQuote) {
    reasons.push("Daily loss exceeds maximum");
    level = escalateRiskLevel(level, "DANGER");
    action = escalateRiskAction(action, "EXIT");
  }

  if (metrics.drawdownBps > maxDrawdownBps) {
    reasons.push("Drawdown exceeds maximum");
    level = escalateRiskLevel(level, "DANGER");
    action = escalateRiskAction(action, "EXIT");
  }

  if (metrics.liquidationDistanceBps < minLiquidationBufferBps) {
    reasons.push("Liquidation buffer below minimum");
    level = escalateRiskLevel(level, "DANGER");
    action = escalateRiskAction(action, "EXIT");
  }

  // 3. Check warning limits (PAUSE)
  if (metrics.marginUtilizationBps > maxMarginUtilizationBps) {
    reasons.push("Margin utilization exceeds maximum");
    level = escalateRiskLevel(level, "WARNING");
    action = escalateRiskAction(action, "PAUSE");
  }

  // 4. Check soft limits (CAUTION)
  if (metrics.notionalQuote > warningPositionSizeQuote) {
    reasons.push("Position size approaching limit");
    level = escalateRiskLevel(level, "CAUTION");
  }

  if (metrics.marginUtilizationBps > warningMarginUtilizationBps) {
    reasons.push("Margin utilization approaching limit");
    level = escalateRiskLevel(level, "CAUTION");
  }

  if (metrics.liquidationDistanceBps < warningLiquidationBufferBps) {
    reasons.push("Liquidation buffer approaching minimum");
    level = escalateRiskLevel(level, "CAUTION");
  }

  return { level, action, reasons, metrics };
};
