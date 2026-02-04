import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COINBASE_RATE_LIMITS } from ".";

import { CircuitOpenError } from "./circuit-breaker";
import {
  MaxRetriesExceededError,
  RequestTimeoutError,
  createRequestPolicy,
} from "./request-policy";

describe("createRequestPolicy", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createTestPolicy = (overrides?: Record<string, unknown>) =>
    createRequestPolicy({
      exchange: "coinbase",
      rateLimits: COINBASE_RATE_LIMITS,
      maxRetries: 2,
      defaultTimeoutMs: 1000,
      circuitBreakerConfig: {
        failureThreshold: 3,
        successThreshold: 2,
        resetTimeoutMs: 5000,
      },
      ...overrides,
    });

  describe("successful execution", () => {
    it("should execute and return result", async () => {
      const policy = createTestPolicy();

      const result = await policy.execute(async () => "success", {
        endpoint: "/api/ticker",
      });

      expect(result).toBe("success");
    });

    it("should track successful requests in metrics", async () => {
      const policy = createTestPolicy();

      await policy.execute(async () => "success", { endpoint: "/api/ticker" });

      const metrics = policy.getMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.successfulRequests).toBe(1);
      expect(metrics.failedRequests).toBe(0);
    });
  });

  describe("rate limiting", () => {
    it("should wait when rate limited", async () => {
      const policy = createTestPolicy();

      // Exhaust the bucket
      for (let i = 0; i < 10; i++) {
        await policy.execute(async () => "success", { endpoint: "/api/ticker" });
      }

      // Next request should wait
      const executePromise = policy.execute(async () => "success", {
        endpoint: "/api/ticker",
      });

      // Advance time to allow token refill
      await vi.advanceTimersByTimeAsync(100);

      await executePromise;

      const metrics = policy.getMetrics();
      expect(metrics.rateLimitWaits).toBeGreaterThan(0);
    });

    it("should skip rate limiting when flag is set", async () => {
      const policy = createTestPolicy();

      // This should work even if bucket is empty
      const result = await policy.execute(async () => "success", {
        endpoint: "/api/ticker",
        skipRateLimit: true,
      });

      expect(result).toBe("success");
    });

    it("should use correct bucket based on endpoint category", () => {
      const policy = createTestPolicy();

      // Public endpoint
      expect(policy.getAvailableTokens("/api/ticker")).toBe(10); // Coinbase public limit

      // Private endpoint
      expect(policy.getAvailableTokens("/api/account")).toBe(15); // Coinbase private limit

      // Order endpoint
      expect(policy.getAvailableTokens("/api/order")).toBe(15);
    });
  });

  describe("timeout handling", () => {
    it("should timeout slow requests", async () => {
      // Use real timers for this test as fake timers don't play well with Promise.race
      vi.useRealTimers();

      const policy = createRequestPolicy({
        exchange: "coinbase",
        rateLimits: COINBASE_RATE_LIMITS,
        maxRetries: 0, // No retries for faster test
        defaultTimeoutMs: 50,
        circuitBreakerConfig: {
          failureThreshold: 10, // High threshold to avoid circuit opening
          successThreshold: 2,
          resetTimeoutMs: 5000,
        },
      });

      const slowFn = async (): Promise<string> => {
        return new Promise((resolve) => {
          setTimeout(() => resolve("slow"), 200);
        });
      };

      await expect(policy.execute(slowFn, { endpoint: "/api/ticker" })).rejects.toThrow(
        RequestTimeoutError,
      );

      vi.useFakeTimers();
    });

    it("should use custom timeout when provided", async () => {
      // Use real timers for this test
      vi.useRealTimers();

      const policy = createRequestPolicy({
        exchange: "coinbase",
        rateLimits: COINBASE_RATE_LIMITS,
        maxRetries: 0,
        defaultTimeoutMs: 5000, // Long default
        circuitBreakerConfig: {
          failureThreshold: 10,
          successThreshold: 2,
          resetTimeoutMs: 5000,
        },
      });

      const slowFn = async (): Promise<string> => {
        return new Promise((resolve) => {
          setTimeout(() => resolve("slow"), 200);
        });
      };

      await expect(
        policy.execute(slowFn, { endpoint: "/api/ticker", timeoutMs: 50 }),
      ).rejects.toThrow(RequestTimeoutError);

      vi.useFakeTimers();
    });
  });

  describe("retry behavior", () => {
    it("should retry on retryable errors", async () => {
      vi.useRealTimers();

      const policy = createRequestPolicy({
        exchange: "coinbase",
        rateLimits: COINBASE_RATE_LIMITS,
        maxRetries: 2,
        defaultTimeoutMs: 1000,
        backoffConfig: {
          initialDelayMs: 10,
          maxDelayMs: 50,
          multiplier: 2,
          jitterFactor: 0,
        },
        circuitBreakerConfig: {
          failureThreshold: 10,
          successThreshold: 2,
          resetTimeoutMs: 5000,
        },
      });

      let attempts = 0;

      const flakyFn = async (): Promise<string> => {
        attempts++;
        if (attempts < 2) {
          throw { status: 500, message: "Server error" };
        }
        return "success";
      };

      const result = await policy.execute(flakyFn, { endpoint: "/api/ticker" });

      expect(result).toBe("success");
      expect(attempts).toBe(2);

      const metrics = policy.getMetrics();
      expect(metrics.totalRetries).toBe(1);

      vi.useFakeTimers();
    });

    it("should not retry non-retryable errors", async () => {
      const policy = createTestPolicy();
      let attempts = 0;

      const failingFn = async (): Promise<string> => {
        attempts++;
        throw { status: 401, message: "Unauthorized" };
      };

      await expect(policy.execute(failingFn, { endpoint: "/api/ticker" })).rejects.toMatchObject({
        status: 401,
      });

      expect(attempts).toBe(1); // No retry
    });

    it("should throw MaxRetriesExceededError after max retries", async () => {
      vi.useRealTimers();

      const policy = createRequestPolicy({
        exchange: "coinbase",
        rateLimits: COINBASE_RATE_LIMITS,
        maxRetries: 2,
        defaultTimeoutMs: 1000,
        backoffConfig: {
          initialDelayMs: 10, // Very short for test
          maxDelayMs: 50,
          multiplier: 2,
          jitterFactor: 0,
        },
        circuitBreakerConfig: {
          failureThreshold: 10, // High to avoid circuit opening
          successThreshold: 2,
          resetTimeoutMs: 5000,
        },
      });

      const failingFn = async (): Promise<string> => {
        throw { status: 500, message: "Server error" };
      };

      await expect(policy.execute(failingFn, { endpoint: "/api/ticker" })).rejects.toThrow(
        MaxRetriesExceededError,
      );

      const metrics = policy.getMetrics();
      expect(metrics.totalRetries).toBe(2);
      expect(metrics.failedRequests).toBe(1);

      vi.useFakeTimers();
    });

    it("should use Retry-After header when present", async () => {
      vi.useRealTimers();

      const policy = createRequestPolicy({
        exchange: "coinbase",
        rateLimits: COINBASE_RATE_LIMITS,
        maxRetries: 2,
        defaultTimeoutMs: 1000,
        circuitBreakerConfig: {
          failureThreshold: 10,
          successThreshold: 2,
          resetTimeoutMs: 5000,
        },
      });

      let attempts = 0;

      const failingFn = async (): Promise<string> => {
        attempts++;
        if (attempts < 2) {
          throw {
            status: 429,
            message: "Rate limited",
            headers: { "Retry-After": "0" }, // 0 seconds for fast test
          };
        }
        return "success";
      };

      const result = await policy.execute(failingFn, {
        endpoint: "/api/ticker",
      });

      expect(result).toBe("success");
      expect(attempts).toBe(2);

      vi.useFakeTimers();
    });
  });

  describe("circuit breaker integration", () => {
    it("should open circuit after failures", async () => {
      const policy = createRequestPolicy({
        exchange: "coinbase",
        rateLimits: COINBASE_RATE_LIMITS,
        maxRetries: 0,
        defaultTimeoutMs: 1000,
        circuitBreakerConfig: {
          failureThreshold: 2,
          successThreshold: 1,
          resetTimeoutMs: 5000,
        },
      });

      const failingFn = async (): Promise<string> => {
        throw { status: 500, message: "Server error" };
      };

      // First two failures should open circuit
      await expect(policy.execute(failingFn, { endpoint: "/api/ticker" })).rejects.toBeDefined();

      await expect(policy.execute(failingFn, { endpoint: "/api/ticker" })).rejects.toBeDefined();

      // Circuit should be open
      expect(policy.getCircuitState()).toBe("OPEN");
    });

    it("should fail fast when circuit is open", async () => {
      const policy = createRequestPolicy({
        exchange: "coinbase",
        rateLimits: COINBASE_RATE_LIMITS,
        maxRetries: 0,
        defaultTimeoutMs: 1000,
        circuitBreakerConfig: {
          failureThreshold: 2,
          successThreshold: 1,
          resetTimeoutMs: 5000,
        },
      });

      // Open the circuit
      await expect(
        policy.execute(
          async () => {
            throw { status: 500 };
          },
          { endpoint: "/api/ticker" },
        ),
      ).rejects.toBeDefined();

      await expect(
        policy.execute(
          async () => {
            throw { status: 500 };
          },
          { endpoint: "/api/ticker" },
        ),
      ).rejects.toBeDefined();

      // Should fail fast with CircuitOpenError
      await expect(
        policy.execute(async () => "success", { endpoint: "/api/ticker" }),
      ).rejects.toThrow(CircuitOpenError);
    });

    it("should skip circuit breaker when flag is set", async () => {
      const policy = createRequestPolicy({
        exchange: "coinbase",
        rateLimits: COINBASE_RATE_LIMITS,
        maxRetries: 0,
        defaultTimeoutMs: 1000,
        circuitBreakerConfig: {
          failureThreshold: 1,
          successThreshold: 1,
          resetTimeoutMs: 5000,
        },
      });

      // Open the circuit
      await expect(
        policy.execute(
          async () => {
            throw { status: 500 };
          },
          { endpoint: "/api/ticker" },
        ),
      ).rejects.toBeDefined();

      // Should succeed with skipCircuitBreaker
      const result = await policy.execute(async () => "success", {
        endpoint: "/api/ticker",
        skipCircuitBreaker: true,
      });

      expect(result).toBe("success");
    });
  });

  describe("metrics", () => {
    it("should track all metrics correctly", async () => {
      const policy = createTestPolicy();

      await policy.execute(async () => "success", { endpoint: "/api/ticker" });

      const metrics = policy.getMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.successfulRequests).toBe(1);
    });

    it("should reset metrics", async () => {
      const policy = createTestPolicy();

      await policy.execute(async () => "success", { endpoint: "/api/ticker" });

      policy.resetMetrics();

      const metrics = policy.getMetrics();
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.successfulRequests).toBe(0);
    });
  });

  describe("custom retry check", () => {
    it("should use custom retryable function", async () => {
      vi.useRealTimers();

      const policy = createRequestPolicy({
        exchange: "coinbase",
        rateLimits: COINBASE_RATE_LIMITS,
        maxRetries: 2,
        defaultTimeoutMs: 1000,
        backoffConfig: {
          initialDelayMs: 10,
          maxDelayMs: 50,
          multiplier: 2,
          jitterFactor: 0,
        },
        circuitBreakerConfig: {
          failureThreshold: 10,
          successThreshold: 2,
          resetTimeoutMs: 5000,
        },
      });

      let attempts = 0;

      const failingFn = async (): Promise<string> => {
        attempts++;
        throw { status: 418, message: "I'm a teapot" };
      };

      // Custom function that says 418 is retryable
      const customRetryable = (error: unknown): boolean => {
        if (error !== null && typeof error === "object" && "status" in error) {
          return (error.status as number) === 418;
        }
        return false;
      };

      await expect(
        policy.execute(failingFn, {
          endpoint: "/api/ticker",
          retryable: customRetryable,
          maxRetries: 2,
        }),
      ).rejects.toThrow(MaxRetriesExceededError);

      expect(attempts).toBe(3); // Initial + 2 retries

      vi.useFakeTimers();
    });
  });
});

describe("error classes", () => {
  describe("RequestTimeoutError", () => {
    it("should have correct properties", () => {
      const error = new RequestTimeoutError("Timed out", 5000);
      expect(error.name).toBe("RequestTimeoutError");
      expect(error.message).toBe("Timed out");
      expect(error.timeoutMs).toBe(5000);
    });
  });

  describe("MaxRetriesExceededError", () => {
    it("should have correct properties", () => {
      const lastError = new Error("Last error");
      const error = new MaxRetriesExceededError("Max retries", 3, lastError);
      expect(error.name).toBe("MaxRetriesExceededError");
      expect(error.message).toBe("Max retries");
      expect(error.attempts).toBe(3);
      expect(error.lastError).toBe(lastError);
    });
  });
});
