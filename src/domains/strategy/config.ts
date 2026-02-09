/**
 * Strategy configuration schema and defaults.
 *
 * Thresholds are in display units (numbers) and converted to bigint at usage sites.
 * Rates are in basis points (e.g., 10 = 0.10%).
 *
 * @see {@link ../../../adrs/0014-funding-rate-strategy.md ADR-0014: Funding Rate Prediction & Strategy}
 */

import * as v from "valibot";

export const StrategyConfigSchema = v.object({
  // Entry thresholds
  minFundingRateBps: v.pipe(v.number(), v.minValue(1), v.maxValue(1000)),
  minPredictedRateBps: v.pipe(v.number(), v.minValue(1), v.maxValue(1000)),

  // Exit thresholds
  exitFundingRateBps: v.pipe(v.number(), v.minValue(0), v.maxValue(100)),
  targetYieldBps: v.pipe(v.number(), v.minValue(10), v.maxValue(1000)),

  // Trend analysis
  trendWindow: v.pipe(v.number(), v.minValue(6), v.maxValue(48)),
  trendThresholdBps: v.pipe(v.number(), v.minValue(1), v.maxValue(20)),

  // Volatility thresholds
  volatilityThresholdBps: v.pipe(v.number(), v.minValue(1), v.maxValue(50)),
});

export type StrategyConfig = v.InferOutput<typeof StrategyConfigSchema>;

export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
  minFundingRateBps: 10, // 0.10%
  minPredictedRateBps: 5, // 0.05%
  exitFundingRateBps: 3, // 0.03%
  targetYieldBps: 50, // 0.50%
  trendWindow: 24,
  trendThresholdBps: 5, // 0.05%
  volatilityThresholdBps: 5, // 0.05%
};
