import { fetchGmxMarketsInfo, fetchGmxTickers } from "@/adapters/gmx";
import { marketSnapshot } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { createScheduler } from "@/worker/scheduler";

import type { Database } from "@/lib/db/client";
import type { PublicClient } from "viem";

const COLLECT_INTERVAL_MS = 60_000;

export interface DataCollectorDeps {
  db: Database;
  gmxOracleUrl: string;
  publicClient: PublicClient;
}

export interface DataCollector {
  start: () => void;
  stop: () => void;
}

const computeOiSkewRatio = (longOi: bigint, shortOi: bigint): bigint | undefined => {
  const total = longOi + shortOi;
  if (total === 0n) return undefined;
  return (longOi * 1_000_000n) / total;
};

const findPriceForToken = (
  tickers: { tokenSymbol: string; minPrice: bigint; maxPrice: bigint }[],
  symbol: string,
): bigint | undefined => {
  const t = tickers.find((x) => x.tokenSymbol === symbol || x.tokenSymbol.startsWith(symbol));
  if (!t) return undefined;
  return (t.minPrice + t.maxPrice) / 2n;
};

export const createDataCollector = (deps: DataCollectorDeps): DataCollector => {
  const scheduler = createScheduler();

  const collectMarketSnapshot = async (): Promise<void> => {
    try {
      const [markets, tickers] = await Promise.all([
        fetchGmxMarketsInfo(deps.gmxOracleUrl),
        fetchGmxTickers(deps.gmxOracleUrl),
      ]);

      let gasPriceGwei: bigint | undefined;
      try {
        const gasPrice = await deps.publicClient.getGasPrice();
        gasPriceGwei = gasPrice / 10n ** 9n;
      } catch {
        // non-fatal
      }

      const ts = new Date();
      const symbolToPrice = new Map<string, bigint>();
      const ethPrice = findPriceForToken(tickers, "ETH");
      const btcPrice = findPriceForToken(tickers, "BTC");
      if (ethPrice) symbolToPrice.set("ETH", ethPrice);
      if (btcPrice) symbolToPrice.set("BTC", btcPrice);

      const targetMarkets = markets.filter(
        (m) => m.name.includes("ETH/USD") || m.name.includes("BTC/USD"),
      );

      for (const m of targetMarkets) {
        const marketSymbol = m.name.split("/")[0] ?? "ETH";
        const price = symbolToPrice.get(marketSymbol) ?? symbolToPrice.get("ETH") ?? 0n;
        const oiSkewRatio = computeOiSkewRatio(m.openInterestLong, m.openInterestShort);

        await deps.db.insert(marketSnapshot).values({
          ts,
          market: m.marketToken,
          marketName: m.name,
          price,
          longFundingRate: m.fundingRateLong,
          shortFundingRate: m.fundingRateShort,
          longOpenInterestUsd: m.openInterestLong,
          shortOpenInterestUsd: m.openInterestShort,
          borrowRateLong: m.borrowingRateLong,
          borrowRateShort: m.borrowingRateShort,
          oiSkewRatio,
          gasPriceGwei,
        });
      }

      logger.debug("Collected market snapshot", {
        marketCount: markets.length,
        ts: ts.toISOString(),
      });
    } catch (err) {
      logger.error("Data collector failed", err instanceof Error ? err : new Error(String(err)));
    }
  };

  let handle: { cancel: () => void } | null = null;

  return {
    start: (): void => {
      handle = scheduler.schedule({
        id: "data-collector",
        fn: collectMarketSnapshot,
        intervalMs: COLLECT_INTERVAL_MS,
        enabled: true,
      });
    },
    stop: (): void => {
      if (handle) {
        handle.cancel();
        handle = null;
      }
      scheduler.cancelAll();
    },
  };
};
