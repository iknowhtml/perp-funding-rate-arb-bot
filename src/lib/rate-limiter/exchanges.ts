/**
 * Generic rate limiting types and utilities.
 *
 * Exchange-specific configurations are now co-located with their adapters:
 * - Coinbase: `src/adapters/coinbase/rate-limits.ts`
 * - Binance: `src/adapters/binance/rate-limits.ts`
 * - Bybit: `src/adapters/bybit/rate-limits.ts`
 *
 * @see {@link ../../../../adrs/0011-exchange-rate-limiting.md ADR-0011: Exchange Rate Limiting}
 */

import type { TokenBucketConfig } from "./token-bucket";

// Re-export Exchange type from canonical location
export type { Exchange } from "@/adapters/types";

export type EndpointCategory = "public" | "private" | "orders";

export interface ExchangeRateLimitConfig {
  /** REST API rate limits per endpoint category */
  rest: Record<EndpointCategory, TokenBucketConfig>;
  /** WebSocket rate limit (messages per second) */
  websocket: TokenBucketConfig;
  /** Default request timeout in ms */
  defaultTimeoutMs: number;
}

/**
 * Determines the endpoint category based on the endpoint path.
 */
export const getEndpointCategory = (endpoint: string): EndpointCategory => {
  // Order-related endpoints
  if (
    endpoint.includes("/order") ||
    endpoint.includes("/trade") ||
    endpoint.includes("/leverage") ||
    endpoint.includes("/marginType")
  ) {
    return "orders";
  }

  // Private/authenticated endpoints
  if (
    endpoint.includes("/account") ||
    endpoint.includes("/balance") ||
    endpoint.includes("/position") ||
    endpoint.includes("/income") ||
    endpoint.includes("/userTrades") ||
    endpoint.includes("/listenKey")
  ) {
    return "private";
  }

  // Default to public
  return "public";
};
