import { describe, expect, it, vi } from "vitest";

import type { Logger } from "@/lib/logger/logger";

import {
  EXECUTION_CIRCUIT_BREAKER_CONFIG,
  createExecutionCircuitBreaker,
} from "./execution-circuit-breaker";

const createMockLogger = (): Logger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

describe("EXECUTION_CIRCUIT_BREAKER_CONFIG", () => {
  it("should have conservative failure threshold", () => {
    expect(EXECUTION_CIRCUIT_BREAKER_CONFIG.failureThreshold).toBe(2);
  });

  it("should have 30s reset timeout", () => {
    expect(EXECUTION_CIRCUIT_BREAKER_CONFIG.resetTimeoutMs).toBe(30_000);
  });

  it("should require only 1 success to close", () => {
    expect(EXECUTION_CIRCUIT_BREAKER_CONFIG.successThreshold).toBe(1);
  });
});

describe("createExecutionCircuitBreaker", () => {
  it("should create a circuit breaker in CLOSED state", () => {
    const logger = createMockLogger();
    const breaker = createExecutionCircuitBreaker(logger);

    expect(breaker.getState()).toBe("CLOSED");
    expect(breaker.isOpen()).toBe(false);
  });

  it("should execute functions successfully when closed", async () => {
    const logger = createMockLogger();
    const breaker = createExecutionCircuitBreaker(logger);

    const result = await breaker.execute(async () => "success");

    expect(result).toBe("success");
  });

  it("should open after 2 consecutive failures", async () => {
    const logger = createMockLogger();
    const breaker = createExecutionCircuitBreaker(logger);

    // First failure
    await expect(
      breaker.execute(async () => {
        throw new Error("fail 1");
      }),
    ).rejects.toThrow("fail 1");

    // Second failure
    await expect(
      breaker.execute(async () => {
        throw new Error("fail 2");
      }),
    ).rejects.toThrow("fail 2");

    // Circuit should now be open
    expect(breaker.isOpen()).toBe(true);
    expect(breaker.getState()).toBe("OPEN");
  });

  it("should fail fast when circuit is open", async () => {
    const logger = createMockLogger();
    const breaker = createExecutionCircuitBreaker(logger);

    // Open the circuit
    for (let i = 0; i < 2; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error("fail");
        });
      } catch {
        // Expected
      }
    }

    // Should throw CircuitOpenError immediately
    await expect(breaker.execute(async () => "should not run")).rejects.toThrow();
  });

  it("should reset after success when in closed state", async () => {
    const logger = createMockLogger();
    const breaker = createExecutionCircuitBreaker(logger);

    // One failure
    try {
      await breaker.execute(async () => {
        throw new Error("fail");
      });
    } catch {
      // Expected
    }

    // Success resets counter
    await breaker.execute(async () => "success");

    // Another failure should not open (counter was reset)
    try {
      await breaker.execute(async () => {
        throw new Error("fail");
      });
    } catch {
      // Expected
    }

    expect(breaker.isOpen()).toBe(false);
  });
});
