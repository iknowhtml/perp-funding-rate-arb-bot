/**
 * Binance API rate limit configurations and endpoint weights.
 *
 * @see https://binance-docs.github.io/apidocs/futures/en/#limits
 *
 * - 1200 weight per minute (IP-based)
 * - Order endpoints: ~1-10 weight per request
 * - Market data: 1-5 weight per request
 * - WebSocket: 5 messages/second
 */

import type { ExchangeRateLimitConfig } from "@/lib/rate-limiter";

export const BINANCE_RATE_LIMITS: ExchangeRateLimitConfig = {
  rest: {
    public: { maxTokens: 1200, refillRatePerSecond: 20 }, // 1200/60 = 20/s
    private: { maxTokens: 1200, refillRatePerSecond: 20 },
    orders: { maxTokens: 1200, refillRatePerSecond: 20 },
  },
  websocket: { maxTokens: 5, refillRatePerSecond: 5 },
  defaultTimeoutMs: 5000,
};

/**
 * Endpoint weights for Binance (weight-based rate limiting).
 * Other exchanges use weight=1 by default.
 */
export const BINANCE_ENDPOINT_WEIGHTS: Record<string, number> = {
  // Market data
  "/api/v3/ticker": 1,
  "/api/v3/depth": 5,
  "/api/v3/klines": 1,
  "/fapi/v1/ticker": 1,
  "/fapi/v1/depth": 5,
  "/fapi/v1/klines": 1,

  // Account
  "/api/v3/account": 10,
  "/fapi/v2/account": 5,
  "/fapi/v2/balance": 5,
  "/fapi/v2/positionRisk": 5,

  // Orders
  "/api/v3/order": 1,
  "/fapi/v1/order": 1,
  "/api/v3/openOrders": 3,
  "/fapi/v1/openOrders": 1,
};

/**
 * Gets the weight for a Binance endpoint.
 * Returns 1 for unknown endpoints (conservative default).
 */
export const getBinanceEndpointWeight = (endpoint: string): number => {
  // Try exact match first
  const exactWeight = BINANCE_ENDPOINT_WEIGHTS[endpoint];
  if (exactWeight !== undefined) {
    return exactWeight;
  }

  // Try prefix match
  for (const [pattern, weight] of Object.entries(BINANCE_ENDPOINT_WEIGHTS)) {
    if (endpoint.startsWith(pattern)) {
      return weight;
    }
  }

  // Conservative default
  return 1;
};
