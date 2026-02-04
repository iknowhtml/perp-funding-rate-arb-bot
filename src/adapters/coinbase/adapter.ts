/**
 * Coinbase Advanced Trade adapter implementation.
 *
 * Wraps the official Coinbase SDK with rate limiting and domain normalization.
 *
 * @see {@link ../../../adrs/0010-exchange-adapters.md ADR-0010: Exchange Adapters}
 */

import {
  AccountsService,
  CoinbaseAdvTradeClient,
  CoinbaseAdvTradeCredentials,
  PublicService,
} from "@coinbase-sample/advanced-trade-sdk-ts";

import { createRequestPolicy } from "@/lib/rate-limiter";
import { ExchangeError } from "../errors";
import type { Balance, ExchangeAdapter, FundingRate, OrderBook, Ticker } from "../types";
import { normalizeBalances, normalizeFundingRate } from "./normalizers";
import { COINBASE_RATE_LIMITS } from "./rate-limits";

export interface CoinbaseAdapterConfig {
  apiKey: string;
  apiSecret: string;
}

/**
 * Create a Coinbase Advanced Trade adapter.
 *
 * @param config - Coinbase API credentials
 * @returns ExchangeAdapter implementation for Coinbase
 */
export const createCoinbaseAdapter = (config: CoinbaseAdapterConfig): ExchangeAdapter => {
  const credentials = new CoinbaseAdvTradeCredentials(config.apiKey, config.apiSecret);
  const client = new CoinbaseAdvTradeClient(credentials);
  const publicService = new PublicService(client);
  const accountsService = new AccountsService(client);

  const policy = createRequestPolicy({
    exchange: "coinbase",
    rateLimits: COINBASE_RATE_LIMITS,
  });

  let connected = false;

  return {
    connect: async () => {
      // Verify credentials with a lightweight request
      await policy.execute(() => publicService.getServerTime({}), { endpoint: "/time" });
      connected = true;
    },

    disconnect: async () => {
      connected = false;
    },

    isConnected: () => connected,

    getFundingRate: async (symbol: string): Promise<FundingRate> => {
      try {
        const result = await policy.execute(() => publicService.getProduct({ productId: symbol }), {
          endpoint: `/market/products/${symbol}`,
        });
        return normalizeFundingRate(result);
      } catch (error) {
        throw new ExchangeError(
          `Failed to fetch funding rate for ${symbol}`,
          "NETWORK_ERROR",
          "coinbase",
          error,
        );
      }
    },

    getBalances: async (): Promise<Balance[]> => {
      try {
        const result = await policy.execute(() => accountsService.listAccounts({}), {
          endpoint: "/accounts",
        });
        return normalizeBalances(result);
      } catch (error) {
        throw new ExchangeError("Failed to fetch balances", "NETWORK_ERROR", "coinbase", error);
      }
    },

    getBalance: async (asset: string): Promise<Balance> => {
      const balances = await policy.execute(() => accountsService.listAccounts({}), {
        endpoint: "/accounts",
      });
      const normalizedBalances = normalizeBalances(balances);
      const balance = normalizedBalances.find((b) => b.asset === asset);
      if (!balance) {
        throw new ExchangeError(`Balance not found for ${asset}`, "UNKNOWN", "coinbase");
      }
      return balance;
    },

    // MVP: Stub remaining methods - implement as needed
    getTicker: async (_symbol: string): Promise<Ticker> => {
      throw new ExchangeError("Not implemented", "UNKNOWN", "coinbase");
    },

    getOrderBook: async (_symbol: string, _depth?: number): Promise<OrderBook> => {
      throw new ExchangeError("Not implemented", "UNKNOWN", "coinbase");
    },

    createOrder: async (_params) => {
      throw new ExchangeError("Not implemented", "UNKNOWN", "coinbase");
    },

    cancelOrder: async (_orderId: string): Promise<void> => {
      throw new ExchangeError("Not implemented", "UNKNOWN", "coinbase");
    },

    getOrder: async (_orderId: string) => {
      throw new ExchangeError("Not implemented", "UNKNOWN", "coinbase");
    },

    getOpenOrders: async (_symbol?: string) => {
      throw new ExchangeError("Not implemented", "UNKNOWN", "coinbase");
    },

    getPosition: async (_symbol: string) => {
      throw new ExchangeError("Not implemented", "UNKNOWN", "coinbase");
    },

    getPositions: async () => {
      throw new ExchangeError("Not implemented", "UNKNOWN", "coinbase");
    },

    subscribeTicker: (_symbol: string, _callback) => {
      // MVP: No WebSocket implementation yet
    },

    unsubscribeTicker: (_symbol: string) => {
      // MVP: No WebSocket implementation yet
    },
  };
};
