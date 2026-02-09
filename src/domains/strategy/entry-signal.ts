/**
 * Entry signal generation for funding rate strategy.
 *
 * Generates entry signals when funding rate conditions are favorable.
 *
 * @see {@link ../../../adrs/0014-funding-rate-strategy.md ADR-0014: Funding Rate Prediction & Strategy}
 */

import type { StrategyConfig } from "./config";
import type { EntrySignal, FundingRateHistory, FundingRateSnapshot } from "./types";

/**
 * Generate entry signal based on funding rate analysis.
 *
 * Returns null if conditions are not met for entry.
 * Otherwise returns EntrySignal with confidence level and reasons.
 */
export const generateEntrySignal = (
  fundingRate: FundingRateSnapshot,
  history: FundingRateHistory,
  config: StrategyConfig,
): EntrySignal | null => {
  const reasons: string[] = [];
  let confidence: "HIGH" | "MEDIUM" | "LOW" = "LOW";
  const minFundingRateBps = BigInt(config.minFundingRateBps);
  const minPredictedRateBps = BigInt(config.minPredictedRateBps);

  // 1. Check current rate threshold
  if (fundingRate.currentRateBps < minFundingRateBps) {
    return null; // Below threshold
  }
  reasons.push(`Current rate ${fundingRate.currentRateBps}bps exceeds min ${minFundingRateBps}bps`);

  // 2. Check regime (must be high_*)
  if (history.regime === "low_stable" || history.regime === "low_volatile") {
    return null; // Low funding regime
  }
  if (history.regime === "high_stable") {
    reasons.push("Regime is high_stable");
    confidence = "HIGH";
  } else if (history.regime === "high_volatile") {
    reasons.push("Regime is high_volatile");
    confidence = "MEDIUM";
  }

  // 3. Check trend
  if (history.trend === "decreasing") {
    reasons.push("Trend is decreasing");
    confidence = confidence === "HIGH" ? "MEDIUM" : "LOW";
  } else if (history.trend === "increasing") {
    reasons.push("Trend is increasing");
    // High volatile regime caps at MEDIUM, otherwise HIGH
    confidence = confidence === "MEDIUM" ? "MEDIUM" : "HIGH";
  } else {
    reasons.push("Trend is stable");
  }

  // 4. Check predicted rate vs current
  if (fundingRate.predictedRateBps < fundingRate.currentRateBps) {
    reasons.push(`Predicted rate ${fundingRate.predictedRateBps}bps is lower than current`);
    confidence = confidence === "HIGH" ? "MEDIUM" : "LOW";
  } else {
    reasons.push(`Predicted rate ${fundingRate.predictedRateBps}bps is higher than current`);
  }

  // 5. Check predicted rate against minimum threshold (always reduces confidence)
  if (fundingRate.predictedRateBps < minPredictedRateBps) {
    reasons.push(
      `Predicted rate ${fundingRate.predictedRateBps}bps below minimum ${minPredictedRateBps}bps`,
    );
    confidence = confidence === "HIGH" ? "MEDIUM" : "LOW";
  }

  // 6. Calculate expected yield
  // Assume 8-hour position (one funding period)
  const positionDurationHours = 8;
  const expectedYieldBps = (fundingRate.predictedRateBps * BigInt(positionDurationHours)) / 8n;

  return {
    type: "ENTER",
    confidence,
    reasons,
    fundingRate,
    history,
    expectedYieldBps,
  };
};
