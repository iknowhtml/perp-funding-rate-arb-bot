/**
 * Startup sequence: initial reconciliation and logging.
 *
 * Runs before the evaluation loop to establish truth from the exchange.
 *
 * @see {@link ../../../adrs/0001-bot-architecture.md ADR-0001: Bot Architecture}
 */

import type { ExchangeAdapter } from "@/adapters/types";
import type { Logger } from "@/lib/logger";
import type { StateStore } from "@/worker/state";

import { runReconcile } from "@/worker/reconciler";
import type { ReconcilerConfig } from "@/worker/reconciler";

/**
 * Dependencies for the startup sequence.
 */
export interface StartupDeps {
  adapter: ExchangeAdapter;
  stateStore: StateStore;
  reconcilerConfig: ReconcilerConfig;
  logger: Logger;
}

/**
 * Run startup sequence: initial reconciliation and log state.
 *
 * 1. Run initial reconciliation to establish truth from exchange.
 * 2. Log startup state (balance/position inconsistencies).
 * 3. Warn if position inconsistencies were detected.
 */
export const runStartupSequence = async (deps: StartupDeps): Promise<void> => {
  const { adapter, stateStore, reconcilerConfig, logger } = deps;

  const result = await runReconcile(adapter, stateStore, reconcilerConfig, logger);

  logger.info("Startup reconciliation complete", {
    consistent: result.consistent,
    balanceInconsistencies: result.balanceInconsistencies.length,
    positionInconsistencies: result.positionInconsistencies.length,
  });

  if (result.positionInconsistencies.length > 0) {
    logger.warn("Startup: position inconsistencies detected", {
      inconsistencies: result.positionInconsistencies,
    });
  }
};
