/**
 * Data plane for GMX: REST polling (no WebSocket).
 *
 * @see {@link ../../../adrs/0001-bot-architecture.md ADR-0001: Bot Architecture}
 * @see {@link ../../../adrs/0019-on-chain-perps-pivot.md ADR-0019: On-Chain Perps Pivot}
 */

import { isAddress } from "viem";

import type { GmxMarket, GmxTicker } from "@/adapters/gmx";
import type {
  Balance,
  FundingRate,
  LiquidityBalance,
  Position,
  ProtocolAdapter,
  Ticker,
} from "@/adapters/types";
import type { Logger } from "@/lib/logger";

import type { StateStore } from "../state";

/**
 * Configuration for data plane (GMX path).
 */
export interface DataPlaneConfig {
  adapter: ProtocolAdapter;
  stateStore: StateStore;
  logger: Logger;
  symbols: string[];
  /** GMX market address for position/account data. */
  gmxMarket: string;
  /** GMX pool id for liquidity balance. */
  gmxPool: string;
  fundingPollIntervalMs?: number;
  accountPollIntervalMs?: number;
}

/**
 * Data plane interface for managing polling.
 */
export interface DataPlane {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
}

/** Map GmxTicker + symbol to Ticker for state. */
const tickerFromGmx = (
  _tokenSymbol: string,
  minPrice: bigint,
  maxPrice: bigint,
  symbol: string,
): Ticker => {
  const lastPriceQuote = minPrice + maxPrice > 0n ? (minPrice + maxPrice) / 2n : 0n;
  const now = new Date();
  return {
    symbol,
    bidPriceQuote: minPrice,
    askPriceQuote: maxPrice,
    lastPriceQuote,
    volumeBase: 0n,
    timestamp: now,
  };
};

/** Map GmxMarket to FundingRate for state (use short funding for arb). */
const fundingRateFromGmx = (
  _marketToken: string,
  fundingRateShort: bigint,
  symbol: string,
): FundingRate => ({
  symbol,
  rateBps: fundingRateShort,
  nextFundingTime: new Date(Date.now() + 3600_000),
  timestamp: new Date(),
});

/** Map PositionState to Position[] and LiquidityBalance to Balance[] for state. */
const accountFromGmx = (
  _market: string,
  positionState: Awaited<ReturnType<ProtocolAdapter["getPositionState"]>>,
  liquidityBalance: Awaited<ReturnType<ProtocolAdapter["getLiquidityBalance"]>>,
  perpSymbol: string,
  _baseAsset: string,
): { balances: Balance[]; positions: Position[] } => {
  const balances: Balance[] = [];
  const positions: Position[] = [];

  if (liquidityBalance.balance > 0n) {
    balances.push({
      asset: `GM-${liquidityBalance.pool}`,
      availableBase: liquidityBalance.balance,
      heldBase: 0n,
      totalBase: liquidityBalance.balance,
    });
  }

  if (positionState?.perpPosition) {
    const p = positionState.perpPosition;
    positions.push({
      symbol: perpSymbol,
      side: "SHORT",
      sizeBase: p.sizeUsd,
      entryPriceQuote: p.entryPrice,
      markPriceQuote: p.entryPrice,
      liquidationPriceQuote: p.liquidationPrice,
      unrealizedPnlQuote: p.pnlUsd,
      leverageBps: 10000n,
      marginQuote: p.sizeUsd,
    });
  }

  return { balances, positions };
};

/**
 * Create a new data plane instance (GMX polling only).
 */
export const createDataPlane = (config: DataPlaneConfig): DataPlane => {
  const {
    adapter,
    stateStore,
    logger,
    symbols,
    gmxMarket,
    gmxPool,
    fundingPollIntervalMs = 30_000,
    accountPollIntervalMs = 30_000,
  } = config;

  let running = false;
  let fundingPollInterval: NodeJS.Timeout | null = null;
  let accountPollInterval: NodeJS.Timeout | null = null;

  const startFundingRatePolling = (): void => {
    const poll = async (): Promise<void> => {
      try {
        const [marketsRaw, tickersRaw] = await Promise.all([
          adapter.getMarketsInfo(),
          adapter.getTickers(),
        ]);
        const markets = marketsRaw as GmxMarket[];
        const tickers = tickersRaw as GmxTicker[];
        const symbol = symbols[0];
        if (symbol) {
          const market = markets.find((m) => m.name.includes(symbol.replace("-", "/")));
          if (market) {
            stateStore.updateFundingRate(
              fundingRateFromGmx(market.marketToken, market.fundingRateShort, symbol),
            );
            logger.debug("Funding rate updated", { symbol });
          }
          const ticker = tickers.find((t) => t.tokenSymbol === symbol.replace("-USD", ""));
          if (ticker) {
            stateStore.updateTicker(
              tickerFromGmx(ticker.tokenSymbol, ticker.minPrice, ticker.maxPrice, symbol),
            );
            logger.debug("Ticker updated", { symbol });
          }
        }
      } catch (error) {
        logger.error(
          "Funding/ticker poll failed",
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    };

    void poll();
    fundingPollInterval = setInterval(() => {
      void poll();
    }, fundingPollIntervalMs);
  };

  const startAccountPolling = (): void => {
    const poll = async (): Promise<void> => {
      try {
        const poolIsValid = gmxPool.length > 0 && isAddress(gmxPool);
        const liquidityPromise: Promise<LiquidityBalance> = poolIsValid
          ? adapter.getLiquidityBalance(gmxPool)
          : Promise.resolve({ pool: "", balance: 0n });
        const [positionState, liquidityBalance] = await Promise.all([
          adapter.getPositionState(gmxMarket),
          liquidityPromise,
        ]);
        const perpSymbol = symbols[0] ?? "BTC-USD";
        const baseAsset = perpSymbol.split("-")[0] ?? "BTC";
        const { balances, positions } = accountFromGmx(
          gmxMarket,
          positionState,
          liquidityBalance,
          perpSymbol,
          baseAsset,
        );
        stateStore.updateBalances(balances);
        stateStore.updatePositions(positions);
        stateStore.updateOrders([]);
        logger.debug("Account data updated", {
          balanceCount: balances.length,
          positionCount: positions.length,
        });
      } catch (error) {
        logger.error(
          "Account poll failed",
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    };

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
        startFundingRatePolling();
        startAccountPolling();

        logger.info("Data plane started (GMX polling)", {
          symbols,
          fundingPollIntervalMs,
          accountPollIntervalMs,
        });
      } catch (error) {
        running = false;
        logger.error(
          "Failed to start data plane",
          error instanceof Error ? error : new Error(String(error)),
        );
        throw error;
      }
    },

    stop: async (): Promise<void> => {
      if (!running) return;

      running = false;
      stateStore.setWsConnected(false);
      stopPolling();
      logger.info("Data plane stopped");
    },

    isRunning: (): boolean => running,
  };
};
