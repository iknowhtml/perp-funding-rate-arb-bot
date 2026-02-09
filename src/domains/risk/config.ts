/**
 * Risk configuration schema and defaults.
 *
 * Amount limits are in USD display units (whole dollars).
 * Use `quoteDecimals` to convert to quote currency smallest units:
 *   BigInt(usdAmount) * 10n ** BigInt(quoteDecimals)
 *
 * @see {@link ../../../adrs/0013-risk-management.md ADR-0013: Risk Management Engine}
 */

import * as v from "valibot";

export const RiskConfigSchema = v.object({
  /** Number of decimal places in quote currency (e.g., 6 for USDC). */
  quoteDecimals: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(18)),

  // Hard limits (amounts in USD display units)
  maxPositionSizeUsd: v.pipe(v.number(), v.minValue(100), v.maxValue(1_000_000)),
  maxLeverageBps: v.pipe(v.number(), v.minValue(10000), v.maxValue(100000)), // 1x to 10x
  maxDailyLossUsd: v.pipe(v.number(), v.minValue(0)),
  maxDrawdownBps: v.pipe(v.number(), v.minValue(0), v.maxValue(5000)), // 0% to 50%
  minLiquidationBufferBps: v.pipe(v.number(), v.minValue(1000), v.maxValue(5000)), // 10% to 50%
  maxMarginUtilizationBps: v.pipe(v.number(), v.minValue(5000), v.maxValue(9500)), // 50% to 95%

  // Soft limits (warnings)
  warningPositionSizeUsd: v.pipe(v.number(), v.minValue(100)),
  warningMarginUtilizationBps: v.pipe(v.number(), v.minValue(5000), v.maxValue(9000)),
  warningLiquidationBufferBps: v.pipe(v.number(), v.minValue(2000), v.maxValue(4000)),
});

export type RiskConfig = v.InferOutput<typeof RiskConfigSchema>;

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  quoteDecimals: 6, // USDC (6 decimals)
  maxPositionSizeUsd: 10000, // $10,000
  maxLeverageBps: 30000, // 3x
  maxDailyLossUsd: 500, // $500
  maxDrawdownBps: 1000, // 10%
  minLiquidationBufferBps: 2000, // 20%
  maxMarginUtilizationBps: 8000, // 80%
  warningPositionSizeUsd: 7500, // $7,500
  warningMarginUtilizationBps: 7000, // 70%
  warningLiquidationBufferBps: 3000, // 30%
};
