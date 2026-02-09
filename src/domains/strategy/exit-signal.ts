/**
 * Exit signal generation for funding rate strategy.
 *
 * Generates exit signals when funding rate conditions deteriorate or target yield is reached.
 *
 * @see {@link ../../../adrs/0014-funding-rate-strategy.md ADR-0014: Funding Rate Prediction & Strategy}
 */

import type { StrategyConfig } from "./config";
import type {
  ExitSignal,
  FundingRateHistory,
  FundingRateSnapshot,
  StrategyPosition,
} from "./types";

/**
 * Calculate realized yield since position entry.
 *
 * Funding is paid every 8 hours, so calculates yield based on number of funding periods elapsed.
 */
export const calculateRealizedYieldBps = (
  position: StrategyPosition,
  currentFundingRate: FundingRateSnapshot,
): bigint => {
  const holdTimeMs = currentFundingRate.timestamp.getTime() - position.entryTime.getTime();
  const holdTimeHours = holdTimeMs / (1000 * 60 * 60);
  // Funding is paid every 8 hours, so calculate how many periods
  const fundingPeriods = Math.floor(holdTimeHours / 8);
  // Use entry funding rate for calculation
  // Yield = (size * rate * periods) / 10000 (to convert bps to percentage)
  return (position.sizeQuote * position.entryFundingRateBps * BigInt(fundingPeriods)) / 10000n;
};

/**
 * Generate exit signal based on funding rate analysis and position state.
 *
 * Returns null if conditions do not warrant exit.
 * Otherwise returns ExitSignal with reason and realized yield.
 */
export const generateExitSignal = (
  position: StrategyPosition,
  fundingRate: FundingRateSnapshot,
  history: FundingRateHistory,
  config: StrategyConfig,
): ExitSignal | null => {
  const exitFundingRateBps = BigInt(config.exitFundingRateBps);
  const targetYieldBps = BigInt(config.targetYieldBps);

  // 1. Check predicted rate drop
  if (fundingRate.predictedRateBps < exitFundingRateBps) {
    return {
      type: "EXIT",
      reason: "rate_drop",
      fundingRate,
      history,
      realizedYieldBps: calculateRealizedYieldBps(position, fundingRate),
    };
  }

  // 2. Check trend change
  if (history.trend === "decreasing" && position.entryTrend !== "decreasing") {
    return {
      type: "EXIT",
      reason: "trend_change",
      fundingRate,
      history,
      realizedYieldBps: calculateRealizedYieldBps(position, fundingRate),
    };
  }

  // 3. Check regime change
  if (
    (history.regime === "low_stable" || history.regime === "low_volatile") &&
    position.entryRegime.startsWith("high")
  ) {
    return {
      type: "EXIT",
      reason: "regime_change",
      fundingRate,
      history,
      realizedYieldBps: calculateRealizedYieldBps(position, fundingRate),
    };
  }

  // 4. Check target yield
  // Target yield is in basis points (e.g., 50 = 0.50%), convert to absolute units
  const targetYieldQuote = (position.sizeQuote * targetYieldBps) / 10000n;
  const realizedYieldBps = calculateRealizedYieldBps(position, fundingRate);
  if (realizedYieldBps >= targetYieldQuote) {
    return {
      type: "EXIT",
      reason: "target_reached",
      fundingRate,
      history,
      realizedYieldBps,
    };
  }

  return null;
};
