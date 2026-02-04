import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { type ScheduledTask, createScheduler } from "./scheduler";

describe("createScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("schedule", () => {
    it("should execute task immediately and then at intervals", async () => {
      const scheduler = createScheduler();
      const taskFn = vi.fn().mockResolvedValue(undefined);

      const task: ScheduledTask = {
        id: "test-task",
        fn: taskFn,
        intervalMs: 1000,
        enabled: true,
      };

      const handle = scheduler.schedule(task);

      // Should execute immediately (advance just a bit to trigger immediate execution)
      await vi.advanceTimersByTimeAsync(1);
      expect(taskFn).toHaveBeenCalledTimes(1);

      // Advance time by 1 second
      await vi.advanceTimersByTimeAsync(1000);
      expect(taskFn).toHaveBeenCalledTimes(2);

      // Advance time by another second
      await vi.advanceTimersByTimeAsync(1000);
      expect(taskFn).toHaveBeenCalledTimes(3);

      handle.cancel();
    });

    it("should not execute disabled tasks", async () => {
      const scheduler = createScheduler();
      const taskFn = vi.fn().mockResolvedValue(undefined);

      const task: ScheduledTask = {
        id: "disabled-task",
        fn: taskFn,
        intervalMs: 1000,
        enabled: false,
      };

      const handle = scheduler.schedule(task);

      // Advance time - task should not execute
      await vi.advanceTimersByTimeAsync(5000);
      expect(taskFn).not.toHaveBeenCalled();
      expect(handle.isRunning()).toBe(false);

      handle.cancel();
    });

    it("should prevent concurrent execution of the same task", async () => {
      const scheduler = createScheduler();
      let executionCount = 0;
      let resolveFirst: (() => void) | undefined;

      // Task that completes when resolved
      const taskFn = vi.fn().mockImplementation(async () => {
        executionCount++;
        return new Promise<void>((resolve) => {
          resolveFirst = resolve;
        });
      });

      const task: ScheduledTask = {
        id: "concurrent-task",
        fn: taskFn,
        intervalMs: 200, // Schedule every 200ms
        enabled: true,
      };

      const handle = scheduler.schedule(task);

      // Start first execution
      await vi.advanceTimersByTimeAsync(1);
      expect(executionCount).toBe(1);
      expect(handle.isRunning()).toBe(true);

      // Advance time by 200ms - should trigger second attempt but skip due to concurrency guard
      await vi.advanceTimersByTimeAsync(200);
      expect(executionCount).toBe(1); // Still 1, second was skipped

      // Advance time by another 200ms - should trigger third attempt but skip
      await vi.advanceTimersByTimeAsync(200);
      expect(executionCount).toBe(1); // Still 1, third was skipped

      // Complete first execution
      resolveFirst!();
      // Advance enough for the promise to resolve and runningTasks to be cleared
      await vi.advanceTimersByTimeAsync(1);
      expect(handle.isRunning()).toBe(false);

      // Now second execution can start
      await vi.advanceTimersByTimeAsync(200);
      expect(executionCount).toBe(2);

      handle.cancel();
    });

    it("should track running state correctly", async () => {
      const scheduler = createScheduler();
      let resolveTask: () => void;

      const taskFn = vi.fn().mockImplementation(() => {
        return new Promise<void>((resolve) => {
          resolveTask = resolve;
        });
      });

      const task: ScheduledTask = {
        id: "running-state-task",
        fn: taskFn,
        intervalMs: 1000,
        enabled: true,
      };

      const handle = scheduler.schedule(task);

      // Start execution
      await vi.advanceTimersByTimeAsync(1);

      // Should be running
      expect(handle.isRunning()).toBe(true);

      // Complete the task
      resolveTask!();
      await vi.advanceTimersByTimeAsync(1);

      // Should not be running anymore
      expect(handle.isRunning()).toBe(false);

      handle.cancel();
    });
  });

  describe("retry logic", () => {
    it("should retry failed tasks with exponential backoff", async () => {
      const scheduler = createScheduler();
      let attemptCount = 0;

      const taskFn = vi.fn().mockImplementation(async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error(`Attempt ${attemptCount} failed`);
        }
        // Succeed on third attempt
      });

      const task: ScheduledTask = {
        id: "retry-task",
        fn: taskFn,
        intervalMs: 10000, // Long interval so we can test retry logic
        enabled: true,
      };

      const handle = scheduler.schedule(task);

      // Execute immediately - will fail and retry
      await vi.advanceTimersByTimeAsync(1);
      expect(attemptCount).toBe(1);

      // First retry after 1000ms
      await vi.advanceTimersByTimeAsync(1000);
      expect(attemptCount).toBe(2);

      // Second retry after 2000ms more
      await vi.advanceTimersByTimeAsync(2000);
      expect(attemptCount).toBe(3);

      // Should have retried 3 times total (initial + 2 retries)
      expect(taskFn).toHaveBeenCalledTimes(3);

      handle.cancel();
    });

    it("should log error after all retries exhausted", async () => {
      const { logger } = await import("@/lib/logger");
      const scheduler = createScheduler();

      const taskFn = vi.fn().mockRejectedValue(new Error("Always fails"));

      const task: ScheduledTask = {
        id: "failing-task",
        fn: taskFn,
        intervalMs: 10000,
        enabled: true,
      };

      const handle = scheduler.schedule(task);

      // Execute immediately - will fail
      await vi.advanceTimersByTimeAsync(1);
      expect(taskFn).toHaveBeenCalledTimes(1);

      // First retry after 1000ms
      await vi.advanceTimersByTimeAsync(1000);
      expect(taskFn).toHaveBeenCalledTimes(2);

      // Second retry after 2000ms more
      await vi.advanceTimersByTimeAsync(2000);
      expect(taskFn).toHaveBeenCalledTimes(3);

      // Third retry after 4000ms more
      await vi.advanceTimersByTimeAsync(4000);
      expect(taskFn).toHaveBeenCalledTimes(4);

      // Should have attempted 4 times (initial + 3 retries)
      expect(logger.error).toHaveBeenCalledWith(
        "Task failing-task failed after retries",
        expect.any(Error),
      );

      handle.cancel();
    });

    it("should use exponential backoff for retry delays", async () => {
      const scheduler = createScheduler();
      const callTimes: number[] = [];

      const taskFn = vi.fn().mockImplementation(async () => {
        callTimes.push(Date.now());
        throw new Error("Fail");
      });

      const task: ScheduledTask = {
        id: "backoff-task",
        fn: taskFn,
        intervalMs: 10000,
        enabled: true,
      };

      const handle = scheduler.schedule(task);

      // Execute immediately
      await vi.advanceTimersByTimeAsync(1);
      expect(callTimes.length).toBe(1);

      // First retry after 1000ms
      await vi.advanceTimersByTimeAsync(1000);
      expect(callTimes.length).toBe(2);

      // Second retry after 2000ms more
      await vi.advanceTimersByTimeAsync(2000);
      expect(callTimes.length).toBe(3);

      // Third retry after 4000ms more
      await vi.advanceTimersByTimeAsync(4000);
      expect(callTimes.length).toBe(4);

      // Check that delays increase exponentially
      const delay1 = callTimes[1] - callTimes[0];
      const delay2 = callTimes[2] - callTimes[1];
      const delay3 = callTimes[3] - callTimes[2];

      // Allow some tolerance for timing
      expect(delay1).toBeGreaterThanOrEqual(900);
      expect(delay1).toBeLessThanOrEqual(1100);
      expect(delay2).toBeGreaterThanOrEqual(1900);
      expect(delay2).toBeLessThanOrEqual(2100);
      expect(delay3).toBeGreaterThanOrEqual(3900);
      expect(delay3).toBeLessThanOrEqual(4100);

      handle.cancel();
    });
  });

  describe("cancel", () => {
    it("should cancel individual task", async () => {
      const scheduler = createScheduler();
      const taskFn = vi.fn().mockResolvedValue(undefined);

      const task: ScheduledTask = {
        id: "cancelable-task",
        fn: taskFn,
        intervalMs: 1000,
        enabled: true,
      };

      const handle = scheduler.schedule(task);

      // Execute immediately
      await vi.advanceTimersByTimeAsync(1);
      expect(taskFn).toHaveBeenCalledTimes(1);

      // Cancel the task
      handle.cancel();

      // Advance time - task should not execute anymore
      await vi.advanceTimersByTimeAsync(5000);
      expect(taskFn).toHaveBeenCalledTimes(1);
    });

    it("should allow cancelling disabled tasks", () => {
      const scheduler = createScheduler();
      const taskFn = vi.fn().mockResolvedValue(undefined);

      const task: ScheduledTask = {
        id: "disabled-cancel-task",
        fn: taskFn,
        intervalMs: 1000,
        enabled: false,
      };

      const handle = scheduler.schedule(task);

      // Should not throw
      expect(() => {
        handle.cancel();
      }).not.toThrow();
    });
  });

  describe("cancelAll", () => {
    it("should cancel all scheduled tasks", async () => {
      const scheduler = createScheduler();
      const task1Fn = vi.fn().mockResolvedValue(undefined);
      const task2Fn = vi.fn().mockResolvedValue(undefined);

      const task1: ScheduledTask = {
        id: "task-1",
        fn: task1Fn,
        intervalMs: 1000,
        enabled: true,
      };

      const task2: ScheduledTask = {
        id: "task-2",
        fn: task2Fn,
        intervalMs: 2000,
        enabled: true,
      };

      scheduler.schedule(task1);
      scheduler.schedule(task2);

      // Execute immediately
      await vi.advanceTimersByTimeAsync(1);
      expect(task1Fn).toHaveBeenCalledTimes(1);
      expect(task2Fn).toHaveBeenCalledTimes(1);

      // Cancel all
      scheduler.cancelAll();

      // Advance time - tasks should not execute anymore
      await vi.advanceTimersByTimeAsync(5000);
      expect(task1Fn).toHaveBeenCalledTimes(1);
      expect(task2Fn).toHaveBeenCalledTimes(1);
    });

    it("should handle cancelAll when no tasks are scheduled", () => {
      const scheduler = createScheduler();

      // Should not throw
      expect(() => {
        scheduler.cancelAll();
      }).not.toThrow();
    });
  });

  describe("waitForRunning", () => {
    it("should wait for running tasks to complete", async () => {
      const scheduler = createScheduler();
      let resolveTask: () => void;

      const taskFn = vi.fn().mockImplementation(() => {
        return new Promise<void>((resolve) => {
          resolveTask = resolve;
        });
      });

      const task: ScheduledTask = {
        id: "wait-task",
        fn: taskFn,
        intervalMs: 10000,
        enabled: true,
      };

      const handle = scheduler.schedule(task);

      // Start execution
      await vi.advanceTimersByTimeAsync(1);

      // Start waiting (should not complete yet)
      const waitPromise = scheduler.waitForRunning(5000);
      let waitCompleted = false;
      void waitPromise.then(() => {
        waitCompleted = true;
      });

      // Advance time but task still running (waitForRunning polls every 100ms)
      await vi.advanceTimersByTimeAsync(100);
      expect(waitCompleted).toBe(false);

      // Complete the task
      resolveTask!();
      await vi.advanceTimersByTimeAsync(200); // Advance enough for waitForRunning to detect completion

      // Wait should complete now
      await waitPromise;
      expect(waitCompleted).toBe(true);

      handle.cancel();
    });

    it("should timeout if tasks take too long", async () => {
      const { logger } = await import("@/lib/logger");
      const scheduler = createScheduler();

      // Task that never completes
      const taskFn = vi.fn().mockImplementation(() => {
        return new Promise<void>(() => {
          // Never resolves
        });
      });

      const task: ScheduledTask = {
        id: "long-task",
        fn: taskFn,
        intervalMs: 10000,
        enabled: true,
      };

      const handle = scheduler.schedule(task);

      // Start execution
      void vi.runAllTimersAsync();

      // Wait with short timeout
      await scheduler.waitForRunning(1000);

      // Should have logged warning
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Some tasks did not complete within timeout"),
      );

      handle.cancel();
    });

    it("should handle waitForRunning when no tasks are running", async () => {
      const scheduler = createScheduler();

      // Should complete immediately
      await scheduler.waitForRunning(5000);
    });
  });

  describe("error handling", () => {
    it("should catch and log errors without crashing", async () => {
      const { logger } = await import("@/lib/logger");
      const scheduler = createScheduler();

      const error = new Error("Task error");
      const taskFn = vi.fn().mockRejectedValue(error);

      const task: ScheduledTask = {
        id: "error-task",
        fn: taskFn,
        intervalMs: 1000,
        enabled: true,
      };

      const handle = scheduler.schedule(task);

      // Execute immediately - will fail and retry
      await vi.advanceTimersByTimeAsync(1);
      expect(taskFn).toHaveBeenCalledTimes(1);

      // Advance through retries
      await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000);

      // Should have logged error after retries
      expect(logger.error).toHaveBeenCalled();

      // Task should continue to be scheduled (next interval execution)
      await vi.advanceTimersByTimeAsync(1000);
      expect(taskFn).toHaveBeenCalledTimes(5); // 4 retries + 1 new interval execution

      handle.cancel();
    });

    it("should handle non-Error exceptions", async () => {
      const scheduler = createScheduler();

      const taskFn = vi.fn().mockRejectedValue("String error");

      const task: ScheduledTask = {
        id: "string-error-task",
        fn: taskFn,
        intervalMs: 10000,
        enabled: true,
      };

      const handle = scheduler.schedule(task);

      // Should not throw - advance through retries
      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000);

      handle.cancel();
    });
  });

  describe("multiple tasks", () => {
    it("should handle multiple independent tasks", async () => {
      const scheduler = createScheduler();
      const task1Fn = vi.fn().mockResolvedValue(undefined);
      const task2Fn = vi.fn().mockResolvedValue(undefined);

      const task1: ScheduledTask = {
        id: "multi-task-1",
        fn: task1Fn,
        intervalMs: 1000,
        enabled: true,
      };

      const task2: ScheduledTask = {
        id: "multi-task-2",
        fn: task2Fn,
        intervalMs: 2000,
        enabled: true,
      };

      const handle1 = scheduler.schedule(task1);
      const handle2 = scheduler.schedule(task2);

      // Execute immediately
      await vi.advanceTimersByTimeAsync(1);
      expect(task1Fn).toHaveBeenCalledTimes(1);
      expect(task2Fn).toHaveBeenCalledTimes(1);

      // Advance 1 second - only task1 should execute
      await vi.advanceTimersByTimeAsync(1000);
      expect(task1Fn).toHaveBeenCalledTimes(2);
      expect(task2Fn).toHaveBeenCalledTimes(1);

      // Advance another second - both should execute
      await vi.advanceTimersByTimeAsync(1000);
      expect(task1Fn).toHaveBeenCalledTimes(3);
      expect(task2Fn).toHaveBeenCalledTimes(2);

      handle1.cancel();
      handle2.cancel();
    });
  });
});
