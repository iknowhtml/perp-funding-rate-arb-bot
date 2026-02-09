/**
 * Order fill confirmation polling.
 *
 * CRITICAL: Never assume an order is filled without exchange confirmation.
 * Polls the exchange adapter until the order reaches a terminal state
 * or the timeout is reached.
 *
 * @see {@link ../../../../adrs/0001-bot-architecture.md ADR-0001: Bot Architecture}
 */

import type { ExchangeAdapter, ExchangeOrder, ExchangeOrderStatus } from "@/adapters/types";
import type { Logger } from "@/lib/logger/logger";

import { OrderFillTimeoutError } from "./types";
import type { ExecutionConfig } from "./types";

/** Order statuses that indicate the order is no longer being processed. */
const TERMINAL_STATUSES: ReadonlySet<ExchangeOrderStatus> = new Set([
  "FILLED",
  "PARTIALLY_FILLED",
  "CANCELLED",
  "REJECTED",
  "EXPIRED",
]);

/**
 * Check if an order status is terminal (no further state transitions expected).
 *
 * Note: PARTIALLY_FILLED is treated as terminal for market orders because
 * exchanges return this when partial fill is the final state. The caller
 * handles partial fill completion separately.
 */
export const isTerminalOrderStatus = (status: ExchangeOrderStatus): boolean =>
  TERMINAL_STATUSES.has(status);

/**
 * Sleep utility for polling intervals.
 */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Poll the exchange for order fill confirmation until a terminal state or timeout.
 *
 * @param adapter - Exchange adapter for querying orders
 * @param orderId - The exchange order ID to poll
 * @param config - Execution config with timeout and poll settings
 * @param logger - Logger for polling status
 * @returns The order in a terminal state
 * @throws {OrderFillTimeoutError} If the order doesn't reach terminal state within timeout
 */
export const confirmOrderFill = async (
  adapter: ExchangeAdapter,
  orderId: string,
  config: ExecutionConfig,
  logger: Logger,
): Promise<ExchangeOrder> => {
  const startMs = Date.now();
  let attempt = 0;

  while (attempt < config.fillPollMaxAttempts) {
    const elapsedMs = Date.now() - startMs;

    if (elapsedMs >= config.orderFillTimeoutMs) {
      throw new OrderFillTimeoutError(orderId, config.orderFillTimeoutMs);
    }

    const order = await adapter.getOrder(orderId);

    if (order === null) {
      logger.warn("Order not found during fill confirmation", { orderId, attempt });
      // Order might not be visible yet; keep polling
      await sleep(config.fillPollIntervalMs);
      attempt++;
      continue;
    }

    if (isTerminalOrderStatus(order.status)) {
      logger.info("Order reached terminal state", {
        orderId,
        status: order.status,
        filledQuantityBase: order.filledQuantityBase.toString(),
        attempt,
        elapsedMs: Date.now() - startMs,
      });
      return order;
    }

    logger.debug("Order still pending", {
      orderId,
      status: order.status,
      attempt,
    });

    await sleep(config.fillPollIntervalMs);
    attempt++;
  }

  throw new OrderFillTimeoutError(orderId, config.orderFillTimeoutMs);
};
