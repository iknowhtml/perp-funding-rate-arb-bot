import { BTC_USD_MARKET, ETH_USD_MARKET, fetchGmxTickers } from "@/adapters/gmx";
import { executionEstimate } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { createScheduler } from "@/worker/scheduler";

import type { Database } from "@/lib/db/client";
import type { PublicClient, WalletClient } from "viem";

const SAMPLE_SIZE_USD = 50_000n * 10n ** 30n;
const SAMPLE_INTERVAL_MS = 5 * 60 * 1000;
const TARGET_MARKETS = [
  { address: ETH_USD_MARKET, name: "ETH/USD" },
  { address: BTC_USD_MARKET, name: "BTC/USD" },
];

export interface ImpactResult {
  simulatedImpactBps: bigint;
  estimatedGasUsd: bigint;
  acceptablePrice: bigint;
}

export interface ImpactSamplerDeps {
  db: Database;
  publicClient: PublicClient;
  walletClient: WalletClient | null;
  gmxOracleUrl: string;
}

export interface ImpactSampler {
  start: () => void;
  stop: () => void;
  sampleOnce: () => Promise<void>;
}

const TARGET_SIZE_USD = 50_000n * 10n ** 30n;

const estimateImpactFromMarketSize = (sizeUsd: bigint): bigint => {
  const sizeRatio = (sizeUsd * 100n) / TARGET_SIZE_USD;
  return (sizeRatio * 2n) / 100n;
};

export const createImpactSampler = (deps: ImpactSamplerDeps): ImpactSampler => {
  const scheduler = createScheduler();

  const simulateImpact = async (
    _market: string,
    sizeUsd: bigint,
    marketPrice: bigint,
  ): Promise<ImpactResult> => {
    const impactBps = estimateImpactFromMarketSize(sizeUsd);
    const executionPrice = marketPrice;
    const gasUsd = 10n * 10n ** 30n;

    return {
      simulatedImpactBps: impactBps,
      estimatedGasUsd: gasUsd,
      acceptablePrice: executionPrice,
    };
  };

  const sampleOnce = async (): Promise<void> => {
    try {
      const tickers = await fetchGmxTickers(deps.gmxOracleUrl);
      const ethTicker = tickers.find((t) => t.tokenSymbol === "ETH");
      const btcTicker = tickers.find((t) => t.tokenSymbol === "BTC");

      const ts = new Date();

      for (const { address, name } of TARGET_MARKETS) {
        try {
          const price =
            name === "ETH/USD"
              ? ethTicker
                ? (ethTicker.minPrice + ethTicker.maxPrice) / 2n
                : 0n
              : btcTicker
                ? (btcTicker.minPrice + btcTicker.maxPrice) / 2n
                : 0n;

          const result = await simulateImpact(address, SAMPLE_SIZE_USD, price);

          await deps.db.insert(executionEstimate).values({
            ts,
            market: address,
            sizeUsd: SAMPLE_SIZE_USD,
            simulatedImpactBps: result.simulatedImpactBps,
            estimatedGasUsd: result.estimatedGasUsd,
            acceptablePrice: result.acceptablePrice,
          });

          logger.debug("Recorded impact sample", {
            market: address,
            impactBps: result.simulatedImpactBps.toString(),
          });
        } catch (err) {
          logger.error(
            `Impact sample failed for ${name}`,
            err instanceof Error ? err : new Error(String(err)),
          );
        }
      }
    } catch (err) {
      logger.error("Impact sampler failed", err instanceof Error ? err : new Error(String(err)));
    }
  };

  let handle: { cancel: () => void } | null = null;

  return {
    start: (): void => {
      handle = scheduler.schedule({
        id: "impact-sampler",
        fn: sampleOnce,
        intervalMs: SAMPLE_INTERVAL_MS,
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
    sampleOnce,
  };
};
