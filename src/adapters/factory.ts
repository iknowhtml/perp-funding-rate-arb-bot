/**
 * Factory function for creating exchange adapters.
 *
 * @see {@link ../adrs/0010-exchange-adapters.md ADR-0010: Exchange Adapters}
 */

import { createCoinbaseAdapter } from "./coinbase";
import type { AdapterConfig } from "./config";
import { createPaperAdapter } from "./paper";
import type { ExchangeAdapter } from "./types";

/**
 * Create an exchange adapter based on configuration.
 *
 * @param config - Validated adapter configuration
 * @returns ExchangeAdapter instance for the specified exchange
 */
export const createExchangeAdapter = (config: AdapterConfig): ExchangeAdapter => {
  switch (config.exchange) {
    case "coinbase":
      return createCoinbaseAdapter({
        apiKey: config.apiKey,
        apiSecret: config.apiSecret,
      });
    case "binance":
      throw new Error("Binance adapter not yet implemented");
    case "bybit":
      throw new Error("Bybit adapter not yet implemented");
    case "paper":
      return createPaperAdapter({
        initialBalances: config.initialBalances ?? {},
      });
  }
};
