/**
 * Rate limiter module exports.
 *
 * @see {@link ../../../../adrs/0011-exchange-rate-limiting.md ADR-0011: Exchange Rate Limiting}
 */

export type { TokenBucket, TokenBucketConfig } from "./token-bucket";
export type { BackoffConfig } from "./backoff";
export type {
  CircuitBreaker,
  CircuitBreakerConfig,
  CircuitBreakerState,
} from "./circuit-breaker";
export type {
  EndpointCategory,
  Exchange,
  ExchangeRateLimitConfig,
} from "./exchanges";
export type {
  ExecuteOptions,
  RequestPolicy,
  RequestPolicyConfig,
  RequestPolicyLogger,
  RequestPolicyMetrics,
} from "./request-policy";

export { createTokenBucket } from "./token-bucket";
export {
  calculateBackoffMs,
  DEFAULT_BACKOFF_CONFIG,
  isRetryableError,
  isRetryableStatusCode,
  NON_RETRYABLE_STATUS_CODES,
  parseRetryAfterMs,
  RATE_LIMIT_BACKOFF_CONFIG,
  RETRYABLE_STATUS_CODES,
} from "./backoff";
export {
  CircuitOpenError,
  createCircuitBreaker,
  createSamplingCircuitBreaker,
  CRITICAL_CIRCUIT_BREAKER_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from "./circuit-breaker";
export { getEndpointCategory } from "./exchanges";
export { BINANCE_RATE_LIMITS, BYBIT_RATE_LIMITS, COINBASE_RATE_LIMITS } from "./presets";
export {
  createRequestPolicy,
  MaxRetriesExceededError,
  RateLimitExceededError,
  RequestTimeoutError,
} from "./request-policy";
