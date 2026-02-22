/**
 * GMX protocol adapter: concrete implementation of ProtocolAdapter for GMX v2 on Arbitrum.
 *
 * @see {@link ../../../adrs/0019-on-chain-perps-pivot.md ADR-0019: On-Chain Perps Pivot}
 * @see {@link ../../../adrs/0022-regime-based-gmx-arb.md ADR-0022: Regime-Based GMX Arb}
 */

import type {
  LiquidityBalance,
  OpenPositionParams,
  PositionState,
  ProtocolAdapter,
  TxResult,
} from "../types";
import type { GmxMarket, GmxTicker } from "./api";
import { fetchGmxMarketsInfo, fetchGmxTickers } from "./api";

/** Configuration for creating a GMX protocol adapter. */
export interface GmxProtocolAdapterConfig {
  /** Base URL for GMX Oracle API (e.g. https://arbitrum-api.gmxinfra.io). */
  baseUrl: string;
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
}

/**
 * Create a GMX protocol adapter instance.
 *
 * @param config - Adapter config (Oracle API base URL).
 * @returns ProtocolAdapter implementation (GmxProtocolAdapter).
 */
export const createGmxProtocolAdapter = (config: GmxProtocolAdapterConfig): ProtocolAdapter => {
  const { baseUrl } = config;
  return {
    getMarketsInfo: () => fetchGmxMarketsInfo(baseUrl),
    getTickers: () => fetchGmxTickers(baseUrl),
    getPositionState: async (_market: string): Promise<PositionState | null> => {
      // TODO: chain read via Reader / DataStore
      return null;
    },
    getLiquidityBalance: async (pool: string): Promise<LiquidityBalance> => {
      // TODO: chain read GM balance for pool
      return { pool, balance: 0n };
    },
    simulateOrder: async (_params: OpenPositionParams): Promise<{ impactBps: bigint }> => {
      // TODO: GMX simulation
      return { impactBps: 0n };
    },
    submitOrder: async (_params: OpenPositionParams): Promise<TxResult> => {
      // TODO: build + send tx
      throw new Error("GMX submitOrder not yet implemented");
    },
  };
};
