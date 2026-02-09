/**
 * Hedge drift detection and correction.
 *
 * After entering a hedged position (perp short + spot buy), the notional
 * values may differ due to fill prices. Drift is the bps difference
 * between perp and spot notional. If drift exceeds the threshold,
 * a corrective order is placed.
 *
 * @see {@link ../../../../adrs/0001-bot-architecture.md ADR-0001: Bot Architecture}
 */

import type { ExchangeAdapter, ExchangeOrder } from "@/adapters/types";
import type { Logger } from "@/lib/logger/logger";

import { confirmOrderFill } from "./fill-confirmation";
import { BPS_PER_UNIT, ExecutionError } from "./types";
import type { ExecutionConfig, HedgeDrift } from "./types";

/**
 * Calculate notional value from a filled order.
 *
 * Notional = filledQuantityBase * avgFillPriceQuote.
 * Returns 0n if no fill price is available.
 */
export const calculateOrderNotionalQuote = (order: ExchangeOrder): bigint => {
  if (order.avgFillPriceQuote === null || order.filledQuantityBase === 0n) {
    return 0n;
  }
  return order.filledQuantityBase * order.avgFillPriceQuote;
};

/**
 * Calculate hedge drift between perp and spot orders.
 *
 * Drift is measured as the absolute basis point difference between
 * perp and spot notional values, relative to the larger notional.
 *
 * @param perpOrder - The perp (short) order
 * @param spotOrder - The spot (buy) order
 * @param maxDriftBps - Maximum acceptable drift in basis points
 * @returns HedgeDrift with drift amount and correction flag
 */
export const calculateHedgeDrift = (
  perpOrder: ExchangeOrder,
  spotOrder: ExchangeOrder,
  maxDriftBps: bigint,
): HedgeDrift => {
  const perpNotionalQuote = calculateOrderNotionalQuote(perpOrder);
  const spotNotionalQuote = calculateOrderNotionalQuote(spotOrder);

  // Handle edge case: both notionals are zero
  if (perpNotionalQuote === 0n && spotNotionalQuote === 0n) {
    return {
      perpNotionalQuote,
      spotNotionalQuote,
      driftBps: 0n,
      needsCorrection: false,
    };
  }

  // Calculate absolute difference
  const diffQuote =
    perpNotionalQuote > spotNotionalQuote
      ? perpNotionalQuote - spotNotionalQuote
      : spotNotionalQuote - perpNotionalQuote;

  // Use the larger notional as the denominator
  const denominator = perpNotionalQuote > spotNotionalQuote ? perpNotionalQuote : spotNotionalQuote;

  // Avoid division by zero
  const driftBps = denominator > 0n ? (diffQuote * BPS_PER_UNIT) / denominator : 0n;

  return {
    perpNotionalQuote,
    spotNotionalQuote,
    driftBps,
    needsCorrection: driftBps > maxDriftBps,
  };
};

/**
 * Correct hedge drift by placing a small corrective order.
 *
 * If perp notional > spot notional: need more spot (buy spot)
 * If spot notional > perp notional: need more perp (sell perp)
 *
 * Requires a reference price to convert the quote-denominated notional
 * difference into base-denominated order quantity.
 *
 * @param drift - The calculated hedge drift
 * @param adapter - Exchange adapter for placing orders
 * @param symbol - Base trading symbol (e.g., "BTC-USD")
 * @param perpSymbol - Perp trading symbol (e.g., "BTC-USD-PERP")
 * @param midPriceQuote - Current mid price for quote-to-base conversion
 * @param config - Execution config
 * @param logger - Logger for audit trail
 * @throws {ExecutionError} If corrective order fails
 */
export const correctDrift = async (
  drift: HedgeDrift,
  adapter: ExchangeAdapter,
  symbol: string,
  perpSymbol: string,
  midPriceQuote: bigint,
  config: ExecutionConfig,
  logger: Logger,
): Promise<void> => {
  if (!drift.needsCorrection) {
    return;
  }

  if (midPriceQuote <= 0n) {
    throw new ExecutionError(
      "Cannot correct drift: invalid mid price for quote-to-base conversion",
      "DRIFT_CORRECTION_INVALID_PRICE",
    );
  }

  const diffQuote =
    drift.perpNotionalQuote > drift.spotNotionalQuote
      ? drift.perpNotionalQuote - drift.spotNotionalQuote
      : drift.spotNotionalQuote - drift.perpNotionalQuote;

  // Convert quote-denominated difference to base units using mid price
  const correctionBase = diffQuote / midPriceQuote;

  if (correctionBase <= 0n) {
    logger.info("Drift correction amount rounds to zero, skipping", {
      diffQuote: diffQuote.toString(),
      midPriceQuote: midPriceQuote.toString(),
    });
    return;
  }

  logger.warn("Correcting hedge drift", {
    driftBps: drift.driftBps.toString(),
    perpNotionalQuote: drift.perpNotionalQuote.toString(),
    spotNotionalQuote: drift.spotNotionalQuote.toString(),
    diffQuote: diffQuote.toString(),
    correctionBase: correctionBase.toString(),
    midPriceQuote: midPriceQuote.toString(),
  });

  try {
    if (drift.perpNotionalQuote > drift.spotNotionalQuote) {
      // Need more spot to match perp
      const correctionOrder = await adapter.createOrder({
        symbol,
        side: "BUY",
        type: "MARKET",
        quantityBase: correctionBase,
      });
      await confirmOrderFill(adapter, correctionOrder.id, config, logger);
    } else {
      // Need more perp to match spot
      const correctionOrder = await adapter.createOrder({
        symbol: perpSymbol,
        side: "SELL",
        type: "MARKET",
        quantityBase: correctionBase,
      });
      await confirmOrderFill(adapter, correctionOrder.id, config, logger);
    }

    logger.info("Drift correction complete", {
      driftBps: drift.driftBps.toString(),
      correctionBase: correctionBase.toString(),
    });
  } catch (error) {
    throw new ExecutionError(
      `Failed to correct hedge drift: ${error instanceof Error ? error.message : String(error)}`,
      "DRIFT_CORRECTION_FAILED",
      error,
    );
  }
};
