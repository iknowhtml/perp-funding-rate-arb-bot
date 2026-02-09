/**
 * Data plane for managing WebSocket streams and REST polling.
 *
 * @see {@link ../../adrs/0001-bot-architecture.md ADR-0001: Bot Architecture}
 */

import type { ExchangeAdapter, FundingRate, Ticker } from "@/adapters/types";
import type { Logger } from "@/lib/logger";

import type { StateStore } from "./state";

/**
 * Configuration for data plane.
 */
export interface DataPlaneConfig {
  adapter: ExchangeAdapter;
  stateStore: StateStore;
  logger: Logger;
  symbols: string[];
  fundingPollIntervalMs?: number;
  accountPollIntervalMs?: number;
}

/**
 * Data plane interface for managing real-time data streams.
 */
export interface DataPlane {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
}

/**
 * Create a new data plane instance.
 */
export const createDataPlane = (config: DataPlaneConfig): DataPlane => {
  const {
    adapter,
    stateStore,
    logger,
    symbols,
    fundingPollIntervalMs = 30_000, // 30s default per ADR-0001
    accountPollIntervalMs = 30_000, // 30s default per ADR-0001
  } = config;

  let running = false;
  let fundingPollInterval: NodeJS.Timeout | null = null;
  let accountPollInterval: NodeJS.Timeout | null = null;

  const handleTickerUpdate = (ticker: Ticker): void => {
    stateStore.updateTicker(ticker);
    logger.debug("Ticker updated", { symbol: ticker.symbol });
  };

  const startFundingRatePolling = (): void => {
    const poll = async (): Promise<void> => {
      try {
        for (const symbol of symbols) {
          const fundingRate: FundingRate = await adapter.getFundingRate(symbol);
          stateStore.updateFundingRate(fundingRate);
          logger.debug("Funding rate updated", { symbol });
        }
      } catch (error) {
        logger.error(
          "Funding rate poll failed",
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    };

    // Poll immediately, then at interval
    void poll();
    fundingPollInterval = setInterval(() => {
      void poll();
    }, fundingPollIntervalMs);
  };

  const startAccountPolling = (): void => {
    const poll = async (): Promise<void> => {
      try {
        const [balances, positions, orders] = await Promise.all([
          adapter.getBalances(),
          adapter.getPositions(),
          adapter.getOpenOrders(),
        ]);

        stateStore.updateBalances(balances);
        stateStore.updatePositions(positions);
        stateStore.updateOrders(orders);
        logger.debug("Account data updated", {
          balanceCount: balances.length,
          positionCount: positions.length,
          orderCount: orders.length,
        });
      } catch (error) {
        logger.error(
          "Account poll failed",
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    };

    // Poll immediately, then at interval
    void poll();
    accountPollInterval = setInterval(() => {
      void poll();
    }, accountPollIntervalMs);
  };

  const stopPolling = (): void => {
    if (fundingPollInterval) {
      clearInterval(fundingPollInterval);
      fundingPollInterval = null;
    }
    if (accountPollInterval) {
      clearInterval(accountPollInterval);
      accountPollInterval = null;
    }
  };

  return {
    start: async (): Promise<void> => {
      if (running) {
        logger.warn("Data plane already running");
        return;
      }

      running = true;
      stateStore.setWsConnected(false);

      try {
        // Connect adapter (includes WebSocket setup)
        await adapter.connect();
        stateStore.setWsConnected(adapter.isConnected());

        // Subscribe to ticker updates for all symbols
        for (const symbol of symbols) {
          adapter.subscribeTicker(symbol, handleTickerUpdate);
        }

        // Start REST polling
        startFundingRatePolling();
        startAccountPolling();

        logger.info("Data plane started", {
          symbols,
          fundingPollIntervalMs,
          accountPollIntervalMs,
        });
      } catch (error) {
        running = false;
        stateStore.setWsConnected(false);
        logger.error(
          "Failed to start data plane",
          error instanceof Error ? error : new Error(String(error)),
        );
        throw error;
      }
    },

    stop: async (): Promise<void> => {
      if (!running) {
        return;
      }

      running = false;
      stateStore.setWsConnected(false);

      // Unsubscribe from tickers
      for (const symbol of symbols) {
        adapter.unsubscribeTicker(symbol);
      }

      // Stop polling
      stopPolling();

      // Disconnect adapter
      await adapter.disconnect();

      logger.info("Data plane stopped");
    },

    isRunning: (): boolean => running,
  };
};
