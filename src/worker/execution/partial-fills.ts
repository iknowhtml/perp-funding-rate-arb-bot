/**
 * Partial fill detection and completion logic.
 *
 * When a market order is partially filled, place additional market orders
 * for the remaining quantity to ensure the hedge is complete.
 *
 * @see {@link ../../../../adrs/0001-bot-architecture.md ADR-0001: Bot Architecture}
 */

import type { ExchangeAdapter, ExchangeOrder } from "@/adapters/types";
import type { Logger } from "@/lib/logger/logger";

import { confirmOrderFill } from "./fill-confirmation";
import { ExecutionError } from "./types";
import type { ExecutionConfig } from "./types";

/**
 * Check if an order needs partial fill completion.
 */
export const isPartiallyFilled = (order: ExchangeOrder): boolean =>
  order.status === "PARTIALLY_FILLED" && order.filledQuantityBase < order.quantityBase;

/**
 * Calculate the remaining unfilled quantity for a partially filled order.
 */
export const calculateRemainingBase = (order: ExchangeOrder): bigint =>
  order.quantityBase - order.filledQuantityBase;

/**
 * Complete a partially filled order by placing additional market orders
 * for the remaining quantity.
 *
 * @param order - The partially filled order to complete
 * @param adapter - Exchange adapter for placing orders
 * @param config - Execution config with retry settings
 * @param logger - Logger for status updates
 * @returns The final fill order, or null if original was not partially filled
 * @throws {ExecutionError} If all retries are exhausted
 */
export const completePartialFill = async (
  order: ExchangeOrder,
  adapter: ExchangeAdapter,
  config: ExecutionConfig,
  logger: Logger,
): Promise<ExchangeOrder | null> => {
  if (!isPartiallyFilled(order)) {
    return null;
  }

  const remainingBase = calculateRemainingBase(order);
  let lastError: unknown;

  for (let attempt = 0; attempt < config.maxPartialFillRetries; attempt++) {
    try {
      logger.warn("Completing partial fill", {
        orderId: order.id,
        symbol: order.symbol,
        side: order.side,
        originalQuantityBase: order.quantityBase.toString(),
        filledQuantityBase: order.filledQuantityBase.toString(),
        remainingBase: remainingBase.toString(),
        attempt,
      });

      const completionOrder = await adapter.createOrder({
        symbol: order.symbol,
        side: order.side,
        type: "MARKET",
        quantityBase: remainingBase,
      });

      const confirmedOrder = await confirmOrderFill(adapter, completionOrder.id, config, logger);

      if (confirmedOrder.status === "FILLED") {
        logger.info("Partial fill completed", {
          originalOrderId: order.id,
          completionOrderId: confirmedOrder.id,
        });
        return confirmedOrder;
      }

      // If completion order was also partially filled, log and retry
      if (confirmedOrder.status === "PARTIALLY_FILLED") {
        logger.warn("Completion order also partially filled", {
          completionOrderId: confirmedOrder.id,
          attempt,
        });
        lastError = new ExecutionError(
          "Completion order partially filled",
          "PARTIAL_FILL_COMPLETION_FAILED",
        );
        continue;
      }

      // Unexpected terminal state (cancelled, rejected, expired)
      throw new ExecutionError(
        `Completion order reached unexpected state: ${confirmedOrder.status}`,
        "UNEXPECTED_ORDER_STATE",
      );
    } catch (error) {
      lastError = error;
      logger.error(
        "Partial fill completion attempt failed",
        error instanceof Error ? error : new Error(String(error)),
        { orderId: order.id, attempt },
      );
    }
  }

  throw new ExecutionError(
    `Failed to complete partial fill after ${config.maxPartialFillRetries} attempts`,
    "PARTIAL_FILL_EXHAUSTED",
    lastError,
  );
};

/**
 * Handle partial fills for both perp and spot orders.
 *
 * @param perpOrder - The perp order to check and complete
 * @param spotOrder - The spot order to check and complete
 * @param adapter - Exchange adapter for placing orders
 * @param config - Execution config
 * @param logger - Logger for status updates
 */
export const handlePartialFills = async (
  perpOrder: ExchangeOrder,
  spotOrder: ExchangeOrder,
  adapter: ExchangeAdapter,
  config: ExecutionConfig,
  logger: Logger,
): Promise<void> => {
  const perpPartial = isPartiallyFilled(perpOrder);
  const spotPartial = isPartiallyFilled(spotOrder);

  if (!perpPartial && !spotPartial) {
    return;
  }

  if (perpPartial) {
    await completePartialFill(perpOrder, adapter, config, logger);
  }

  if (spotPartial) {
    await completePartialFill(spotOrder, adapter, config, logger);
  }
};
