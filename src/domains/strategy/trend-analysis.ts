/**
 * Funding rate trend analysis using pure bigint math.
 *
 * Implements SMA and standard deviation as pure bigint functions to avoid
 * precision loss from bigint → number → bigint conversion.
 *
 * @see {@link ../../../adrs/0014-funding-rate-strategy.md ADR-0014: Funding Rate Prediction & Strategy}
 */

import type { StrategyConfig } from "./config";
import type { FundingRateHistory, FundingRateSnapshot } from "./types";

/**
 * Integer square root via Newton's method.
 *
 * Used by calculateStdDev for variance calculation.
 * Converges in O(log n) steps.
 */
export const bigintSqrt = (value: bigint): bigint => {
  if (value < 0n) throw new Error("Square root of negative number");
  if (value < 2n) return value;
  let x = value;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + value / x) / 2n;
  }
  return x;
};

/**
 * Simple moving average over bigint values (no precision loss).
 */
export const calculateSma = (values: readonly bigint[]): bigint => {
  if (values.length === 0) return 0n;
  const sum = values.reduce((acc, val) => acc + val, 0n);
  return sum / BigInt(values.length);
};

/**
 * Population standard deviation over bigint values.
 *
 * Returns standard deviation in the same unit as input (basis points).
 */
export const calculateStdDev = (values: readonly bigint[]): bigint => {
  if (values.length < 2) return 0n;
  const mean = calculateSma(values);
  const squaredDiffs = values.reduce((acc, v) => acc + (v - mean) ** 2n, 0n);
  const variance = squaredDiffs / BigInt(values.length);
  return bigintSqrt(variance);
};

/**
 * Analyze funding rate trend from historical snapshots.
 *
 * Computes moving average, volatility, trend direction, and regime classification.
 * Uses configurable thresholds for trend and volatility detection.
 */
export const analyzeFundingRateTrend = (
  snapshots: FundingRateSnapshot[],
  config: StrategyConfig,
): FundingRateHistory => {
  const window = config.trendWindow;
  const trendThresholdBps = BigInt(config.trendThresholdBps);
  const volatilityThresholdBps = BigInt(config.volatilityThresholdBps);

  if (snapshots.length < window) {
    const rates = snapshots.map((s) => s.currentRateBps);
    return {
      snapshots,
      averageRateBps: calculateSma(rates),
      volatilityBps: 0n,
      trend: "stable",
      regime: "low_stable",
    };
  }

  const recent = snapshots.slice(-window);
  const rates = recent.map((s) => s.currentRateBps);

  const averageRateBps = calculateSma(rates);
  const volatilityBps = calculateStdDev(rates);

  // Trend: compare first half vs second half using SMA
  const firstHalf = calculateSma(rates.slice(0, Math.floor(window / 2)));
  const secondHalf = calculateSma(rates.slice(Math.floor(window / 2)));
  const trend: "increasing" | "decreasing" | "stable" =
    secondHalf > firstHalf + trendThresholdBps
      ? "increasing"
      : secondHalf < firstHalf - trendThresholdBps
        ? "decreasing"
        : "stable";

  // Regime: high/low based on average, stable/volatile based on volatility
  // Use average rate threshold of 10 bps (0.10%) as per ADR-0014
  const isHigh = averageRateBps > 10n;
  const isVolatile = volatilityBps > volatilityThresholdBps;

  const regime: "high_stable" | "high_volatile" | "low_stable" | "low_volatile" = isHigh
    ? isVolatile
      ? "high_volatile"
      : "high_stable"
    : isVolatile
      ? "low_volatile"
      : "low_stable";

  return {
    snapshots: recent,
    averageRateBps,
    volatilityBps,
    trend,
    regime,
  };
};
