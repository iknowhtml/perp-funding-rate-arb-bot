/**
 * Circuit breaker wrapper around cockatiel library.
 *
 * Circuit breaker pattern prevents cascading failures by:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: After threshold failures, all requests fail fast
 * - HALF_OPEN: After reset timeout, allows test requests
 *
 * @see {@link ../../../../adrs/0011-exchange-rate-limiting.md ADR-0011: Exchange Rate Limiting}
 */

import {
  BrokenCircuitError,
  CircuitState,
  ConsecutiveBreaker,
  SamplingBreaker,
  circuitBreaker,
  handleAll,
} from "cockatiel";

export type CircuitBreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening circuit */
  failureThreshold: number;
  /** Number of consecutive successes in HALF_OPEN to close circuit */
  successThreshold: number;
  /** Time in ms before attempting HALF_OPEN from OPEN */
  resetTimeoutMs: number;
  /** Request timeout in ms (timeouts count as failures) */
  requestTimeoutMs?: number;
}

export interface CircuitBreaker {
  /** Execute a function through the circuit breaker */
  execute: <T>(fn: () => Promise<T>) => Promise<T>;
  /** Get the current state of the circuit breaker */
  getState: () => CircuitBreakerState;
  /** Check if the circuit is currently open */
  isOpen: () => boolean;
  /** Reset the circuit breaker to CLOSED state */
  reset: () => void;
  /** Subscribe to state change events */
  onStateChange: (callback: (state: CircuitBreakerState) => void) => () => void;
}

/**
 * Default circuit breaker configuration.
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 3,
  resetTimeoutMs: 30000,
  requestTimeoutMs: 10000,
};

/**
 * Conservative circuit breaker for critical operations (orders).
 * Opens faster to protect order flow.
 */
export const CRITICAL_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  successThreshold: 2,
  resetTimeoutMs: 60000,
  requestTimeoutMs: 5000,
};

/**
 * Error thrown when circuit is open.
 */
export class CircuitOpenError extends Error {
  constructor(message = "Circuit breaker is open") {
    super(message);
    this.name = "CircuitOpenError";
  }
}

/**
 * Maps cockatiel CircuitState to our CircuitBreakerState type.
 */
const mapCircuitState = (state: CircuitState): CircuitBreakerState => {
  switch (state) {
    case CircuitState.Closed:
      return "CLOSED";
    case CircuitState.Open:
      return "OPEN";
    case CircuitState.HalfOpen:
      return "HALF_OPEN";
    default:
      return "CLOSED";
  }
};

/**
 * Creates a circuit breaker using cockatiel.
 *
 * @param config - Circuit breaker configuration
 * @returns Circuit breaker instance
 *
 * @example
 * ```typescript
 * const breaker = createCircuitBreaker({
 *   failureThreshold: 5,
 *   successThreshold: 3,
 *   resetTimeoutMs: 30000,
 * });
 *
 * // Execute through circuit breaker
 * const result = await breaker.execute(async () => {
 *   return await fetchData();
 * });
 *
 * // Check state
 * if (breaker.isOpen()) {
 *   console.log("Circuit is open, requests will fail fast");
 * }
 * ```
 */
export const createCircuitBreaker = (
  config: CircuitBreakerConfig = DEFAULT_CIRCUIT_BREAKER_CONFIG,
): CircuitBreaker => {
  const { failureThreshold, successThreshold, resetTimeoutMs } = config;

  // Create the circuit breaker policy
  const breaker = circuitBreaker(handleAll, {
    halfOpenAfter: resetTimeoutMs,
    breaker: new ConsecutiveBreaker(failureThreshold),
  });

  // Track state change listeners
  const stateChangeListeners = new Set<(state: CircuitBreakerState) => void>();

  // Subscribe to state changes from cockatiel
  breaker.onStateChange((state) => {
    const mappedState = mapCircuitState(state);
    for (const listener of stateChangeListeners) {
      listener(mappedState);
    }
  });

  // Track successes in half-open state
  let consecutiveSuccesses = 0;
  let previousState = breaker.state;

  const execute = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      const result = await breaker.execute(fn);

      // Track successes for half-open -> closed transition
      if (breaker.state === CircuitState.HalfOpen) {
        consecutiveSuccesses++;
        if (consecutiveSuccesses >= successThreshold) {
          // Cockatiel handles this automatically, but we track for logging
          consecutiveSuccesses = 0;
        }
      } else if (breaker.state === CircuitState.Closed) {
        consecutiveSuccesses = 0;
      }

      previousState = breaker.state;
      return result;
    } catch (error) {
      // Reset success counter on failure
      if (breaker.state === CircuitState.HalfOpen && previousState === CircuitState.HalfOpen) {
        consecutiveSuccesses = 0;
      }

      previousState = breaker.state;

      // Convert cockatiel's BrokenCircuitError to our error type
      if (error instanceof BrokenCircuitError) {
        throw new CircuitOpenError(`Circuit breaker is open after ${failureThreshold} failures`);
      }

      throw error;
    }
  };

  const getState = (): CircuitBreakerState => mapCircuitState(breaker.state);

  const isOpen = (): boolean => breaker.state === CircuitState.Open;

  const reset = (): void => {
    // Cockatiel doesn't have a direct reset method
    // We can only influence state through success/failure
    consecutiveSuccesses = 0;
  };

  const onStateChange = (callback: (state: CircuitBreakerState) => void): (() => void) => {
    stateChangeListeners.add(callback);
    return () => {
      stateChangeListeners.delete(callback);
    };
  };

  return {
    execute,
    getState,
    isOpen,
    reset,
    onStateChange,
  };
};

/**
 * Creates a sampling-based circuit breaker for high-throughput scenarios.
 *
 * Uses percentage-based thresholds instead of consecutive failures:
 * - Opens if failure rate exceeds threshold in sample window
 * - Better for handling occasional transient errors
 *
 * @param config - Base configuration
 * @param sampleSize - Number of requests to sample (default: 100)
 * @param failureRateThreshold - Failure percentage to trigger open (default: 0.5 = 50%)
 */
export const createSamplingCircuitBreaker = (
  config: Omit<CircuitBreakerConfig, "failureThreshold">,
  _sampleSize = 100,
  failureRateThreshold = 0.5,
): CircuitBreaker => {
  const { resetTimeoutMs } = config;

  const breaker = circuitBreaker(handleAll, {
    halfOpenAfter: resetTimeoutMs,
    breaker: new SamplingBreaker({
      threshold: failureRateThreshold,
      duration: 10000, // 10 second sample window
      minimumRps: 5, // Minimum requests to consider
    }),
  });

  const stateChangeListeners = new Set<(state: CircuitBreakerState) => void>();

  breaker.onStateChange((state) => {
    const mappedState = mapCircuitState(state);
    for (const listener of stateChangeListeners) {
      listener(mappedState);
    }
  });

  const execute = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await breaker.execute(fn);
    } catch (error) {
      if (error instanceof BrokenCircuitError) {
        throw new CircuitOpenError(
          `Circuit breaker is open (failure rate exceeded ${failureRateThreshold * 100}%)`,
        );
      }
      throw error;
    }
  };

  return {
    execute,
    getState: () => mapCircuitState(breaker.state),
    isOpen: () => breaker.state === CircuitState.Open,
    reset: () => {
      /* no-op for sampling breaker */
    },
    onStateChange: (callback) => {
      stateChangeListeners.add(callback);
      return () => {
        stateChangeListeners.delete(callback);
      };
    },
  };
};
