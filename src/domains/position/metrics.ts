/**
 * Pure position metric calculation functions.
 *
 * All functions operate on bigint values and return bigint results.
 * Uses unit suffixes: *Quote (quote currency), *Base (base units), *Bps (basis points).
 *
 * @see {@link ../../../adrs/0001-bot-architecture.md ADR-0001: Bot Architecture}
 */

import type { PositionSide } from "@/adapters/types";

/**
 * Basis points per unit (1 = 10000 bps).
 */
const BPS_PER_UNIT = 10000n;

/**
 * Calculate the scale factor for a given decimal precision.
 *
 * @param decimals - Number of decimal places (e.g., 8 for BTC, 18 for ETH)
 * @returns Scale factor as bigint (10^decimals)
 */
export const calculateBaseUnitScale = (decimals: number): bigint => 10n ** BigInt(decimals);

/**
 * Calculate position notional value in quote currency.
 *
 * @param sizeBase - Position size in base units
 * @param markPriceQuote - Current mark price in quote currency (smallest unit)
 * @param baseDecimals - Decimal precision of base asset
 * @returns Notional value in quote currency (smallest unit)
 */
export const calculateNotionalQuote = (
  sizeBase: bigint,
  markPriceQuote: bigint,
  baseDecimals: number,
): bigint => {
  if (sizeBase === 0n) return 0n;
  const scale = calculateBaseUnitScale(baseDecimals);
  return (sizeBase * markPriceQuote) / scale;
};

/**
 * Calculate unrealized profit/loss in quote currency.
 *
 * @param sizeBase - Position size in base units
 * @param entryPriceQuote - Entry price in quote currency (smallest unit)
 * @param markPriceQuote - Current mark price in quote currency (smallest unit)
 * @param side - Position side (LONG or SHORT)
 * @param baseDecimals - Decimal precision of base asset
 * @returns Unrealized P&L in quote currency (positive = profit, negative = loss)
 */
export const calculateUnrealizedPnlQuote = (
  sizeBase: bigint,
  entryPriceQuote: bigint,
  markPriceQuote: bigint,
  side: PositionSide,
  baseDecimals: number,
): bigint => {
  if (sizeBase === 0n) return 0n;
  const scale = calculateBaseUnitScale(baseDecimals);
  const entryValue = (sizeBase * entryPriceQuote) / scale;
  const currentValue = (sizeBase * markPriceQuote) / scale;

  return side === "LONG" ? currentValue - entryValue : entryValue - currentValue;
};

/**
 * Calculate margin utilization as basis points.
 *
 * @param marginUsedQuote - Margin used in quote currency (smallest unit)
 * @param equityQuote - Total equity in quote currency (smallest unit)
 * @returns Margin utilization in basis points (10000 = 100%)
 */
export const calculateMarginUtilizationBps = (
  marginUsedQuote: bigint,
  equityQuote: bigint,
): bigint => {
  if (equityQuote === 0n) return BPS_PER_UNIT; // 100% if no equity
  return (marginUsedQuote * BPS_PER_UNIT) / equityQuote;
};

/**
 * Calculate liquidation distance as basis points.
 *
 * Distance from current price to liquidation price, expressed as percentage.
 *
 * @param markPriceQuote - Current mark price in quote currency (smallest unit)
 * @param liquidationPriceQuote - Liquidation price in quote currency, or null if not applicable
 * @param side - Position side (LONG, SHORT, or null if flat)
 * @returns Liquidation distance in basis points (10000 = 100% buffer, 0 = at liquidation)
 */
export const calculateLiquidationDistanceBps = (
  markPriceQuote: bigint,
  liquidationPriceQuote: bigint | null,
  side: PositionSide | null,
): bigint => {
  if (!liquidationPriceQuote || !side) return BPS_PER_UNIT; // 100% buffer if no liquidation risk

  if (side === "LONG") {
    // For LONG: liquidation price is below mark price
    // Distance = (markPrice - liquidationPrice) / markPrice
    if (markPriceQuote > liquidationPriceQuote) {
      return ((markPriceQuote - liquidationPriceQuote) * BPS_PER_UNIT) / markPriceQuote;
    }
    // Already at or past liquidation
    return 0n;
  }

  // For SHORT: liquidation price is above mark price
  // Distance = (liquidationPrice - markPrice) / markPrice
  if (liquidationPriceQuote > markPriceQuote) {
    return ((liquidationPriceQuote - markPriceQuote) * BPS_PER_UNIT) / markPriceQuote;
  }
  // Already at or past liquidation
  return 0n;
};
