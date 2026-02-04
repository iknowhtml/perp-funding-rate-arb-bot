import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CircuitOpenError, createCircuitBreaker } from "./circuit-breaker";

describe("createCircuitBreaker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("initial state", () => {
    it("should start in CLOSED state", () => {
      const breaker = createCircuitBreaker();
      expect(breaker.getState()).toBe("CLOSED");
      expect(breaker.isOpen()).toBe(false);
    });
  });

  describe("execute", () => {
    it("should execute successful functions", async () => {
      const breaker = createCircuitBreaker();
      const result = await breaker.execute(async () => "success");
      expect(result).toBe("success");
    });

    it("should propagate errors from executed function", async () => {
      const breaker = createCircuitBreaker();
      await expect(
        breaker.execute(async () => {
          throw new Error("test error");
        }),
      ).rejects.toThrow("test error");
    });
  });

  describe("circuit opening", () => {
    it("should open after consecutive failures", async () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 3,
        successThreshold: 2,
        resetTimeoutMs: 30000,
      });

      const failingFn = async (): Promise<string> => {
        throw new Error("failure");
      };

      // First 3 failures should open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failingFn)).rejects.toThrow("failure");
      }

      // Next call should fail with CircuitOpenError
      await expect(breaker.execute(failingFn)).rejects.toThrow(CircuitOpenError);
      expect(breaker.getState()).toBe("OPEN");
      expect(breaker.isOpen()).toBe(true);
    });

    it("should not open before threshold", async () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 5,
        successThreshold: 2,
        resetTimeoutMs: 30000,
      });

      const failingFn = async (): Promise<string> => {
        throw new Error("failure");
      };

      // 4 failures should not open
      for (let i = 0; i < 4; i++) {
        await expect(breaker.execute(failingFn)).rejects.toThrow("failure");
      }

      expect(breaker.getState()).toBe("CLOSED");
    });

    it("should reset failure count on success", async () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 3,
        successThreshold: 2,
        resetTimeoutMs: 30000,
      });

      let shouldFail = true;

      const fn = async (): Promise<string> => {
        if (shouldFail) {
          throw new Error("failure");
        }
        return "success";
      };

      // 2 failures
      await expect(breaker.execute(fn)).rejects.toThrow("failure");
      await expect(breaker.execute(fn)).rejects.toThrow("failure");

      // 1 success should reset
      shouldFail = false;
      await breaker.execute(fn);

      // 2 more failures should not open (need 3 consecutive)
      shouldFail = true;
      await expect(breaker.execute(fn)).rejects.toThrow("failure");
      await expect(breaker.execute(fn)).rejects.toThrow("failure");

      expect(breaker.getState()).toBe("CLOSED");
    });
  });

  describe("circuit recovery", () => {
    it("should transition to HALF_OPEN after resetTimeout", async () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 2,
        successThreshold: 2,
        resetTimeoutMs: 30000,
      });

      const failingFn = async (): Promise<string> => {
        throw new Error("failure");
      };

      // Open the circuit
      await expect(breaker.execute(failingFn)).rejects.toThrow("failure");
      await expect(breaker.execute(failingFn)).rejects.toThrow("failure");
      await expect(breaker.execute(failingFn)).rejects.toThrow(CircuitOpenError);

      expect(breaker.getState()).toBe("OPEN");

      // Wait for reset timeout
      await vi.advanceTimersByTimeAsync(30000);

      // Should be in HALF_OPEN now (will transition on next call)
      // Note: cockatiel transitions to HALF_OPEN lazily
      const result = await breaker.execute(async () => "success");
      expect(result).toBe("success");
    });

    it("should close after successes in HALF_OPEN", async () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 2,
        successThreshold: 2,
        resetTimeoutMs: 1000,
      });

      // Open circuit
      for (let i = 0; i < 2; i++) {
        await expect(
          breaker.execute(async () => {
            throw new Error("failure");
          }),
        ).rejects.toThrow("failure");
      }

      // Wait for HALF_OPEN
      await vi.advanceTimersByTimeAsync(1000);

      // Successes should close
      await breaker.execute(async () => "success");
      await breaker.execute(async () => "success");

      expect(breaker.getState()).toBe("CLOSED");
    });

    it("should return to OPEN on failure in HALF_OPEN", async () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 2,
        successThreshold: 2,
        resetTimeoutMs: 1000,
      });

      // Open circuit
      for (let i = 0; i < 2; i++) {
        await expect(
          breaker.execute(async () => {
            throw new Error("failure");
          }),
        ).rejects.toThrow("failure");
      }

      // Wait for HALF_OPEN
      await vi.advanceTimersByTimeAsync(1000);

      // Failure should return to OPEN
      await expect(
        breaker.execute(async () => {
          throw new Error("failure");
        }),
      ).rejects.toThrow("failure");

      // Circuit should be open again
      await expect(breaker.execute(async () => "success")).rejects.toThrow(CircuitOpenError);
    });
  });

  describe("state change events", () => {
    it("should notify on state changes", async () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 2,
        successThreshold: 1,
        resetTimeoutMs: 1000,
      });

      const stateChanges: string[] = [];
      breaker.onStateChange((state) => {
        stateChanges.push(state);
      });

      // Open the circuit
      await expect(
        breaker.execute(async () => {
          throw new Error("failure");
        }),
      ).rejects.toThrow("failure");
      await expect(
        breaker.execute(async () => {
          throw new Error("failure");
        }),
      ).rejects.toThrow("failure");

      expect(stateChanges).toContain("OPEN");
    });

    it("should allow unsubscribing", async () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 2,
        successThreshold: 1,
        resetTimeoutMs: 1000,
      });

      const stateChanges: string[] = [];
      const unsubscribe = breaker.onStateChange((state) => {
        stateChanges.push(state);
      });

      // Unsubscribe
      unsubscribe();

      // Open the circuit
      await expect(
        breaker.execute(async () => {
          throw new Error("failure");
        }),
      ).rejects.toThrow("failure");
      await expect(
        breaker.execute(async () => {
          throw new Error("failure");
        }),
      ).rejects.toThrow("failure");

      // Should not have recorded state changes
      expect(stateChanges).toHaveLength(0);
    });
  });

  describe("CircuitOpenError", () => {
    it("should have correct name and message", () => {
      const error = new CircuitOpenError("Custom message");
      expect(error.name).toBe("CircuitOpenError");
      expect(error.message).toBe("Custom message");
    });

    it("should use default message", () => {
      const error = new CircuitOpenError();
      expect(error.message).toBe("Circuit breaker is open");
    });
  });
});
