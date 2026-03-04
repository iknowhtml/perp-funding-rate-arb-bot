/**
 * GMX protocol adapter: concrete implementation of ProtocolAdapter for GMX v2 on Arbitrum.
 *
 * @see {@link ../../../../../../adrs/0019-on-chain-perps-pivot.md ADR-0019}
 * @see {@link ../../../../../../adrs/0022-regime-based-gmx-arb.md ADR-0022}
 */

import { type Address, isAddress } from "viem";

import { createLogger } from "@/lib/logger";

import type {
  LiquidityBalance,
  OiSkew,
  OpenPositionParams,
  PositionState,
  ProtocolAdapter,
  TxResult,
} from "@/adapters/types";
import { BTC_USD_MARKET, ETH_USD_MARKET } from "../api";
import type { GmxProtocolAdapterConfig } from "../config";
import { ChainError } from "../errors";
import {
  compute4hMaFundingRateBps,
  getExecutionPriceFromReader,
  getFundingRateForMarket,
  getGmBalance,
  getMarketsInfo as getMarketsInfoRead,
  getOiSkewForMarket,
  getPositionState as getPositionStateRead,
  getTickers as getTickersRead,
} from "../reads";
import type { GmxMarket, GmxReadsDeps, GmxTicker } from "../types";

/**
 * GMX implementation of ProtocolAdapter: read/write operations for GMX v2 on Arbitrum.
 */
export interface GmxProtocolAdapter extends ProtocolAdapter {
  getMarketsInfo(): Promise<GmxMarket[]>;
  getTickers(): Promise<GmxTicker[]>;
  getMaFundingRate(market: string, samples?: bigint[]): Promise<bigint>;
  getOiSkew(market: string): Promise<OiSkew | null>;
}

const logger = createLogger();

export const createGmxProtocolAdapter = (config: GmxProtocolAdapterConfig): GmxProtocolAdapter => {
  const { baseUrl, publicClient, account, chainId } = config;
  if (baseUrl == null) {
    throw new Error("baseUrl is required");
  }
  if (publicClient == null) {
    throw new Error("publicClient is required");
  }
  if (account == null) {
    throw new Error("account is required");
  }
  if (chainId == null) {
    throw new Error("chainId is required");
  }
  const readsDeps: GmxReadsDeps = { publicClient, chainId };

  return {
    getMarketsInfo: () => getMarketsInfoRead(baseUrl),
    getTickers: () => getTickersRead(baseUrl),
    getPositionState: async (market: string): Promise<PositionState | null> => {
      if (account == null || !isAddress(market)) {
        return null;
      }
      return getPositionStateRead(readsDeps, account, market);
    },
    getLiquidityBalance: async (pool: Address): Promise<LiquidityBalance> => {
      const balance = await getGmBalance(readsDeps, pool, account);
      return { pool, balance };
    },
    simulateOrder: async ({
      market,
      positionSizeUsd,
    }: OpenPositionParams): Promise<{ impactBps: bigint }> => {
      const tickers = await getTickersRead(baseUrl);
      const marketNormalized = market.toLowerCase();

      let ticker: GmxTicker | undefined;
      switch (marketNormalized) {
        case ETH_USD_MARKET.toLowerCase():
          ticker = tickers.find((t) => t.tokenSymbol === "ETH");
          break;
        case BTC_USD_MARKET.toLowerCase():
          ticker = tickers.find((t) => t.tokenSymbol === "BTC");
          break;
      }

      if (ticker === undefined) {
        const message = `No ticker for market ${market}; available: ${tickers.map((t) => t.tokenSymbol).join(", ")}`;
        logger.error(message);
        throw new Error(message);
      }

      try {
        const result = await getExecutionPriceFromReader({
          deps: readsDeps,
          market,
          price: { min: ticker.minPrice, max: ticker.maxPrice },
          positionSizeUsd,
          isLong: false,
        });

        const impactUsd =
          result.priceImpactUsd < 0n ? -result.priceImpactUsd : result.priceImpactUsd;
        const impactBps = positionSizeUsd > 0n ? (impactUsd * 10000n) / positionSizeUsd : 0n;
        return { impactBps };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new ChainError(`getExecutionPrice failed: ${message}`, "TX_REVERTED", err);
      }
    },
    submitOrder: async (_params: OpenPositionParams): Promise<TxResult> => {
      throw new Error("GMX submitOrder not yet implemented");
    },
    getMaFundingRate: async (market: string, samples?: bigint[]): Promise<bigint> => {
      if (!isAddress(market)) {
        return 0n;
      }
      if (samples != null && samples.length > 0) {
        return compute4hMaFundingRateBps(samples);
      }
      const markets = await getMarketsInfoRead(baseUrl);
      const raw = getFundingRateForMarket(markets, market);
      if (raw == null) {
        return 0n;
      }
      return raw.fundingRateLong;
    },
    getOiSkew: async (market: string): Promise<OiSkew | null> => {
      if (!isAddress(market)) {
        return null;
      }
      const markets = await getMarketsInfoRead(baseUrl);
      return getOiSkewForMarket(markets, market);
    },
  };
};
