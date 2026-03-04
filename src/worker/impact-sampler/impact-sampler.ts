import { BTC_USD_MARKET, ETH_USD_MARKET, type GmxTicker, fetchGmxTickers } from "@/adapters/gmx";
import type { ProtocolAdapter } from "@/adapters/types";
import { estimateExecutionFeeWei } from "@/lib/chain/gas";
import { type Database, executionEstimate } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { createScheduler } from "@/worker/scheduler";
import { ARBITRUM } from "@gmx-io/sdk/configs/chainIds";
import type { ContractsChainId } from "@gmx-io/sdk/configs/chains";
import type { PublicClient, WalletClient } from "viem";

const SAMPLE_SIZE_USD = 50_000n;
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
  /** Protocol adapter for simulateOrder (impact). */
  adapter: ProtocolAdapter;
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

export const createImpactSampler = (deps: ImpactSamplerDeps): ImpactSampler => {
  const scheduler = createScheduler();

  const sampleOnce = async (): Promise<void> => {
    const tickers = await fetchGmxTickers(deps.gmxOracleUrl);

    const ethTicker = tickers.find((t: GmxTicker) => t.tokenSymbol === "ETH");
    if (ethTicker === undefined) {
      throw new Error("ETH/USD ticker not found");
    }
    const btcTicker = tickers.find((t: GmxTicker) => t.tokenSymbol === "BTC");
    if (btcTicker === undefined) {
      throw new Error("BTC/USD ticker not found");
    }
    const averageEthPrice = (ethTicker.minPrice + ethTicker.maxPrice) / 2n;

    const feeWei = await estimateExecutionFeeWei(
      {
        publicClient: deps.publicClient,
        chainId: deps.chainId ?? ARBITRUM,
        maxExecutionFeeWei: deps.maxExecutionFeeWei,
      },
      "increase",
    );

    const estimatedGasUsd = (feeWei * averageEthPrice) / WEI_PER_ETH;
    const snapshotTime = new Date();

    for (const { address, name } of TARGET_MARKETS) {
      let price: bigint;
      switch (name) {
        case "ETH/USD":
          price = averageEthPrice;
          break;
        case "BTC/USD": {
          const averageBtcPrice = btcTicker ? (btcTicker.minPrice + btcTicker.maxPrice) / 2n : 0n;
          price = averageBtcPrice;
          break;
        }
        default: {
          throw new Error(`Unknown market: ${name}`);
        }
      }

      const { impactBps: simulatedImpactBps } = await deps.adapter.simulateOrder({
        market: address,
        sizeUsd: SAMPLE_SIZE_USD,
        acceptablePrice: price,
      });

      await deps.db.insert(executionEstimate).values({
        timestamp: snapshotTime,
        market: address,
        sizeUsd: SAMPLE_SIZE_USD,
        simulatedImpactBps,
        estimatedGasUsd,
        acceptablePrice: price,
      });

      const logger = createLogger();
      logger.debug("Recorded impact sample", {
        market: address,
        impactBps: simulatedImpactBps.toString(),
      });
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
