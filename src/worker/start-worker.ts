/**
 * Worker orchestrator — creates and starts the data plane with
 * the appropriate exchange adapter.
 *
 * @see {@link ../../adrs/0001-bot-architecture.md ADR-0001: Bot Architecture}
 */

import { createExchangeAdapter } from "@/adapters/factory";
import type { DatabaseInstance } from "@/lib/db/client";
import type { Env } from "@/lib/env";
import type { Logger } from "@/lib/logger";

import { createDataPlane } from "./data-plane";
import { DEFAULT_RECONCILER_CONFIG, runReconcile } from "./reconciler";
import { createStateStore } from "./state";

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

/**
 * Start the worker: create adapter, state store, data plane, and begin
 * polling / streaming.
 */
export const startWorker = async (config: StartWorkerConfig): Promise<WorkerHandle> => {
  const { env, logger } = config;

  // Determine adapter config from environment
  const adapterConfig =
    env.COINBASE_API_KEY && env.COINBASE_API_SECRET
      ? {
          exchange: "coinbase" as const,
          apiKey: env.COINBASE_API_KEY,
          apiSecret: env.COINBASE_API_SECRET,
        }
      : { exchange: "paper" as const };

  const adapter = createExchangeAdapter(adapterConfig);
  const stateStore = createStateStore();

  const dataPlane = createDataPlane({
    adapter,
    stateStore,
    logger,
    symbols: DEFAULT_SYMBOLS,
  });

  await dataPlane.start();

  // Start reconciler on a periodic interval
  const reconcilerConfig = {
    ...DEFAULT_RECONCILER_CONFIG,
    perpSymbol: DEFAULT_PERP_SYMBOL,
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

  return {
    shutdown: async (): Promise<void> => {
      clearInterval(reconcileInterval);
      await dataPlane.stop();
      logger.info("Worker shut down");
    },
  };
};
