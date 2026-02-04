/**
 * Bybit API rate limit configurations.
 *
 * @see https://bybit-exchange.github.io/docs/v5/rate-limit
 *
 * - Public: 120 requests per 5 seconds (24/s)
 * - Private: 10 requests per second
 * - Orders: 10 requests per second
 * - WebSocket: 100 messages/second
 */

import type { ExchangeRateLimitConfig } from "@/lib/rate-limiter";

export const BYBIT_RATE_LIMITS: ExchangeRateLimitConfig = {
  rest: {
    public: { maxTokens: 120, refillRatePerSecond: 24 }, // 120/5 = 24/s
    private: { maxTokens: 10, refillRatePerSecond: 10 },
    orders: { maxTokens: 10, refillRatePerSecond: 10 },
  },
  websocket: { maxTokens: 100, refillRatePerSecond: 100 },
  defaultTimeoutMs: 5000,
};
