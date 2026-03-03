import { BTC_USD_MARKET, ETH_USD_MARKET, type GmxTicker, fetchGmxTickers } from "@/adapters/gmx";
import type { ProtocolAdapter } from "@/adapters/types";
import { estimateExecutionFeeWei } from "@/lib/chain/gas";
import { type Database, executionEstimate } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { createScheduler } from "@/worker/scheduler";
import { ARBITRUM } from "@gmx-io/sdk/configs/chainIds";
import type { ContractsChainId } from "@gmx-io/sdk/configs/chains";
import type { PublicClient, WalletClient } from "viem";

const SAMPLE_SIZE_USD = 50_000n * 10n ** 30n;
const SAMPLE_INTERVAL_MS = 5 * 60 * 1000;
const TARGET_MARKETS = [
  { address: ETH_USD_MARKET, name: "ETH/USD" },
  { address: BTC_USD_MARKET, name: "BTC/USD" },
];

/** ETH has 18 decimals; GMX USD prices use 30 decimals. */
const WEI_PER_ETH = 10n ** 18n;

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
  /** Optional: protocol adapter for simulateOrder (impact). If absent, uses stub. */
  adapter?: ProtocolAdapter | null;
  /** Chain ID for gas estimation (e.g. Arbitrum). */
  chainId?: ContractsChainId;
  /** Max execution fee (wei) for gas estimator deps; sampler does not enforce. */
  maxExecutionFeeWei: bigint;
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
      const ethTicker = tickers.find((t: GmxTicker) => t.tokenSymbol === "ETH");
      const btcTicker = tickers.find((t: GmxTicker) => t.tokenSymbol === "BTC");

      let estimatedGasUsd: bigint | undefined;
      const ethPrice30 = ethTicker ? (ethTicker.minPrice + ethTicker.maxPrice) / 2n : 0n;
      try {
        const feeWei = await estimateExecutionFeeWei(
          {
            publicClient: deps.publicClient,
            chainId: deps.chainId ?? ARBITRUM,
            maxExecutionFeeWei: deps.maxExecutionFeeWei,
          },
          "increase",
        );
        estimatedGasUsd = ethPrice30 > 0n ? (feeWei * ethPrice30) / WEI_PER_ETH : undefined;
      } catch {
        estimatedGasUsd = undefined;
      }

      const snapshotTime = new Date();

      for (const { address, name } of TARGET_MARKETS) {
        try {
          const price =
            name === "ETH/USD"
              ? ethPrice30
              : btcTicker
                ? (btcTicker.minPrice + btcTicker.maxPrice) / 2n
                : 0n;

          let simulatedImpactBps: bigint;
          let acceptablePrice: bigint | undefined = price > 0n ? price : undefined;
          if (deps.adapter) {
            const sim = await deps.adapter.simulateOrder({
              market: address,
              sizeUsd: SAMPLE_SIZE_USD,
              acceptablePrice: price,
            });
            simulatedImpactBps = sim.impactBps;
          } else {
            const result = await simulateImpact(address, SAMPLE_SIZE_USD, price);
            simulatedImpactBps = result.simulatedImpactBps;
            acceptablePrice = result.acceptablePrice ?? acceptablePrice;
          }

          await deps.db.insert(executionEstimate).values({
            timestamp: snapshotTime,
            market: address,
            sizeUsd: SAMPLE_SIZE_USD,
            simulatedImpactBps,
            estimatedGasUsd: estimatedGasUsd ?? undefined,
            acceptablePrice,
          });

          const logger = createLogger();
          logger.debug("Recorded impact sample", {
            market: address,
            impactBps: simulatedImpactBps.toString(),
          });
        } catch (err) {
          const logger = createLogger();
          logger.error(
            `Impact sample failed for ${name}`,
            err instanceof Error ? err : new Error(String(err)),
          );
        }
      }
    } catch (err) {
      const logger = createLogger();
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
