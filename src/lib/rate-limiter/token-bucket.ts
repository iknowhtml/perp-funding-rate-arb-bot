/**
 * Token bucket rate limiter implementation.
 *
 * @see {@link ../../../../adrs/0011-exchange-rate-limiting.md ADR-0011: Exchange Rate Limiting}
 */

export interface TokenBucketConfig {
  /** Maximum bucket capacity (tokens) */
  maxTokens: number;
  /** Tokens added per second */
  refillRatePerSecond: number;
  /** Starting tokens (default: maxTokens) */
  initialTokens?: number;
}

export interface TokenBucket {
  /** Attempts to consume tokens, returns true if successful */
  tryConsume: (tokens?: number) => boolean;
  /** Consumes tokens, waiting if necessary */
  consume: (tokens?: number) => Promise<void>;
  /** Returns the number of available tokens */
  getAvailableTokens: () => number;
  /** Returns the wait time in ms needed to consume tokens */
  getWaitTimeMs: (tokens?: number) => number;
  /** Resets the bucket to full capacity */
  reset: () => void;
  /** Reduces capacity temporarily (for penalizing on errors) */
  penalize: (multiplier: number) => void;
}

interface TokenBucketState {
  tokens: number;
  capacity: number;
  refillRatePerSecond: number;
  lastRefillTimestamp: number;
}

/**
 * Creates a token bucket rate limiter.
 *
 * Token bucket algorithm:
 * - Bucket holds up to `maxTokens` tokens
 * - Tokens are consumed when requests are made
 * - Tokens refill at `refillRatePerSecond` rate
 * - If not enough tokens, request must wait
 *
 * @example
 * ```typescript
 * const bucket = createTokenBucket({
 *   maxTokens: 10,
 *   refillRatePerSecond: 10,
 * });
 *
 * // Synchronous check
 * if (bucket.tryConsume()) {
 *   // Make request
 * }
 *
 * // Async wait if needed
 * await bucket.consume(5); // Wait for 5 tokens
 * // Make request
 * ```
 */
export const createTokenBucket = (config: TokenBucketConfig): TokenBucket => {
  const { maxTokens, refillRatePerSecond, initialTokens = maxTokens } = config;

  let state: TokenBucketState = {
    tokens: initialTokens,
    capacity: maxTokens,
    refillRatePerSecond,
    lastRefillTimestamp: Date.now(),
  };

  /**
   * Refills tokens based on elapsed time since last refill.
   */
  const refill = (): void => {
    const now = Date.now();
    const elapsedMs = now - state.lastRefillTimestamp;
    const elapsedSeconds = elapsedMs / 1000;
    const tokensToAdd = elapsedSeconds * state.refillRatePerSecond;

    state = {
      ...state,
      tokens: Math.min(state.capacity, state.tokens + tokensToAdd),
      lastRefillTimestamp: now,
    };
  };

  const tryConsume = (tokens = 1): boolean => {
    refill();

    if (state.tokens >= tokens) {
      state = { ...state, tokens: state.tokens - tokens };
      return true;
    }

    return false;
  };

  const getWaitTimeMs = (tokens = 1): number => {
    refill();

    if (state.tokens >= tokens) {
      return 0;
    }

    const tokensNeeded = tokens - state.tokens;
    const waitTimeSeconds = tokensNeeded / state.refillRatePerSecond;
    return Math.ceil(waitTimeSeconds * 1000);
  };

  const consume = async (tokens = 1): Promise<void> => {
    const waitTimeMs = getWaitTimeMs(tokens);

    if (waitTimeMs > 0) {
      await sleep(waitTimeMs);
    }

    // After waiting, refill and consume
    refill();
    state = { ...state, tokens: state.tokens - tokens };
  };

  const getAvailableTokens = (): number => {
    refill();
    return state.tokens;
  };

  const reset = (): void => {
    state = {
      tokens: state.capacity,
      capacity: state.capacity,
      refillRatePerSecond: state.refillRatePerSecond,
      lastRefillTimestamp: Date.now(),
    };
  };

  const penalize = (multiplier: number): void => {
    // Reduce capacity temporarily (multiplier < 1 reduces, > 1 increases)
    const newCapacity = Math.floor(state.capacity * multiplier);
    state = {
      ...state,
      capacity: Math.max(1, newCapacity), // Ensure at least 1 token capacity
      tokens: Math.min(state.tokens, newCapacity),
    };
  };

  return {
    tryConsume,
    consume,
    getAvailableTokens,
    getWaitTimeMs,
    reset,
    penalize,
  };
};

/**
 * Utility function for delays.
 */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
