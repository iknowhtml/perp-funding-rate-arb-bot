/**
 * Position derivation from exchange data.
 *
 * Derives enriched position state from raw exchange positions, balances, and pending fills.
 *
 * @see {@link ../../../adrs/0001-bot-architecture.md ADR-0001: Bot Architecture}
 */

import type { Balance, Fill, Position, PositionSide } from "@/adapters/types";

import {
  calculateLiquidationDistanceBps,
  calculateNotionalQuote,
  calculateUnrealizedPnlQuote,
} from "./metrics";
import type { DerivedPosition, PositionConfig } from "./types";

/**
 * Apply pending fills to adjust position size.
 *
 * Adjusts the current position size by applying unprocessed fills.
 * BUY fills increase position size, SELL fills decrease it.
 *
 * @param currentSizeBase - Current position size in base units
 * @param fills - Array of pending fills to apply
 * @param perpSymbol - Perpetual symbol to filter fills
 * @returns Adjusted position size in base units
 */
const applyPendingFills = (currentSizeBase: bigint, fills: Fill[], perpSymbol: string): bigint => {
  let adjustedSize = currentSizeBase;
  for (const fill of fills) {
    if (fill.symbol !== perpSymbol) continue;
    adjustedSize =
      fill.side === "BUY" ? adjustedSize + fill.quantityBase : adjustedSize - fill.quantityBase;
  }
  return adjustedSize;
};

/**
 * Derive enriched position state from exchange data.
 *
 * Combines exchange position, spot balance, mark price, and pending fills
 * to compute a complete position view with all metrics.
 *
 * @param perpPosition - Exchange perpetual position, or null if flat
 * @param spotBalance - Spot balance for base asset, or null if not found
 * @param markPriceQuote - Current mark price in quote currency (smallest unit)
 * @param pendingFills - Array of fills not yet reflected in exchange position
 * @param config - Position configuration (symbols, decimals)
 * @returns Derived position with computed metrics
 */
export const derivePosition = (
  perpPosition: Position | null,
  spotBalance: Balance | null,
  markPriceQuote: bigint,
  pendingFills: Fill[],
  config: PositionConfig,
): DerivedPosition => {
  // Extract base position data
  const basePerpSize = perpPosition?.sizeBase ?? 0n;
  const adjustedPerpSize = applyPendingFills(basePerpSize, pendingFills, config.perpSymbol);
  const spotQuantity = spotBalance?.totalBase ?? 0n;

  // Determine if position is open and side
  const open = adjustedPerpSize !== 0n;
  const side: PositionSide | null = open ? (perpPosition?.side ?? null) : null;

  // Calculate notional value
  const notionalQuote = calculateNotionalQuote(
    adjustedPerpSize,
    markPriceQuote,
    config.baseDecimals,
  );

  // Calculate unrealized P&L (use exchange position entry price if available)
  const entryPriceQuote = perpPosition?.entryPriceQuote ?? null;
  const unrealizedPnlQuote =
    open && entryPriceQuote && side
      ? calculateUnrealizedPnlQuote(
          adjustedPerpSize,
          entryPriceQuote,
          markPriceQuote,
          side,
          config.baseDecimals,
        )
      : 0n;

  // Margin and risk metrics
  const marginUsedQuote = perpPosition?.marginQuote ?? 0n;
  const liquidationPriceQuote = perpPosition?.liquidationPriceQuote ?? null;
  const liquidationDistanceBps = calculateLiquidationDistanceBps(
    markPriceQuote,
    liquidationPriceQuote,
    side,
  );

  // Margin buffer calculation (would need equity, but for now use margin utilization)
  // In a full implementation, this would be: (equity - marginUsed) / equity
  // For MVP, we'll use a placeholder that indicates margin utilization
  const marginBufferBps = 0n; // TODO: Calculate from equity when available

  // Funding accrued (placeholder - would need funding rate history)
  const fundingAccruedQuote = 0n; // TODO: Calculate from funding rate history

  // Entry tracking (placeholder - would need position history)
  const entryTime: Date | null = null; // TODO: Track from position entry
  const entryFundingRateBps: bigint | null = null; // TODO: Track from entry

  return {
    open,
    side,
    spotQuantityBase: spotQuantity,
    perpQuantityBase: adjustedPerpSize,
    notionalQuote,
    entryTime,
    entryPriceQuote,
    entryFundingRateBps,
    markPriceQuote,
    unrealizedPnlQuote,
    fundingAccruedQuote,
    marginUsedQuote,
    marginBufferBps,
    liquidationPriceQuote,
    liquidationDistanceBps,
    lastUpdated: new Date(),
    source: "derived",
  };
};
