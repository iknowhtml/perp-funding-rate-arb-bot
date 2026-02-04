/**
 * Exponential backoff utilities for retry logic.
 *
 * @see {@link ../../../../adrs/0011-exchange-rate-limiting.md ADR-0011: Exchange Rate Limiting}
 */

export interface BackoffConfig {
  /** Initial delay before first retry (ms) */
  initialDelayMs: number;
  /** Maximum delay between retries (ms) */
  maxDelayMs: number;
  /** Multiplier for exponential growth */
  multiplier: number;
  /** Jitter factor (0-1) to add randomness and prevent thundering herd */
  jitterFactor: number;
}

/**
 * Default backoff configuration.
 * - Starts at 1 second
 * - Doubles each retry
 * - Caps at 60 seconds
 * - Adds 10% jitter
 */
export const DEFAULT_BACKOFF_CONFIG: BackoffConfig = {
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  multiplier: 2,
  jitterFactor: 0.1,
};

/**
 * Aggressive backoff for rate limit violations.
 * - Starts at 2 seconds
 * - Triples each retry (more aggressive)
 * - Caps at 120 seconds
 * - Adds 20% jitter
 */
export const RATE_LIMIT_BACKOFF_CONFIG: BackoffConfig = {
  initialDelayMs: 2000,
  maxDelayMs: 120000,
  multiplier: 3,
  jitterFactor: 0.2,
};

/**
 * Calculates backoff delay for a given attempt number.
 *
 * @param attempt - The attempt number (0-indexed, so first retry is attempt 0)
 * @param config - Backoff configuration
 * @returns Delay in milliseconds (with jitter applied)
 *
 * @example
 * ```typescript
 * // First retry: ~1000ms
 * calculateBackoffMs(0);
 *
 * // Second retry: ~2000ms
 * calculateBackoffMs(1);
 *
 * // Third retry: ~4000ms
 * calculateBackoffMs(2);
 * ```
 */
export const calculateBackoffMs = (
  attempt: number,
  config: BackoffConfig = DEFAULT_BACKOFF_CONFIG,
): number => {
  const { initialDelayMs, maxDelayMs, multiplier, jitterFactor } = config;

  // Calculate base delay: initialDelay * multiplier^attempt
  const baseDelayMs = initialDelayMs * multiplier ** attempt;

  // Cap at maxDelay
  const cappedDelayMs = Math.min(baseDelayMs, maxDelayMs);

  // Add jitter: delay * (1 + random * jitterFactor)
  // This spreads out retries to prevent thundering herd
  const jitter = cappedDelayMs * jitterFactor * Math.random();

  return Math.floor(cappedDelayMs + jitter);
};

/**
 * Parses Retry-After header value.
 *
 * @param value - Header value (seconds as string, or HTTP date)
 * @returns Delay in milliseconds, or null if parsing fails
 *
 * @example
 * ```typescript
 * parseRetryAfterMs("30"); // 30000
 * parseRetryAfterMs("Wed, 21 Oct 2025 07:28:00 GMT"); // time until that date
 * ```
 */
export const parseRetryAfterMs = (value: string | null): number | null => {
  if (!value) {
    return null;
  }

  // Try parsing as seconds (integer)
  // Only accept if the entire string is a valid non-negative integer
  if (/^\d+$/.test(value)) {
    const seconds = Number.parseInt(value, 10);
    return seconds * 1000;
  }

  // Try parsing as HTTP date
  const date = Date.parse(value);
  if (!Number.isNaN(date)) {
    const delayMs = date - Date.now();
    return delayMs > 0 ? delayMs : 0;
  }

  return null;
};

/**
 * HTTP status codes that indicate retryable errors.
 */
export const RETRYABLE_STATUS_CODES = new Set([
  429, // Too Many Requests
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
]);

/**
 * HTTP status codes that indicate non-retryable errors.
 */
export const NON_RETRYABLE_STATUS_CODES = new Set([
  400, // Bad Request (client error)
  401, // Unauthorized
  403, // Forbidden
  404, // Not Found
  422, // Unprocessable Entity (validation error)
]);

/**
 * Checks if an HTTP status code is retryable.
 */
export const isRetryableStatusCode = (statusCode: number): boolean =>
  RETRYABLE_STATUS_CODES.has(statusCode);

/**
 * Error class names that should not be retried.
 */
const NON_RETRYABLE_ERROR_NAMES = new Set([
  "RequestTimeoutError",
  "CircuitOpenError",
  "MaxRetriesExceededError",
  "RateLimitExceededError",
]);

/**
 * Checks if an error is retryable based on its properties.
 *
 * Retryable:
 * - 429 (rate limit)
 * - 5xx (server errors)
 * - Network errors (ECONNRESET, ETIMEDOUT, etc.)
 *
 * Not retryable:
 * - 401/403 (auth errors)
 * - 400/422 (validation errors)
 * - Insufficient balance
 * - Order rejections
 * - Request timeouts (already timed out, retrying would just add latency)
 * - Circuit open errors
 */
/**
 * Extracts HTTP status code from an error object without type casts.
 */
const getStatusCode = (err: object): number | undefined => {
  if ("status" in err && typeof err.status === "number") {
    return err.status;
  }
  if ("statusCode" in err && typeof err.statusCode === "number") {
    return err.statusCode;
  }
  return undefined;
};

/**
 * Network error codes that indicate retryable errors.
 */
const NETWORK_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "ERR_SOCKET_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

/**
 * Error message patterns that indicate non-retryable errors.
 */
const NON_RETRYABLE_PATTERNS = [
  "insufficient balance",
  "insufficient margin",
  "invalid api key",
  "invalid signature",
  "order rejected",
  "position not found",
  "invalid parameter",
  "validation error",
];

export const isRetryableError = (error: unknown): boolean => {
  // Check for HTTP status codes
  if (error !== null && typeof error === "object") {
    // Check for known non-retryable error classes
    if (
      "name" in error &&
      typeof error.name === "string" &&
      NON_RETRYABLE_ERROR_NAMES.has(error.name)
    ) {
      return false;
    }

    // Check for status or statusCode property
    const statusCode = getStatusCode(error);

    if (statusCode !== undefined) {
      // Explicitly non-retryable
      if (NON_RETRYABLE_STATUS_CODES.has(statusCode)) {
        return false;
      }

      // Retryable status codes
      if (RETRYABLE_STATUS_CODES.has(statusCode)) {
        return true;
      }
    }

    // Check for error code (network errors)
    if ("code" in error && typeof error.code === "string") {
      if (NETWORK_ERROR_CODES.has(error.code)) {
        return true;
      }
    }

    // Check for known non-retryable error messages
    if ("message" in error && typeof error.message === "string") {
      const message = error.message.toLowerCase();

      if (NON_RETRYABLE_PATTERNS.some((pattern) => message.includes(pattern))) {
        return false;
      }
    }
  }

  // Default to retryable for unknown errors (conservative approach)
  return true;
};
