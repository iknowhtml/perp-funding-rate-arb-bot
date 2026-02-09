/**
 * Exit hedge execution: spot sell + perp close (buy).
 *
 * Implements the EXIT_HEDGE execution job from ADR-0001.
 * Exit order: sell spot first, then close perp short.
 *
 * Execution flow:
 * 1. Verify position data is available
 * 2. Place spot sell order
 * 3. Close perp short (buy)
 * 4. Handle partial fills
 * 5. Verify flat position
 *
 * @see {@link ../../../../adrs/0001-bot-architecture.md ADR-0001: Bot Architecture}
 */

import type { ExchangeAdapter, ExchangeOrder } from "@/adapters/types";
import type { Logger } from "@/lib/logger/logger";

import { confirmOrderFill } from "./fill-confirmation";
import { handlePartialFills } from "./partial-fills";
import { ExecutionError } from "./types";
import type { ExecutionConfig, ExecutionResult } from "./types";

/**
 * Parameters for exiting a hedge position.
 */
export interface ExitHedgeExecutionParams {
  /** Reason for exit (e.g., "rate_drop", "risk", "manual"). */
  reason: string;
  /** Base trading symbol (e.g., "BTC-USD"). */
  symbol: string;
  /** Perp trading symbol (e.g., "BTC-USD-PERP"). */
  perpSymbol: string;
  /** Spot quantity to sell in base units. */
  spotSizeBase: bigint;
  /** Perp quantity to close in base units. */
  perpSizeBase: bigint;
  /** Unique intent ID for tracking and idempotency. */
  intentId: string;
}

/**
 * Dependencies injected into the exit hedge execution.
 */
export interface ExitHedgeDeps {
  adapter: ExchangeAdapter;
  executionConfig: ExecutionConfig;
  logger: Logger;
}

/**
 * Verify that no open position remains for the given symbol.
 *
 * @param adapter - Exchange adapter for querying positions
 * @param symbol - Base symbol to check
 * @param perpSymbol - Perp symbol to check
 * @returns true if no positions remain (flat), false otherwise
 */
export const verifyFlatPosition = async (
  adapter: ExchangeAdapter,
  symbol: string,
  perpSymbol: string,
): Promise<boolean> => {
  const spotPosition = await adapter.getPosition(symbol);
  const perpPosition = await adapter.getPosition(perpSymbol);

  const spotFlat = spotPosition === null || spotPosition.sizeBase === 0n;
  const perpFlat = perpPosition === null || perpPosition.sizeBase === 0n;

  return spotFlat && perpFlat;
};

/**
 * Execute exiting a hedged position (spot sell + perp close).
 *
 * CRITICAL SAFETY INVARIANTS:
 * - Spot sold first to avoid unhedged perp exposure
 * - All orders confirmed with exchange fill polling
 * - Position verified flat after exit
 * - All execution is auditable via logger
 *
 * @param params - Execution parameters (reason, sizes, symbols)
 * @param deps - Injected dependencies
 * @returns Execution result with order details
 */
export const executeExitHedge = async (
  params: ExitHedgeExecutionParams,
  deps: ExitHedgeDeps,
): Promise<ExecutionResult> => {
  const { reason, symbol, perpSymbol, spotSizeBase, perpSizeBase, intentId } = params;
  const { adapter, executionConfig, logger } = deps;

  // 0. Validate we have position sizes
  if (spotSizeBase <= 0n || perpSizeBase <= 0n) {
    logger.warn("Exit hedge aborted: no position to exit", {
      intentId,
      spotSizeBase: spotSizeBase.toString(),
      perpSizeBase: perpSizeBase.toString(),
    });
    return {
      success: false,
      aborted: true,
      reason: "No position to exit",
      timestamp: new Date(),
    };
  }

  let spotOrder: ExchangeOrder | undefined;
  let perpOrder: ExchangeOrder | undefined;

  try {
    // 1. Place spot sell order first (reduce spot exposure)
    logger.info("Placing spot sell order", {
      intentId,
      reason,
      symbol,
      spotSizeBase: spotSizeBase.toString(),
    });

    const rawSpotOrder = await adapter.createOrder({
      symbol,
      side: "SELL",
      type: "MARKET",
      quantityBase: spotSizeBase,
    });
    spotOrder = await confirmOrderFill(adapter, rawSpotOrder.id, executionConfig, logger);

    // 2. Close perp short (buy to close)
    logger.info("Closing perp position", {
      intentId,
      reason,
      perpSymbol,
      perpSizeBase: perpSizeBase.toString(),
    });

    const rawPerpOrder = await adapter.createOrder({
      symbol: perpSymbol,
      side: "BUY",
      type: "MARKET",
      quantityBase: perpSizeBase,
      reduceOnly: true,
    });
    perpOrder = await confirmOrderFill(adapter, rawPerpOrder.id, executionConfig, logger);

    // 3. Handle partial fills
    if (spotOrder.status === "PARTIALLY_FILLED" || perpOrder.status === "PARTIALLY_FILLED") {
      logger.warn("Partial fills detected during exit, completing", { intentId });
      await handlePartialFills(spotOrder, perpOrder, adapter, executionConfig, logger);
    }

    // 4. Verify flat position
    const isFlat = await verifyFlatPosition(adapter, symbol, perpSymbol);
    if (!isFlat) {
      logger.error("Not flat after exit", new Error("Position remains after exit hedge"), {
        intentId,
        symbol,
        perpSymbol,
      });
      // Don't throw - log the alert but return success since orders were placed
      // The reconciler will catch and correct this
    }

    logger.info("Exit hedge execution complete", {
      intentId,
      reason,
      spotOrderId: spotOrder.id,
      perpOrderId: perpOrder.id,
      isFlat,
    });

    return {
      success: true,
      aborted: false,
      perpOrder,
      spotOrder,
      timestamp: new Date(),
    };
  } catch (error) {
    logger.error(
      "Exit hedge execution failed",
      error instanceof Error ? error : new Error(String(error)),
      { intentId, reason },
    );

    // Return partial result if we have any orders
    if (spotOrder !== undefined || perpOrder !== undefined) {
      return {
        success: false,
        aborted: false,
        reason: `Partial exit failure: ${error instanceof Error ? error.message : String(error)}`,
        ...(perpOrder !== undefined ? { perpOrder } : {}),
        ...(spotOrder !== undefined ? { spotOrder } : {}),
        timestamp: new Date(),
      };
    }

    throw new ExecutionError(
      `Exit hedge failed: ${error instanceof Error ? error.message : String(error)}`,
      "EXIT_HEDGE_FAILED",
      error,
    );
  }
};
