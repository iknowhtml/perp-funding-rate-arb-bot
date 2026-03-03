/**
 * GMX protocol adapter: concrete implementation of ProtocolAdapter for GMX v2 on Arbitrum.
 *
 * @see {@link ../../../adrs/0019-on-chain-perps-pivot.md ADR-0019: On-Chain Perps Pivot}
 * @see {@link ../../../adrs/0022-regime-based-gmx-arb.md ADR-0022: Regime-Based GMX Arb}
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
} from "../types";
import type { GmxMarket, GmxTicker } from "./api";
import { BTC_USD_MARKET, ETH_USD_MARKET } from "./api";
import type { GmxReadsDeps } from "./reads";
import {
  compute4hMaFundingRateBps,
  getExecutionPriceFromReader,
  getFundingRateForMarket,
  getGmBalance,
  getMarketsInfo as getMarketsInfoRead,
  getOiSkewForMarket,
  getPositionState as getPositionStateRead,
  getTickers as getTickersRead,
} from "./reads";

/** Configuration for creating a GMX protocol adapter. */
export interface GmxProtocolAdapterConfig {
  /** Base URL for GMX Oracle API (e.g. https://arbitrum-api.gmxinfra.io). */
  baseUrl: string;
  /** Optional: public client for chain reads (position, GM balance). */
  publicClient?: GmxReadsDeps["publicClient"];
  /** Optional: account address for position and balance reads. */
  account?: Address;
  /** Optional: chain ID (default Arbitrum). */
  chainId?: GmxReadsDeps["chainId"];
}

/**
 * GMX implementation of ProtocolAdapter: read/write operations for GMX v2 on Arbitrum.
 * No order book or WebSocket; uses REST + chain reads and transaction submission.
 */
export interface GmxProtocolAdapter extends ProtocolAdapter {
  /** Market info (funding, OI, borrow rates) from Oracle API. */
  getMarketsInfo(): Promise<GmxMarket[]>;
  /** Price tickers from Oracle API. */
  getTickers(): Promise<GmxTicker[]>;
  /** MA funding rate for regime detection (e.g. 4h MA or raw long rate in bps). */
  getMaFundingRate(market: string, samples?: bigint[]): Promise<bigint>;
  /** OI skew (long/short) for a market. */
  getOiSkew(market: string): Promise<OiSkew | null>;
}

/**
 * Create a GMX protocol adapter instance.
 *
 * @param config - Adapter config (baseUrl required; publicClient + account for chain reads).
 * @returns ProtocolAdapter implementation (GmxProtocolAdapter).
 */
const logger = createLogger();

export const createGmxProtocolAdapter = (config: GmxProtocolAdapterConfig): GmxProtocolAdapter => {
  const { baseUrl, publicClient, account, chainId } = config;
  const readsDeps: GmxReadsDeps | null =
    publicClient != null ? { publicClient, ...(chainId != null ? { chainId } : {}) } : null;

  return {
    getMarketsInfo: () => getMarketsInfoRead(baseUrl),
    getTickers: () => getTickersRead(baseUrl),
    getPositionState: async (market: string): Promise<PositionState | null> => {
      if (readsDeps == null || account == null || !isAddress(market)) {
        return null;
      }
      return getPositionStateRead(readsDeps, account, market);
    },
    getLiquidityBalance: async (pool: string): Promise<LiquidityBalance> => {
      if (readsDeps == null || account == null || !isAddress(pool)) {
        return { pool, balance: 0n };
      }
      const balance = await getGmBalance(readsDeps, pool, account);
      return { pool, balance };
    },
    simulateOrder: async (params: OpenPositionParams): Promise<{ impactBps: bigint }> => {
      if (readsDeps == null) {
        logger.warn("impactBps zero: publicClient not configured");
        return { impactBps: 0n };
      }
      if (!isAddress(params.market)) {
        logger.warn("impactBps zero: invalid market address", {
          market: params.market,
        });
        return { impactBps: 0n };
      }
      const tickers = await getTickersRead(baseUrl);
      const marketNorm = params.market.toLowerCase();
      const isEth = marketNorm === ETH_USD_MARKET.toLowerCase();
      const isBtc = marketNorm === BTC_USD_MARKET.toLowerCase();
      const ticker = isEth
        ? tickers.find((t) => t.tokenSymbol === "ETH")
        : isBtc
          ? tickers.find((t) => t.tokenSymbol === "BTC")
          : null;
      if (!ticker) {
        logger.warn("impactBps zero: no ticker for market", {
          market: params.market,
          marketNorm,
          availableSymbols: tickers.map((t) => t.tokenSymbol),
        });
        return { impactBps: 0n };
      }
      try {
        const result = await getExecutionPriceFromReader(
          readsDeps,
          params.market,
          ticker.minPrice,
          ticker.maxPrice,
          -params.sizeUsd,
          false,
        );
        const impactUsd =
          result.priceImpactUsd < 0n ? -result.priceImpactUsd : result.priceImpactUsd;
        const impactBps = params.sizeUsd > 0n ? (impactUsd * 10000n) / params.sizeUsd : 0n;
        return { impactBps };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn("impactBps zero: getExecutionPriceFromReader failed", {
          market: params.market,
          sizeUsd: params.sizeUsd,
          error: message,
        });
        return { impactBps: 0n };
      }
    },
    submitOrder: async (_params: OpenPositionParams): Promise<TxResult> => {
      // TODO: build + send tx
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
