/**
 * Exchange rate limit presets for testing and default configs.
 * Presets are defined here so the rate-limiter does not depend on adapter implementations.
 *
 * @see {@link ../../../../docs/adrs/0011-exchange-rate-limiting.md ADR-0011: Exchange Rate Limiting}
 */

import type { EndpointCategory, ExchangeRateLimitConfig } from "./exchanges";
import type { TokenBucketConfig } from "./token-bucket";

const bucket = (maxTokens: number, refillPerSecond: number): TokenBucketConfig => ({
  maxTokens,
  refillRatePerSecond: refillPerSecond,
});

const restBuckets = (
  publicConfig: TokenBucketConfig,
): Record<EndpointCategory, TokenBucketConfig> => ({
  public: publicConfig,
  private: publicConfig,
  orders: publicConfig,
});

/** Coinbase Advanced Trade: 10 req/s REST, 750 msg/s WebSocket */
export const COINBASE_RATE_LIMITS: ExchangeRateLimitConfig = {
  rest: restBuckets(bucket(10, 10)),
  websocket: bucket(750, 750),
  defaultTimeoutMs: 10_000,
};

/** Binance: 1200 req/min REST, 5 msg/s WebSocket */
export const BINANCE_RATE_LIMITS: ExchangeRateLimitConfig = {
  rest: restBuckets(bucket(1200, 1200 / 60)),
  websocket: bucket(5, 5),
  defaultTimeoutMs: 10_000,
};

/** Bybit: 120 req/5s REST, 100 msg/s WebSocket */
export const BYBIT_RATE_LIMITS: ExchangeRateLimitConfig = {
  rest: restBuckets(bucket(120, 120 / 5)),
  websocket: bucket(100, 100),
  defaultTimeoutMs: 10_000,
};
