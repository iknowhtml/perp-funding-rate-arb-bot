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
 * @see {@link ../../../../../adrs/0001-bot-architecture.md ADR-0001: Bot Architecture}
 */

import type { Logger } from "@/lib/logger";
import type { ProtocolAdapter } from "@/lib/protocols";

import { ExecutionError } from "../types";
import type { ExecutionConfig, ExecutionResult } from "../types";

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
  adapter: ProtocolAdapter;
  executionConfig: ExecutionConfig;
  logger: Logger;
}

/**
 * Verify that no open position remains for the given market (GMX path).
 *
 * @param adapter - Protocol adapter
 * @param _symbol - Base symbol (unused for GMX)
 * @param _perpSymbol - Perp symbol (unused for GMX)
 * @param market - GMX market address
 */
export const verifyFlatPosition = async (
  adapter: ProtocolAdapter,
  _symbol: string,
  _perpSymbol: string,
  market: string,
): Promise<boolean> => {
  const positionState = await adapter.getPositionState(market);
  const flat =
    positionState === null ||
    positionState.perpPosition === null ||
    positionState.perpPosition.sizeUsd === 0n;
  return flat;
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
  const { reason, spotSizeBase, perpSizeBase, intentId } = params;
  const { executionConfig, logger } = deps;

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

  const market = executionConfig.gmxMarketAddress ?? "";
  if (!market) {
    logger.warn("Exit hedge aborted: gmxMarketAddress not set", { intentId });
    return {
      success: false,
      aborted: true,
      reason: "GMX market address not configured",
      timestamp: new Date(),
    };
  }

  // GMX exit (close perp + withdraw GM) not yet implemented
  logger.warn("Exit hedge not implemented for GMX", { intentId, reason });
  throw new ExecutionError(
    "Exit hedge not yet implemented for GMX (close perp + withdraw GM)",
    "EXIT_HEDGE_NOT_IMPLEMENTED",
  );
};
