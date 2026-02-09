/**
 * Paper trading adapter stub implementation.
 *
 * Minimal implementation for testing without real exchange connections.
 * Full implementation deferred to Phase 4.
 *
 * @see {@link ../../adrs/0010-exchange-adapters.md ADR-0010: Exchange Adapters}
 */

import { ExchangeError } from "../errors";
import type {
  Balance,
  CreateOrderParams,
  ExchangeAdapter,
  FundingRate,
  Order,
  OrderBook,
  Position,
  Ticker,
  TickerCallback,
} from "../types";

export interface PaperAdapterConfig {
  initialBalances: Record<string, bigint>;
}

/**
 * Create a paper trading adapter.
 *
 * @param config - Paper adapter configuration
 * @returns ExchangeAdapter implementation for paper trading
 */
export const createPaperAdapter = (config: PaperAdapterConfig): ExchangeAdapter => {
  const balances = new Map<string, Balance>();
  let connected = false;

  // Initialize balances
  for (const [asset, amount] of Object.entries(config.initialBalances)) {
    balances.set(asset, {
      asset,
      availableBase: amount,
      heldBase: 0n,
      totalBase: amount,
    });
  }

  return {
    connect: async (): Promise<void> => {
      connected = true;
    },

    disconnect: async (): Promise<void> => {
      connected = false;
    },

    isConnected: (): boolean => connected,

    getBalance: async (asset: string): Promise<Balance> => {
      const balance = balances.get(asset);
      if (!balance) {
        return {
          asset,
          availableBase: 0n,
          heldBase: 0n,
          totalBase: 0n,
        };
      }
      return balance;
    },

    getBalances: async (): Promise<Balance[]> => Array.from(balances.values()),

    // Stub implementations - full implementation in Phase 4
    createOrder: async (_params: CreateOrderParams): Promise<Order> => {
      throw new ExchangeError("Paper trading createOrder not implemented yet", "UNKNOWN", "paper");
    },

    cancelOrder: async (_orderId: string): Promise<void> => {
      throw new ExchangeError("Paper trading cancelOrder not implemented yet", "UNKNOWN", "paper");
    },

    getOrder: async (_orderId: string): Promise<Order | null> => null,

    getOpenOrders: async (_symbol?: string): Promise<Order[]> => [],

    getPosition: async (_symbol: string): Promise<Position | null> => null,

    getPositions: async (): Promise<Position[]> => [],

    getTicker: async (_symbol: string): Promise<Ticker> => {
      throw new ExchangeError("Paper trading getTicker not implemented yet", "UNKNOWN", "paper");
    },

    getFundingRate: async (_symbol: string): Promise<FundingRate> => {
      throw new ExchangeError(
        "Paper trading getFundingRate not implemented yet",
        "UNKNOWN",
        "paper",
      );
    },

    getOrderBook: async (_symbol: string, _depth?: number): Promise<OrderBook> => {
      throw new ExchangeError("Paper trading getOrderBook not implemented yet", "UNKNOWN", "paper");
    },

    subscribeTicker: (_symbol: string, _callback: TickerCallback): void => {
      // No-op for paper trading
    },

    unsubscribeTicker: (_symbol: string): void => {
      // No-op for paper trading
    },
  };
};
