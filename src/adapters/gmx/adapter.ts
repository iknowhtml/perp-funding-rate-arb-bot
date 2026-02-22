/**
 * GMX adapter type and factory.
 * Concrete GMX module — no shared interface; domain code depends on GmxAdapter.
 *
 * @see {@link ../../../adrs/0019-on-chain-perps-pivot.md ADR-0019: On-Chain Perps Pivot}
 * @see {@link ../../../adrs/0022-regime-based-gmx-arb.md ADR-0022: Regime-Based GMX Arb}
 */

import type { LiquidityBalance, OpenPositionParams, PositionState, TxResult } from "../types";
import type { GmxMarket, GmxTicker } from "./api";
import { fetchGmxMarketsInfo, fetchGmxTickers } from "./api";

/** Configuration for creating a GMX adapter. */
export interface GmxAdapterConfig {
  /** Base URL for GMX Oracle API (e.g. https://arbitrum-api.gmxinfra.io). */
  baseUrl: string;
}

/**
 * GMX adapter: read/write operations for GMX v2 on Arbitrum.
 * No order book or WebSocket; uses REST + chain reads and transaction submission.
 */
export interface GmxAdapter {
  /** Market info (funding, OI, borrow rates) from Oracle API. */
  getMarketsInfo(): Promise<GmxMarket[]>;
  /** Price tickers from Oracle API. */
  getTickers(): Promise<GmxTicker[]>;
  /** Current position state for a market (perp + GM balance). */
  getPositionState(market: string): Promise<PositionState | null>;
  /** GM liquidity balance for a pool. */
  getLiquidityBalance(pool: string): Promise<LiquidityBalance>;
  /** Simulate open perp order (no tx). */
  simulateOrder(params: OpenPositionParams): Promise<{ impactBps: bigint }>;
  /** Submit open perp order; returns tx hash when broadcast. */
  submitOrder(params: OpenPositionParams): Promise<TxResult>;
}

/**
 * Create a GMX adapter instance.
 *
 * @param config - Adapter config (Oracle API base URL).
 * @returns GmxAdapter implementation.
 */
export const createGmxAdapter = (config: GmxAdapterConfig): GmxAdapter => {
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
