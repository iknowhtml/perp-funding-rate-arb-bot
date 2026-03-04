/**
 * Enter hedge execution: GMX path — simulate then submit perp short.
 *
 * @see {@link ../../../../../adrs/0001-bot-architecture.md ADR-0001: Bot Architecture}
 * @see {@link ../../../../../adrs/0019-on-chain-perps-pivot.md ADR-0019: On-Chain Perps Pivot}
 */

import { BTC_USD_MARKET, ETH_USD_MARKET } from "@/adapters/gmx";
import type { OpenPositionParams, ProtocolAdapter } from "@/adapters/types";
import { type RiskConfig, type RiskSnapshot, evaluateRisk } from "@/domains/risk";
import type { Logger } from "@/lib/logger";
import type { CircuitBreaker } from "@/lib/rate-limiter";

import { ExecutionError } from "../types";
import type { ExecutionConfig, ExecutionResult } from "../types";

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
  adapter: ProtocolAdapter;
  getRiskSnapshot: () => RiskSnapshot;
  riskConfig: RiskConfig;
  executionConfig: ExecutionConfig;
  circuitBreaker: CircuitBreaker;
  logger: Logger;
}

/**
 * Execute entering a hedged position (GMX: simulate then submit perp short).
 */
export const executeEnterHedge = async (
  params: EnterHedgeExecutionParams,
  deps: EnterHedgeDeps,
): Promise<ExecutionResult> => {
  const { sizeBase, perpSymbol, intentId } = params;
  const { adapter, getRiskSnapshot, riskConfig, executionConfig, circuitBreaker, logger } = deps;

  if (circuitBreaker.isOpen()) {
    logger.warn("Enter hedge aborted: circuit breaker open", { intentId });
    return {
      success: false,
      aborted: true,
      reason: "execution_circuit_breaker_open",
      timestamp: new Date(),
    };
  }

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

  const market =
    executionConfig.gmxMarketAddress ??
    (perpSymbol.includes("BTC") ? BTC_USD_MARKET : ETH_USD_MARKET);
  const openParams: OpenPositionParams = {
    market: market as OpenPositionParams["market"],
    positionSizeUsd: sizeBase,
    acceptablePriceUsd: 0n,
  };

  try {
    const simulation = await adapter.simulateOrder(openParams);
    logger.info("GMX simulateOrder", { intentId, impactBps: simulation.impactBps.toString() });

    const txResult = await circuitBreaker.execute(() => adapter.submitOrder(openParams));

    logger.info("Enter hedge (GMX) execution complete", {
      intentId,
      txHash: txResult.hash,
      success: txResult.success,
    });

    return {
      success: txResult.success,
      aborted: false,
      txResult,
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
