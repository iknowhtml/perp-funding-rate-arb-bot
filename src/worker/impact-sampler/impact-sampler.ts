import { BTC_USD_MARKET, ETH_USD_MARKET, type GmxTicker, fetchGmxTickers } from "@/adapters/gmx";
import type { ProtocolAdapter } from "@/adapters/types";
import { estimateExecutionFeeWei } from "@/lib/chain/gas";
import { type Database, executionEstimate } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { createScheduler } from "@/worker/scheduler";
import { ARBITRUM } from "@gmx-io/sdk/configs/chainIds";
import type { ContractsChainId } from "@gmx-io/sdk/configs/chains";
import { expandDecimals } from "@gmx-io/sdk/utils/numbers";
import type { Address, PublicClient, WalletClient } from "viem";

/** 30-decimal USD. Position size we sample for and record in execution_estimate. */
const SAMPLE_POSITION_SIZE_USD = expandDecimals(1_000_000n, 30);

type TargetMarket = {
  address: Address;
  name: string;
};
const TARGET_MARKETS: TargetMarket[] = [
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
  /** Interval between impact samples in ms. Default 5 min when unset. */
  intervalMs?: number;
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

      const { impactBps } = await deps.adapter.simulateOrder({
        market: address,
        positionSizeUsd: SAMPLE_POSITION_SIZE_USD,
        acceptablePriceUsd: price,
      });

      await deps.db.insert(executionEstimate).values({
        timestamp: snapshotTime,
        market: address,
        positionSizeUsd: SAMPLE_POSITION_SIZE_USD,
        simulatedImpactBps: impactBps,
        estimatedGasUsd,
        acceptablePriceUsd: price,
      });

      const logger = createLogger();
      logger.debug("Recorded impact sample", {
        market: address,
        impactBps,
      });
    }
  };

  let handle: { cancel: () => void } | null = null;

  return {
    start: (): void => {
      handle = scheduler.schedule({
        id: "impact-sampler",
        fn: sampleOnce,
        intervalMs: deps.intervalMs ?? 5 * 60 * 1000,
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
