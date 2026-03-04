/**
 * Generic rate limiting types and utilities.
 *
 * Exchange presets (COINBASE_RATE_LIMITS, etc.) are in `./presets.ts`.
 *
 * @see {@link ../../../../docs/adrs/0011-exchange-rate-limiting.md ADR-0011: Exchange Rate Limiting}
 */

import type { TokenBucketConfig } from "./token-bucket";

// Re-export Exchange type from canonical location
export type { Exchange } from "@/lib/protocols";

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
