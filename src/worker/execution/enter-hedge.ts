/**
 * Enter hedge execution: perp short + spot buy.
 *
 * Implements the ENTER_HEDGE execution job from ADR-0001.
 * Follows the two-phase risk check pattern: risk is re-evaluated
 * right before placing orders, not just at strategy evaluation time.
 *
 * Execution flow:
 * 1. Check circuit breaker state
 * 2. Re-check risk (two-phase check)
 * 3. Validate slippage from order book
 * 4. Place perp short order (through circuit breaker)
 * 5. Place spot buy order (through circuit breaker)
 * 6. Handle partial fills
 * 7. Check and correct hedge drift
 *
 * @see {@link ../../../../adrs/0001-bot-architecture.md ADR-0001: Bot Architecture}
 */

import type { ExchangeAdapter } from "@/adapters/types";
import type { RiskConfig } from "@/domains/risk/config";
import { evaluateRisk } from "@/domains/risk/evaluate";
import type { RiskSnapshot } from "@/domains/risk/types";
import type { Logger } from "@/lib/logger/logger";
import type { CircuitBreaker } from "@/lib/rate-limiter/circuit-breaker";

import { calculateHedgeDrift, correctDrift } from "./drift";
import { confirmOrderFill } from "./fill-confirmation";
import { handlePartialFills } from "./partial-fills";
import { validateExecution } from "./slippage";
import { ExecutionError } from "./types";
import type { ExecutionConfig, ExecutionResult } from "./types";

/**
 * Parameters for entering a hedge position.
 */
export interface EnterHedgeExecutionParams {
  /** Order size in base units. */
  sizeBase: bigint;
  /** Base trading symbol (e.g., "BTC-USD"). */
  symbol: string;
  /** Perp trading symbol (e.g., "BTC-USD-PERP"). */
  perpSymbol: string;
  /** Unique intent ID for tracking and idempotency. */
  intentId: string;
}

/**
 * Dependencies injected into the enter hedge execution.
 */
export interface EnterHedgeDeps {
  adapter: ExchangeAdapter;
  /** Callback to get a fresh risk snapshot right before execution. */
  getRiskSnapshot: () => RiskSnapshot;
  riskConfig: RiskConfig;
  executionConfig: ExecutionConfig;
  circuitBreaker: CircuitBreaker;
  logger: Logger;
}

/**
 * Execute entering a hedged position (perp short + spot buy).
 *
 * CRITICAL SAFETY INVARIANTS:
 * - Risk is checked twice: once at strategy time, once here before orders
 * - Slippage is validated before any orders are placed
 * - All orders are confirmed with exchange fill polling
 * - Hedge drift is detected and corrected
 * - All execution is auditable via logger
 *
 * @param params - Execution parameters (size, symbol, intentId)
 * @param deps - Injected dependencies
 * @returns Execution result with order details and drift analysis
 */
export const executeEnterHedge = async (
  params: EnterHedgeExecutionParams,
  deps: EnterHedgeDeps,
): Promise<ExecutionResult> => {
  const { sizeBase, symbol, perpSymbol, intentId } = params;
  const { adapter, getRiskSnapshot, riskConfig, executionConfig, circuitBreaker, logger } = deps;

  // 0. Check circuit breaker
  if (circuitBreaker.isOpen()) {
    logger.warn("Enter hedge aborted: circuit breaker open", { intentId });
    return {
      success: false,
      aborted: true,
      reason: "execution_circuit_breaker_open",
      timestamp: new Date(),
    };
  }

  // 1. Re-check risk (two-phase check per ADR-0001)
  const riskSnapshot = getRiskSnapshot();
  const risk = evaluateRisk(riskSnapshot, riskConfig);

  if (risk.level === "DANGER" || risk.level === "BLOCKED") {
    logger.warn("Enter hedge aborted: risk check failed", {
      intentId,
      level: risk.level,
      action: risk.action,
      reasons: risk.reasons,
    });
    return {
      success: false,
      aborted: true,
      reason: `Risk check failed: ${risk.reasons.join(", ")}`,
      timestamp: new Date(),
    };
  }

  if (risk.action === "BLOCK" || risk.action === "EXIT") {
    logger.warn("Enter hedge aborted: risk action prevents entry", {
      intentId,
      action: risk.action,
    });
    return {
      success: false,
      aborted: true,
      reason: `Risk action ${risk.action} prevents entry`,
      timestamp: new Date(),
    };
  }

  // 2. Validate slippage
  const validation = await validateExecution(adapter, symbol, "BUY", sizeBase, executionConfig);
  if (!validation.valid) {
    const slippageReason = validation.reason ?? "Slippage validation failed";
    logger.warn("Enter hedge aborted: slippage validation failed", {
      intentId,
      reason: slippageReason,
      estimatedSlippageBps: validation.slippageEstimate.estimatedSlippageBps.toString(),
    });
    return {
      success: false,
      aborted: true,
      reason: slippageReason,
      slippageEstimate: validation.slippageEstimate,
      timestamp: new Date(),
    };
  }

  try {
    // 3. Place perp short order (through circuit breaker)
    logger.info("Placing perp short order", {
      intentId,
      symbol: perpSymbol,
      sizeBase: sizeBase.toString(),
    });

    const perpOrder = await circuitBreaker.execute(async () => {
      const order = await adapter.createOrder({
        symbol: perpSymbol,
        side: "SELL",
        type: "MARKET",
        quantityBase: sizeBase,
      });
      return confirmOrderFill(adapter, order.id, executionConfig, logger);
    });

    // 4. Place spot buy order (through circuit breaker)
    logger.info("Placing spot buy order", {
      intentId,
      symbol,
      sizeBase: sizeBase.toString(),
    });

    const spotOrder = await circuitBreaker.execute(async () => {
      const order = await adapter.createOrder({
        symbol,
        side: "BUY",
        type: "MARKET",
        quantityBase: sizeBase,
      });
      return confirmOrderFill(adapter, order.id, executionConfig, logger);
    });

    // 5. Handle partial fills
    if (perpOrder.status === "PARTIALLY_FILLED" || spotOrder.status === "PARTIALLY_FILLED") {
      logger.warn("Partial fills detected, completing", { intentId });
      await handlePartialFills(perpOrder, spotOrder, adapter, executionConfig, logger);
    }

    // 6. Check and correct hedge drift
    const drift = calculateHedgeDrift(perpOrder, spotOrder, executionConfig.maxDriftBps);
    if (drift.needsCorrection) {
      logger.warn("Hedge drift detected, correcting", {
        intentId,
        driftBps: drift.driftBps.toString(),
      });
      const driftMidPriceQuote = validation.slippageEstimate.midPriceQuote;
      await correctDrift(
        drift,
        adapter,
        symbol,
        perpSymbol,
        driftMidPriceQuote,
        executionConfig,
        logger,
      );
    }

    logger.info("Enter hedge execution complete", {
      intentId,
      perpOrderId: perpOrder.id,
      spotOrderId: spotOrder.id,
      driftBps: drift.driftBps.toString(),
    });

    return {
      success: true,
      aborted: false,
      perpOrder,
      spotOrder,
      drift,
      slippageEstimate: validation.slippageEstimate,
      timestamp: new Date(),
    };
  } catch (error) {
    logger.error(
      "Enter hedge execution failed",
      error instanceof Error ? error : new Error(String(error)),
      { intentId },
    );

    throw new ExecutionError(
      `Enter hedge failed: ${error instanceof Error ? error.message : String(error)}`,
      "ENTER_HEDGE_FAILED",
      error,
    );
  }
};
