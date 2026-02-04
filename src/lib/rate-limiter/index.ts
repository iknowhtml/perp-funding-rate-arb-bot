/**
 * Rate limiter module exports.
 *
 * @see {@link ../../../../adrs/0011-exchange-rate-limiting.md ADR-0011: Exchange Rate Limiting}
 */

// Token bucket
export {
  createTokenBucket,
  type TokenBucket,
  type TokenBucketConfig,
} from "./token-bucket";

// Backoff utilities
export {
  calculateBackoffMs,
  DEFAULT_BACKOFF_CONFIG,
  isRetryableError,
  isRetryableStatusCode,
  NON_RETRYABLE_STATUS_CODES,
  parseRetryAfterMs,
  RATE_LIMIT_BACKOFF_CONFIG,
  RETRYABLE_STATUS_CODES,
  type BackoffConfig,
} from "./backoff";

// Circuit breaker
export {
  CircuitOpenError,
  createCircuitBreaker,
  createSamplingCircuitBreaker,
  CRITICAL_CIRCUIT_BREAKER_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  type CircuitBreaker,
  type CircuitBreakerConfig,
  type CircuitBreakerState,
} from "./circuit-breaker";

// Exchange types and utilities
export {
  getEndpointCategory,
  type EndpointCategory,
  type Exchange,
  type ExchangeRateLimitConfig,
} from "./exchanges";

// Re-export exchange-specific configs from adapters (for convenience)
export { COINBASE_RATE_LIMITS } from "@/adapters/coinbase/rate-limits";
export {
  BINANCE_ENDPOINT_WEIGHTS,
  BINANCE_RATE_LIMITS,
  getBinanceEndpointWeight,
} from "@/adapters/binance";
export { BYBIT_RATE_LIMITS } from "@/adapters/bybit";

// Request policy (main entry point)
export {
  createRequestPolicy,
  MaxRetriesExceededError,
  RateLimitExceededError,
  RequestTimeoutError,
  type ExecuteOptions,
  type RequestPolicy,
  type RequestPolicyConfig,
  type RequestPolicyLogger,
  type RequestPolicyMetrics,
} from "./request-policy";
