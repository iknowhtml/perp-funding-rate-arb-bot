/**
 * Unified request policy wrapper combining rate limiting, circuit breaker,
 * timeouts, and retry logic.
 *
 * Order of operations:
 * 1. Acquire tokens from the appropriate bucket (global + endpoint)
 * 2. Enforce request timeout (timeouts count as failures)
 * 3. Execute inside circuit breaker
 * 4. Apply retry/backoff for retryable errors (429/5xx/timeouts/network)
 * 5. Persist metrics/events (wait time, retries, breaker state)
 *
 * @see {@link ../../../../adrs/0011-exchange-rate-limiting.md ADR-0011: Exchange Rate Limiting}
 */

import {
  type BackoffConfig,
  DEFAULT_BACKOFF_CONFIG,
  RATE_LIMIT_BACKOFF_CONFIG,
  calculateBackoffMs,
  isRetryableError,
  parseRetryAfterMs,
} from "./backoff";
import {
  type CircuitBreakerConfig,
  CircuitOpenError,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  createCircuitBreaker,
} from "./circuit-breaker";
import {
  type EndpointCategory,
  type Exchange,
  type ExchangeRateLimitConfig,
  getEndpointCategory,
} from "./exchanges";
import { type TokenBucket, createTokenBucket } from "./token-bucket";

/**
 * Type guard to check if a value is a headers record object.
 */
const isHeadersRecord = (value: unknown): value is Record<string, string | undefined> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export interface RequestPolicyConfig {
  /** Exchange this policy is for */
  exchange: Exchange;
  /** Exchange rate limit configuration */
  rateLimits: ExchangeRateLimitConfig;
  /** Custom weight calculator for weight-based rate limiting (e.g., Binance) */
  getEndpointWeight?: (endpoint: string) => number;
  /** Circuit breaker configuration */
  circuitBreakerConfig?: CircuitBreakerConfig;
  /** Backoff configuration for retries */
  backoffConfig?: BackoffConfig;
  /** Maximum number of retries */
  maxRetries?: number;
  /** Request timeout in ms */
  defaultTimeoutMs?: number;
  /** Logger for events */
  logger?: RequestPolicyLogger;
}

export interface RequestPolicyLogger {
  debug: (message: string, data?: Record<string, unknown>) => void;
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
}

export interface ExecuteOptions {
  /** Endpoint path (used to determine rate limit bucket) */
  endpoint: string;
  /** Request weight (for Binance weight-based limits) */
  weight?: number;
  /** Request timeout override (ms) */
  timeoutMs?: number;
  /** Custom retry check (default: isRetryableError) */
  retryable?: (error: unknown) => boolean;
  /** Max retries override */
  maxRetries?: number;
  /** Skip rate limiting (emergency only) */
  skipRateLimit?: boolean;
  /** Skip circuit breaker (emergency only) */
  skipCircuitBreaker?: boolean;
}

export interface RequestPolicyMetrics {
  /** Total requests made */
  totalRequests: number;
  /** Total successful requests */
  successfulRequests: number;
  /** Total failed requests */
  failedRequests: number;
  /** Total retries */
  totalRetries: number;
  /** Total rate limit waits */
  rateLimitWaits: number;
  /** Total time spent waiting for rate limits (ms) */
  rateLimitWaitTimeMs: number;
  /** Circuit breaker trips */
  circuitBreakerTrips: number;
}

export interface RequestPolicy {
  /** Execute a function with rate limiting, circuit breaker, and retry */
  execute: <T>(fn: () => Promise<T>, options: ExecuteOptions) => Promise<T>;
  /** Get current metrics */
  getMetrics: () => RequestPolicyMetrics;
  /** Reset metrics */
  resetMetrics: () => void;
  /** Get circuit breaker state */
  getCircuitState: () => "CLOSED" | "OPEN" | "HALF_OPEN";
  /** Get available tokens for an endpoint */
  getAvailableTokens: (endpoint: string) => number;
}

/**
 * Error thrown when request times out.
 */
export class RequestTimeoutError extends Error {
  constructor(
    message: string,
    public readonly timeoutMs: number,
  ) {
    super(message);
    this.name = "RequestTimeoutError";
  }
}

/**
 * Error thrown when max retries exceeded.
 */
export class MaxRetriesExceededError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastError: unknown,
  ) {
    super(message);
    this.name = "MaxRetriesExceededError";
  }
}

/**
 * Error thrown when rate limit exceeded and cannot wait.
 */
export class RateLimitExceededError extends Error {
  constructor(
    message: string,
    public readonly endpoint: string,
    public readonly waitTimeMs: number,
  ) {
    super(message);
    this.name = "RateLimitExceededError";
  }
}

/**
 * Utility for creating a timeout wrapper.
 */
const withTimeout = <T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> => {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new RequestTimeoutError(`Request timed out after ${timeoutMs}ms`, timeoutMs));
    }, timeoutMs);

    fn()
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
};

/**
 * Sleep utility for delays.
 */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Creates a request policy for an exchange.
 *
 * @example
 * ```typescript
 * import { BINANCE_RATE_LIMITS, getBinanceEndpointWeight } from "@/adapters/binance";
 *
 * const policy = createRequestPolicy({
 *   exchange: "binance",
 *   rateLimits: BINANCE_RATE_LIMITS,
 *   getEndpointWeight: getBinanceEndpointWeight, // For weight-based rate limiting
 * });
 *
 * // Execute with rate limiting and circuit breaker
 * const result = await policy.execute(
 *   () => fetch("/api/v3/account"),
 *   { endpoint: "/api/v3/account" }, // Weight calculated automatically
 * );
 * ```
 */
export const createRequestPolicy = (config: RequestPolicyConfig): RequestPolicy => {
  const {
    exchange,
    rateLimits,
    getEndpointWeight,
    circuitBreakerConfig = DEFAULT_CIRCUIT_BREAKER_CONFIG,
    backoffConfig = DEFAULT_BACKOFF_CONFIG,
    maxRetries = 3,
    defaultTimeoutMs = rateLimits.defaultTimeoutMs,
    logger,
  } = config;

  // Create token buckets for each endpoint category
  const buckets: Record<EndpointCategory, TokenBucket> = {
    public: createTokenBucket(rateLimits.rest.public),
    private: createTokenBucket(rateLimits.rest.private),
    orders: createTokenBucket(rateLimits.rest.orders),
  };

  // Create circuit breaker
  const circuitBreaker = createCircuitBreaker(circuitBreakerConfig);

  // Track metrics
  let metrics: RequestPolicyMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    totalRetries: 0,
    rateLimitWaits: 0,
    rateLimitWaitTimeMs: 0,
    circuitBreakerTrips: 0,
  };

  // Track circuit breaker state changes
  circuitBreaker.onStateChange((state) => {
    if (state === "OPEN") {
      metrics.circuitBreakerTrips++;
      logger?.warn("Circuit breaker opened", { exchange, trips: metrics.circuitBreakerTrips });
    } else if (state === "CLOSED") {
      logger?.info("Circuit breaker closed", { exchange });
    }
  });

  const execute = async <T>(fn: () => Promise<T>, options: ExecuteOptions): Promise<T> => {
    const {
      endpoint,
      weight = getEndpointWeight ? getEndpointWeight(endpoint) : 1,
      timeoutMs = defaultTimeoutMs,
      retryable = isRetryableError,
      maxRetries: maxRetriesOverride = maxRetries,
      skipRateLimit = false,
      skipCircuitBreaker = false,
    } = options;

    metrics.totalRequests++;
    const category = getEndpointCategory(endpoint);
    const bucket = buckets[category];

    let lastError: unknown;
    let attempt = 0;

    while (attempt <= maxRetriesOverride) {
      try {
        // Step 1: Acquire tokens (rate limiting)
        if (!skipRateLimit) {
          const waitTimeMs = bucket.getWaitTimeMs(weight);
          if (waitTimeMs > 0) {
            metrics.rateLimitWaits++;
            metrics.rateLimitWaitTimeMs += waitTimeMs;
            logger?.debug("Rate limit wait", { exchange, endpoint, waitTimeMs, category });
            await bucket.consume(weight);
          } else {
            // Consume without waiting
            bucket.tryConsume(weight);
          }
        }

        // Step 2-3: Execute with timeout and circuit breaker
        const executeWithTimeout = (): Promise<T> => withTimeout(fn, timeoutMs);

        let result: T;
        if (skipCircuitBreaker) {
          result = await executeWithTimeout();
        } else {
          result = await circuitBreaker.execute(executeWithTimeout);
        }

        // Success
        metrics.successfulRequests++;
        if (attempt > 0) {
          logger?.info("Request succeeded after retry", { exchange, endpoint, attempt });
        }
        return result;
      } catch (error) {
        lastError = error;

        // Circuit breaker open - don't retry
        if (error instanceof CircuitOpenError) {
          metrics.failedRequests++;
          logger?.warn("Request failed: circuit open", { exchange, endpoint });
          throw error;
        }

        // Check if retryable
        if (!retryable(error)) {
          metrics.failedRequests++;
          logger?.warn("Request failed: non-retryable error", {
            exchange,
            endpoint,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }

        // Max retries exceeded
        if (attempt >= maxRetriesOverride) {
          metrics.failedRequests++;
          throw new MaxRetriesExceededError(
            `Max retries (${maxRetriesOverride}) exceeded for ${endpoint}`,
            attempt + 1,
            lastError,
          );
        }

        // Step 4: Calculate backoff
        let backoffMs: number;

        // Check for Retry-After header (429 responses)
        if (
          error !== null &&
          typeof error === "object" &&
          "headers" in error &&
          isHeadersRecord(error.headers)
        ) {
          const headers = error.headers;
          const retryAfterValue = headers["retry-after"] ?? headers["Retry-After"] ?? null;
          const retryAfterMs = parseRetryAfterMs(retryAfterValue);
          if (retryAfterMs !== null) {
            backoffMs = retryAfterMs;
            logger?.debug("Using Retry-After header", { exchange, endpoint, backoffMs });
          } else {
            backoffMs = calculateBackoffMs(attempt, backoffConfig);
          }
        } else {
          // Use configured backoff
          const is429 =
            error !== null &&
            typeof error === "object" &&
            (("status" in error && error.status === 429) ||
              ("statusCode" in error && error.statusCode === 429));

          backoffMs = calculateBackoffMs(
            attempt,
            is429 ? RATE_LIMIT_BACKOFF_CONFIG : backoffConfig,
          );
        }

        metrics.totalRetries++;
        logger?.debug("Retrying request", {
          exchange,
          endpoint,
          attempt,
          backoffMs,
          error: error instanceof Error ? error.message : String(error),
        });

        await sleep(backoffMs);
        attempt++;
      }
    }

    // This shouldn't be reached, but TypeScript needs it
    metrics.failedRequests++;
    throw new MaxRetriesExceededError(
      `Max retries (${maxRetriesOverride}) exceeded for ${endpoint}`,
      attempt + 1,
      lastError,
    );
  };

  const getMetrics = (): RequestPolicyMetrics => ({ ...metrics });

  const resetMetrics = (): void => {
    metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalRetries: 0,
      rateLimitWaits: 0,
      rateLimitWaitTimeMs: 0,
      circuitBreakerTrips: 0,
    };
  };

  const getCircuitState = (): "CLOSED" | "OPEN" | "HALF_OPEN" => circuitBreaker.getState();

  const getAvailableTokens = (endpoint: string): number => {
    const category = getEndpointCategory(endpoint);
    return buckets[category].getAvailableTokens();
  };

  return {
    execute,
    getMetrics,
    resetMetrics,
    getCircuitState,
    getAvailableTokens,
  };
};
