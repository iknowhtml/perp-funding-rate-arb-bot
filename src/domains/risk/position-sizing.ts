/**
 * Risk-based position sizing.
 *
 * Calculates maximum allowed position size based on available capital and risk limits.
 *
 * @see {@link ../../../adrs/0013-risk-management.md ADR-0013: Risk Management Engine}
 */

import type { RiskConfig } from "./config";

/** Basis points per unit (1 = 10000 bps). */
const BPS_PER_UNIT = 10000n;

/**
 * Calculate maximum allowed position size in quote currency.
 *
 * Returns the minimum of:
 * 1. Capital-based limit: available capital * max leverage
 * 2. Config limit: maxPositionSizeUsd converted to quote units
 *
 * Returns 0n if no capital is available.
 *
 * @param equityQuote - Total equity in quote currency smallest units
 * @param marginUsedQuote - Margin currently used in quote currency smallest units
 * @param config - Risk configuration
 * @returns Maximum position size in quote currency smallest units
 */
export const calculateMaxPositionSizeQuote = (
  equityQuote: bigint,
  marginUsedQuote: bigint,
  config: RiskConfig,
): bigint => {
  const availableCapitalQuote = equityQuote - marginUsedQuote;
  if (availableCapitalQuote <= 0n) return 0n;

  const maxLeverageBps = BigInt(config.maxLeverageBps);
  const maxByCapitalQuote = (availableCapitalQuote * maxLeverageBps) / BPS_PER_UNIT;

  const quoteScale = 10n ** BigInt(config.quoteDecimals);
  const maxByLimitQuote = BigInt(config.maxPositionSizeUsd) * quoteScale;

  return maxByCapitalQuote < maxByLimitQuote ? maxByCapitalQuote : maxByLimitQuote;
};
