/**
 * Coinbase Advanced Trade API rate limit configurations.
 *
 * @see https://docs.cdp.coinbase.com/advanced-trade/docs/rest-api-rate-limits
 *
 * - REST: 10 requests/second per IP
 * - Private endpoints: 15 requests/second
 * - WebSocket: 750 messages/second
 */

import type { ExchangeRateLimitConfig } from "@/lib/rate-limiter";

export const COINBASE_RATE_LIMITS: ExchangeRateLimitConfig = {
  rest: {
    public: { maxTokens: 10, refillRatePerSecond: 10 },
    private: { maxTokens: 15, refillRatePerSecond: 15 },
    orders: { maxTokens: 15, refillRatePerSecond: 15 },
  },
  websocket: { maxTokens: 750, refillRatePerSecond: 750 },
  defaultTimeoutMs: 5000,
};
