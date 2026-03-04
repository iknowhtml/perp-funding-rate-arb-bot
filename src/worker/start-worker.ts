/**
 * Worker orchestrator — creates and starts the data plane, evaluation loop,
 * and reconciler with proper startup sequence.
 *
 * @see {@link ../../adrs/0001-bot-architecture.md ADR-0001: Bot Architecture}
 */

import { derivePosition } from "@/domains/position";
import type { PositionConfig } from "@/domains/position";
import { DEFAULT_RISK_CONFIG, type RiskSnapshot } from "@/domains/risk";
import {
  DEFAULT_STRATEGY_CONFIG,
  type FundingRateSnapshot,
  type StrategyInput,
  type StrategyPosition,
} from "@/domains/strategy";
import { createArbitrumPublicClient, createArbitrumWalletClient } from "@/lib/chain";
import { BTC_USD_MARKET, createGmxAdapter } from "@/lib/chain/protocols/gmx";
import type { DatabaseInstance } from "@/lib/db";
import type { Env } from "@/lib/env";
import type { Logger } from "@/lib/logger";

import { createDataCollector } from "./data-collector";
import { createDataPlane } from "./data-plane";
import { evaluate, runStartupSequence } from "./evaluator";
import { DEFAULT_EXECUTION_CONFIG, createExecutionCircuitBreaker } from "./execution";
import { DEFAULT_FRESHNESS_CONFIG } from "./freshness";
import { createImpactSampler } from "./impact-sampler";
import { createSerialQueue } from "./queue";
import { DEFAULT_RECONCILER_CONFIG, type ReconcilerConfig, runReconcile } from "./reconciler";
import { createStateStore } from "./state";
import { createHealthMonitor } from "./websocket/health-monitor";

/**
 * Configuration for starting the worker.
 */
export interface StartWorkerConfig {
  env: Env;
  db: DatabaseInstance;
  logger: Logger;
}

/**
 * Handle returned by startWorker for lifecycle management.
 */
export interface WorkerHandle {
  shutdown: () => Promise<void>;
}

/**
 * Default trading symbols to subscribe to.
 */
const DEFAULT_SYMBOLS = ["BTC-USD"];
const DEFAULT_PERP_SYMBOL = "BTC-USD";

const EVALUATION_INTERVAL_MS = 2000;
const SLOW_EVALUATION_WARN_MS = 1500;

/**
 * Start the worker: startup sequence, data plane, reconciler, and evaluation loop.
 */
export const startWorker = async (config: StartWorkerConfig): Promise<WorkerHandle> => {
  const { env, db, logger } = config;

  const baseUrl = env.GMX_ORACLE_URL ?? "https://arbitrum-api.gmxinfra.io";
  const publicClient = createArbitrumPublicClient(env.ARBITRUM_RPC_URL);
  const walletClient = env.ARBITRUM_PRIVATE_KEY
    ? createArbitrumWalletClient(env.ARBITRUM_RPC_URL, env.ARBITRUM_PRIVATE_KEY)
    : null;

  const account = walletClient?.account?.address;

  const adapter = createGmxAdapter({
    baseUrl,
    publicClient,
    chainId: env.ARBITRUM_CHAIN_ID,
    account,
  });
  const stateStore = createStateStore();
  const executionQueue = createSerialQueue();
  const circuitBreaker = createExecutionCircuitBreaker(logger);

  const reconcilerConfig: ReconcilerConfig = {
    ...DEFAULT_RECONCILER_CONFIG,
    perpSymbol: DEFAULT_PERP_SYMBOL,
    gmxMarket: BTC_USD_MARKET,
  };
  if (env.GMX_GM_POOL != null) {
    reconcilerConfig.gmxPool = env.GMX_GM_POOL;
  }

  const positionConfig: PositionConfig = {
    perpSymbol: reconcilerConfig.perpSymbol,
    baseAsset: reconcilerConfig.baseAsset,
    quoteAsset: reconcilerConfig.quoteAsset,
    baseDecimals: reconcilerConfig.baseDecimals,
  };

  await runStartupSequence({
    adapter,
    stateStore,
    reconcilerConfig,
    logger,
  });

  const healthMonitor = createHealthMonitor({
    streams: {},
    onUnhealthy: () => {},
  });
  healthMonitor.start();

  const dataPlane = createDataPlane({
    adapter,
    stateStore,
    logger,
    symbols: DEFAULT_SYMBOLS,
    gmxMarket: reconcilerConfig.gmxMarket ?? BTC_USD_MARKET,
    gmxPool: reconcilerConfig.gmxPool ?? "",
  });

  await dataPlane.start();

  const dataCollector = createDataCollector({
    db: db.db,
    gmxOracleUrl: baseUrl,
    publicClient,
  });
  dataCollector.start();

  const impactSampler = createImpactSampler({
    db: db.db,
    publicClient,
    walletClient,
    gmxOracleUrl: baseUrl,
    adapter,
    chainId: env.ARBITRUM_CHAIN_ID ?? 42161,
    maxExecutionFeeWei: 10n ** 18n, // 1 ETH; sampler does not enforce circuit breaker
    intervalMs: env.IMPACT_SAMPLE_INTERVAL_MS ?? 5 * 60 * 1000,
  });
  impactSampler.start();

  const getDerivedPosition = (): ReturnType<typeof derivePosition> | null => {
    const state = stateStore.getState();
    const perpPosition = state.positions.get(reconcilerConfig.perpSymbol) ?? null;
    const spotBalance = state.balances.get(reconcilerConfig.baseAsset) ?? null;
    const markPriceQuote = state.ticker?.lastPriceQuote ?? 0n;
    return derivePosition(perpPosition, spotBalance, markPriceQuote, [], positionConfig);
  };

  const getRiskSnapshot = (): RiskSnapshot => {
    const state = stateStore.getState();
    const derived = getDerivedPosition();
    const quoteBalance = state.balances.get(reconcilerConfig.quoteAsset);
    const equityQuote = quoteBalance?.totalBase ?? 0n;
    const marginUsedQuote = derived?.marginUsedQuote ?? 0n;
    const perpPosition = state.positions.get(reconcilerConfig.perpSymbol) ?? null;
    const position =
      derived?.open && derived.side
        ? {
            side: derived.side,
            notionalQuote: derived.notionalQuote,
            leverageBps: perpPosition?.leverageBps ?? 0n,
            markPriceQuote: derived.markPriceQuote,
            liquidationPriceQuote: derived.liquidationPriceQuote,
          }
        : null;
    return {
      equityQuote,
      marginUsedQuote,
      position,
      dailyPnlQuote: 0n,
      peakEquityQuote: equityQuote,
    };
  };

  const getStrategyInput = (): StrategyInput | null => {
    const state = stateStore.getState();
    const fundingRate = state.fundingRate;
    const ticker = state.ticker;
    if (!fundingRate || !ticker) return null;
    const markPriceQuote = ticker.lastPriceQuote;
    const snapshot: FundingRateSnapshot = {
      symbol: fundingRate.symbol,
      currentRateBps: fundingRate.rateBps,
      predictedRateBps: fundingRate.rateBps,
      nextFundingTime: fundingRate.nextFundingTime,
      lastFundingTime: fundingRate.timestamp,
      markPriceQuote,
      indexPriceQuote: markPriceQuote,
      timestamp: fundingRate.timestamp,
      source: "exchange",
    };
    const derived = getDerivedPosition();
    const position: StrategyPosition | null =
      derived?.open && derived.side && derived.entryTime
        ? {
            open: true,
            entryTime: derived.entryTime,
            entryFundingRateBps: derived.entryFundingRateBps ?? 0n,
            entryTrend: "stable",
            entryRegime: "low_stable",
            sizeQuote: derived.notionalQuote,
            side: derived.side,
          }
        : null;
    const quoteBalance = state.balances.get(reconcilerConfig.quoteAsset);
    const equityQuote = quoteBalance?.totalBase ?? 0n;
    const marginUsedQuote = derived?.marginUsedQuote ?? 0n;
    return {
      fundingRate: snapshot,
      fundingHistory: [],
      position,
      equityQuote,
      marginUsedQuote,
    };
  };

  const evaluatorDeps = {
    stateStore,
    executionQueue,
    adapter,
    healthMonitor,
    freshnessConfig: DEFAULT_FRESHNESS_CONFIG,
    riskConfig: DEFAULT_RISK_CONFIG,
    strategyConfig: DEFAULT_STRATEGY_CONFIG,
    executionConfig: { ...DEFAULT_EXECUTION_CONFIG, gmxMarketAddress: BTC_USD_MARKET },
    circuitBreaker,
    logger,
    symbol: DEFAULT_SYMBOLS[0] ?? "BTC-USD",
    perpSymbol: DEFAULT_PERP_SYMBOL,
    baseDecimals: reconcilerConfig.baseDecimals,
    getRiskSnapshot,
    getStrategyInput,
    getDerivedPosition,
  };

  let evaluateTimeout: NodeJS.Timeout | null = null;
  let running = true;

  const scheduleNextEvaluation = (): void => {
    if (!running) return;
    evaluateTimeout = setTimeout(() => {
      const startMs = performance.now();
      void (async () => {
        try {
          await evaluate(evaluatorDeps);
        } catch (error) {
          logger.error(
            "Evaluation failed",
            error instanceof Error ? error : new Error(String(error)),
          );
        } finally {
          const latencyMs = performance.now() - startMs;
          if (latencyMs > SLOW_EVALUATION_WARN_MS) {
            logger.warn("Evaluation took too long", { latencyMs });
          }
          scheduleNextEvaluation();
        }
      })();
    }, EVALUATION_INTERVAL_MS);
  };

  const reconcile = (): Promise<void> =>
    runReconcile(adapter, stateStore, reconcilerConfig, logger).then(
      () => undefined,
      (err) =>
        logger.error("Reconciliation failed", err instanceof Error ? err : new Error(String(err))),
    );

  const reconcileInterval = setInterval(() => {
    void reconcile();
  }, reconcilerConfig.intervalMs);

  scheduleNextEvaluation();
  logger.info("Worker started");

  return {
    shutdown: async (): Promise<void> => {
      running = false;
      if (evaluateTimeout !== null) {
        clearTimeout(evaluateTimeout);
        evaluateTimeout = null;
      }
      healthMonitor.stop();
      clearInterval(reconcileInterval);
      dataCollector.stop();
      impactSampler.stop();
      await dataPlane.stop();
      logger.info("Worker shut down");
    },
  };
};
