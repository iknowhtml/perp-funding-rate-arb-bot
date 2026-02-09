/**
 * Execution-specific circuit breaker configuration.
 *
 * Per ADR-0001, execution failures use a conservative circuit breaker:
 * - Opens after 2 consecutive failures (fast protection for order flow)
 * - 30s half-open timeout before retrying
 *
 * Uses the existing circuit breaker from the rate-limiter module
 * with execution-specific configuration.
 *
 * @see {@link ../../../../adrs/0001-bot-architecture.md ADR-0001: Bot Architecture}
 */

import type { Logger } from "@/lib/logger/logger";
import {
  type CircuitBreaker,
  type CircuitBreakerConfig,
  createCircuitBreaker,
} from "@/lib/rate-limiter/circuit-breaker";

/**
 * Circuit breaker configuration for execution operations.
 *
 * More conservative than the default: opens after just 2 consecutive
 * failures to protect order flow. Full stop, manual intervention.
 */
export const EXECUTION_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 2, // Open after 2 consecutive failures
  successThreshold: 1, // Close after 1 success in half-open
  resetTimeoutMs: 30_000, // Try again after 30 seconds
};

/**
 * Create a circuit breaker configured for execution operations.
 *
 * Logs state transitions for observability. When the breaker opens,
 * all subsequent execution attempts fail fast until the half-open
 * period allows a test request.
 *
 * @param logger - Logger for state change events
 * @returns Circuit breaker instance
 */
export const createExecutionCircuitBreaker = (logger: Logger): CircuitBreaker => {
  const breaker = createCircuitBreaker(EXECUTION_CIRCUIT_BREAKER_CONFIG);

  breaker.onStateChange((state) => {
    if (state === "OPEN") {
      logger.error(
        "Execution circuit breaker OPENED after consecutive failures",
        new Error("Execution circuit breaker opened"),
        { state, config: EXECUTION_CIRCUIT_BREAKER_CONFIG },
      );
    } else if (state === "CLOSED") {
      logger.info("Execution circuit breaker CLOSED, resuming normal operation", {
        state,
      });
    } else if (state === "HALF_OPEN") {
      logger.info("Execution circuit breaker HALF_OPEN, testing", { state });
    }
  });

  return breaker;
};
