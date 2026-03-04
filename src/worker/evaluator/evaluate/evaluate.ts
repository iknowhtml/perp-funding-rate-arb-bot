/**
 * Main evaluation pipeline: health → risk → strategy → execution queue.
 *
 * @see {@link ../../../../adrs/0001-bot-architecture.md ADR-0001: Bot Architecture}
 */

import { calculateBaseUnitScale } from "@/domains/position";
import type { DerivedPosition } from "@/domains/position";
import { type RiskConfig, type RiskSnapshot, evaluateRisk } from "@/domains/risk";
import { type StrategyConfig, type StrategyInput, evaluateStrategy } from "@/domains/strategy";
import type { Logger } from "@/lib/logger";
import type { ProtocolAdapter } from "@/lib/protocols";
import type { CircuitBreaker } from "@/lib/rate-limiter";
import {
  type EnterHedgeDeps,
  type EnterHedgeExecutionParams,
  type ExecutionConfig,
  type ExitHedgeDeps,
  type ExitHedgeExecutionParams,
  executeEnterHedge,
  executeExitHedge,
} from "@/worker/execution";
import type { FreshnessConfig } from "@/worker/freshness";
import { isStateFresh } from "@/worker/freshness";
import type { SerialQueue } from "@/worker/queue";
import type { StateStore } from "@/worker/state";
import type { HealthMonitor } from "@/worker/websocket";
import { evaluateHealthResponse } from "../health";
import type { HealthSnapshot } from "../health";

const generateIntentId = (): string => crypto.randomUUID();

/**
 * Dependencies for the evaluation pipeline.
 * Caller provides getRiskSnapshot, getStrategyInput, getDerivedPosition so
 * equity/dailyPnl/fundingHistory can be built from whatever source the worker has.
 */
export interface EvaluatorDeps {
  stateStore: StateStore;
  executionQueue: SerialQueue;
  adapter: ProtocolAdapter;
  healthMonitor: HealthMonitor;
  freshnessConfig: FreshnessConfig;
  riskConfig: RiskConfig;
  strategyConfig: StrategyConfig;
  executionConfig: ExecutionConfig;
  circuitBreaker: CircuitBreaker;
  logger: Logger;
  symbol: string;
  perpSymbol: string;
  /** Base asset decimals for sizeQuote → sizeBase conversion. */
  baseDecimals: number;
  /** Build risk snapshot from current state (equity, margin, position, dailyPnl, peakEquity). */
  getRiskSnapshot: () => RiskSnapshot;
  /** Build strategy input from current state; null if insufficient data. */
  getStrategyInput: () => StrategyInput | null;
  /** Current derived position; null if flat or not yet derived. */
  getDerivedPosition: () => DerivedPosition | null;
}

/**
 * Build health snapshot from state, health monitor, and derived position.
 */
const buildHealthSnapshot = (deps: EvaluatorDeps): HealthSnapshot => {
  const state = deps.stateStore.getState();
  const restFresh = isStateFresh(state, deps.freshnessConfig);
  const wsFresh = deps.healthMonitor.isHealthy();
  const position = deps.getDerivedPosition();
  return { restFresh, wsFresh, position };
};

/**
 * Run one evaluation tick: health → risk → strategy → queue execution.
 */
export const evaluate = async (deps: EvaluatorDeps): Promise<void> => {
  if (deps.executionQueue.getPendingCount() > 0) {
    deps.logger.debug("Skipping evaluation: execution in progress");
    return;
  }

  const healthSnapshot = buildHealthSnapshot(deps);
  const healthResponse = evaluateHealthResponse(healthSnapshot);

  switch (healthResponse.action) {
    case "EMERGENCY_EXIT":
    case "FORCE_EXIT": {
      const position = deps.getDerivedPosition();
      if (position?.open) {
        const intentId = generateIntentId();
        const params: ExitHedgeExecutionParams = {
          reason: healthResponse.reason ?? "health_degraded",
          symbol: deps.symbol,
          perpSymbol: deps.perpSymbol,
          spotSizeBase: position.spotQuantityBase,
          perpSizeBase: position.perpQuantityBase,
          intentId,
        };
        const exitDeps: ExitHedgeDeps = {
          adapter: deps.adapter,
          executionConfig: deps.executionConfig,
          logger: deps.logger,
        };
        deps.executionQueue.enqueue(() => executeExitHedge(params, exitDeps));
      }
      return;
    }
    case "FULL_PAUSE":
    case "PAUSE_ENTRIES":
      return;
    case "REDUCE_RISK":
    case "CONTINUE":
      break;
  }

  const riskSnapshot = deps.getRiskSnapshot();
  const risk = evaluateRisk(riskSnapshot, deps.riskConfig);

  if (risk.action === "EXIT") {
    const position = deps.getDerivedPosition();
    if (position?.open) {
      const intentId = generateIntentId();
      const params: ExitHedgeExecutionParams = {
        reason: risk.reasons.join(", "),
        symbol: deps.symbol,
        perpSymbol: deps.perpSymbol,
        spotSizeBase: position.spotQuantityBase,
        perpSizeBase: position.perpQuantityBase,
        intentId,
      };
      const exitDeps: ExitHedgeDeps = {
        adapter: deps.adapter,
        executionConfig: deps.executionConfig,
        logger: deps.logger,
      };
      deps.executionQueue.enqueue(() => executeExitHedge(params, exitDeps));
    }
    return;
  }

  if (risk.action === "PAUSE" || risk.action === "BLOCK") {
    return;
  }

  const strategyInput = deps.getStrategyInput();
  if (strategyInput === null) {
    return;
  }

  const intent = evaluateStrategy(strategyInput, risk, deps.riskConfig, deps.strategyConfig);

  if (intent.type === "ENTER_HEDGE") {
    const intentId = generateIntentId();
    const sizeQuote = intent.params.sizeQuote;
    const markPrice = strategyInput.fundingRate.markPriceQuote;
    const scale = calculateBaseUnitScale(deps.baseDecimals);
    const sizeBase = markPrice > 0n ? (sizeQuote * scale) / markPrice : 0n;
    const params: EnterHedgeExecutionParams = {
      sizeBase,
      symbol: deps.symbol,
      perpSymbol: deps.perpSymbol,
      intentId,
    };
    const enterDeps: EnterHedgeDeps = {
      adapter: deps.adapter,
      getRiskSnapshot: deps.getRiskSnapshot,
      riskConfig: deps.riskConfig,
      executionConfig: deps.executionConfig,
      circuitBreaker: deps.circuitBreaker,
      logger: deps.logger,
    };
    deps.executionQueue.enqueue(() => executeEnterHedge(params, enterDeps));
  } else if (intent.type === "EXIT_HEDGE") {
    const position = deps.getDerivedPosition();
    if (position?.open) {
      const intentId = generateIntentId();
      const params: ExitHedgeExecutionParams = {
        reason: intent.reason,
        symbol: deps.symbol,
        perpSymbol: deps.perpSymbol,
        spotSizeBase: position.spotQuantityBase,
        perpSizeBase: position.perpQuantityBase,
        intentId,
      };
      const exitDeps: ExitHedgeDeps = {
        adapter: deps.adapter,
        executionConfig: deps.executionConfig,
        logger: deps.logger,
      };
      deps.executionQueue.enqueue(() => executeExitHedge(params, exitDeps));
    }
  }
};
