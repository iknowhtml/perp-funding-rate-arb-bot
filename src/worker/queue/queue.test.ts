import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSerialQueue } from "./queue";

describe("createSerialQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("enqueue", () => {
    it("should execute jobs serially (one at a time)", async () => {
      const queue = createSerialQueue();
      const executionOrder: number[] = [];
      let resolveFirst: (() => void) | undefined;

      const job1 = queue.enqueue(async () => {
        executionOrder.push(1);
        return new Promise<void>((resolve) => {
          resolveFirst = resolve;
        });
      });

      const job2 = queue.enqueue(async () => {
        executionOrder.push(2);
        return Promise.resolve();
      });

      // First job should start immediately
      await vi.advanceTimersByTimeAsync(1);
      expect(executionOrder).toEqual([1]);
      expect(job1.getStatus()).toBe("running");
      expect(job2.getStatus()).toBe("pending");

      // Second job should not start until first completes
      await vi.advanceTimersByTimeAsync(100);
      expect(executionOrder).toEqual([1]);

      // Complete first job
      resolveFirst!();
      await vi.advanceTimersByTimeAsync(1);

      // Now second job should execute
      await vi.advanceTimersByTimeAsync(1);
      expect(executionOrder).toEqual([1, 2]);
      expect(job2.getStatus()).toBe("completed");
    });

    it("should execute jobs in FIFO order", async () => {
      const queue = createSerialQueue();
      const executionOrder: string[] = [];

      const job1 = queue.enqueue(async () => {
        executionOrder.push("job1");
        return Promise.resolve("result1");
      }, "job1");

      const job2 = queue.enqueue(async () => {
        executionOrder.push("job2");
        return Promise.resolve("result2");
      }, "job2");

      const job3 = queue.enqueue(async () => {
        executionOrder.push("job3");
        return Promise.resolve("result3");
      }, "job3");

      // Wait for all jobs to complete
      await job1.promise;
      await job2.promise;
      await job3.promise;

      expect(executionOrder).toEqual(["job1", "job2", "job3"]);
    });

    it("should return job handle with id, promise, cancel, and getStatus", () => {
      const queue = createSerialQueue();
      const job = queue.enqueue(async () => Promise.resolve("result"));

      expect(job.id).toBeDefined();
      expect(job.promise).toBeInstanceOf(Promise);
      expect(typeof job.cancel).toBe("function");
      expect(typeof job.getStatus).toBe("function");
    });

    it("should use provided id or generate one", () => {
      const queue = createSerialQueue();
      const jobWithId = queue.enqueue(async () => Promise.resolve(), "custom-id");
      const jobWithoutId = queue.enqueue(async () => Promise.resolve());

      expect(jobWithId.id).toBe("custom-id");
      expect(jobWithoutId.id).toBeDefined();
      expect(jobWithoutId.id).not.toBe("custom-id");
    });

    it("should return job result", async () => {
      const queue = createSerialQueue();
      const job = queue.enqueue(async () => Promise.resolve("test-result"));

      const result = await job.promise;
      expect(result).toBe("test-result");
    });
  });

  describe("job status tracking", () => {
    it("should track status transitions correctly", async () => {
      const queue = createSerialQueue();
      let resolveJob: () => void;

      const job = queue.enqueue(async () => {
        return new Promise<void>((resolve) => {
          resolveJob = resolve;
        });
      }, "test-job");

      // Status may be pending or running depending on when p-queue starts execution
      const initialStatus = job.getStatus();
      expect(["pending", "running"]).toContain(initialStatus);

      // Ensure job starts running
      await vi.advanceTimersByTimeAsync(10);
      expect(job.getStatus()).toBe("running");
      expect(queue.getStatus("test-job")).toBe("running");

      // Complete job
      resolveJob!();
      await vi.advanceTimersByTimeAsync(1);
      await job.promise;

      expect(job.getStatus()).toBe("completed");
      expect(queue.getStatus("test-job")).toBe("completed");
    });

    it("should track failed status", async () => {
      const queue = createSerialQueue();
      const error = new Error("Job failed");

      const job = queue.enqueue(async () => {
        throw error;
      }, "failing-job");

      await expect(job.promise).rejects.toThrow("Job failed");
      expect(job.getStatus()).toBe("failed");
      expect(queue.getStatus("failing-job")).toBe("failed");
    });

    it("should return null for unknown job id", () => {
      const queue = createSerialQueue();
      expect(queue.getStatus("unknown-job")).toBeNull();
    });
  });

  describe("cancellation", () => {
    it("should cancel pending jobs", async () => {
      const queue = createSerialQueue();
      let resolveFirst: () => void;

      const _job1 = queue.enqueue(async () => {
        return new Promise<void>((resolve) => {
          resolveFirst = resolve;
        });
      }, "job1");

      const job2 = queue.enqueue(async () => {
        return Promise.resolve();
      }, "job2");

      // Attach rejection handler BEFORE cancelling to prevent unhandled rejection
      const job2Rejection = job2.promise.catch(() => "rejected");

      // Start first job
      await vi.advanceTimersByTimeAsync(1);
      expect(job2.getStatus()).toBe("pending");

      // Cancel pending job
      job2.cancel();
      expect(job2.getStatus()).toBe("cancelled");

      // Complete first job
      resolveFirst!();
      await vi.advanceTimersByTimeAsync(1);

      // Second job should not execute
      await vi.advanceTimersByTimeAsync(100);
      expect(job2.getStatus()).toBe("cancelled");
      // Verify rejection was handled
      expect(await job2Rejection).toBe("rejected");
    });

    it("should cancel running jobs with AbortSignal", async () => {
      const queue = createSerialQueue();
      let signalReceived: AbortSignal | undefined;

      const job = queue.enqueue(async (signal) => {
        signalReceived = signal;
        // Simulate long-running task that checks signal
        return new Promise<string>((_resolve, reject) => {
          const checkSignal = setInterval(() => {
            if (signal.aborted) {
              clearInterval(checkSignal);
              reject(new Error("Job cancelled"));
            }
          }, 10);
        });
      }, "running-job");

      // Attach rejection handler BEFORE cancelling to prevent unhandled rejection
      const jobRejection = job.promise.catch(() => "rejected");

      // Start execution
      await vi.advanceTimersByTimeAsync(1);
      expect(job.getStatus()).toBe("running");
      expect(signalReceived).toBeDefined();

      // Cancel running job
      job.cancel();
      await vi.advanceTimersByTimeAsync(20);

      expect(job.getStatus()).toBe("cancelled");
      // Verify rejection was handled
      expect(await jobRejection).toBe("rejected");
    });

    it("should not affect completed jobs when cancelling", async () => {
      const queue = createSerialQueue();
      const job = queue.enqueue(async () => Promise.resolve("done"), "completed-job");

      await job.promise;
      expect(job.getStatus()).toBe("completed");

      job.cancel();
      expect(job.getStatus()).toBe("completed");
    });

    it("should cancel all jobs", async () => {
      const queue = createSerialQueue();
      let resolve1: (() => void) | undefined;

      // First job blocks, keeping job2 and job3 pending
      const job1 = queue.enqueue(async () => {
        return new Promise<void>((resolve) => {
          resolve1 = resolve;
        });
      }, "job1");
      const job2 = queue.enqueue(async () => Promise.resolve(), "job2");
      const job3 = queue.enqueue(async () => Promise.resolve(), "job3");

      // Attach rejection handlers BEFORE cancelling to prevent unhandled rejections
      void job1.promise.catch(() => {
        // Expected rejection
      });
      void job2.promise.catch(() => {
        // Expected rejection
      });
      void job3.promise.catch(() => {
        // Expected rejection
      });

      // Let job1 start running
      await vi.advanceTimersByTimeAsync(1);
      expect(job1.getStatus()).toBe("running");
      expect(job2.getStatus()).toBe("pending");
      expect(job3.getStatus()).toBe("pending");

      // Cancel all jobs
      queue.cancelAll();

      expect(job1.getStatus()).toBe("cancelled");
      expect(job2.getStatus()).toBe("cancelled");
      expect(job3.getStatus()).toBe("cancelled");

      // Cleanup: resolve1 exists but job is already cancelled
      resolve1?.();
    });
  });

  describe("getPendingCount", () => {
    it("should return correct pending count", async () => {
      const queue = createSerialQueue();
      let resolveFirst: () => void;

      const job1 = queue.enqueue(async () => {
        return new Promise<void>((resolve) => {
          resolveFirst = resolve;
        });
      });

      const _job2 = queue.enqueue(async () => Promise.resolve());
      const _job3 = queue.enqueue(async () => Promise.resolve());

      // Start first job
      await vi.advanceTimersByTimeAsync(1);
      expect(queue.getPendingCount()).toBeGreaterThanOrEqual(2); // job2 and job3 pending

      // Complete first job
      resolveFirst!();
      await vi.advanceTimersByTimeAsync(1);
      await job1.promise;

      // Should process remaining jobs
      await vi.advanceTimersByTimeAsync(10);
      expect(queue.getPendingCount()).toBe(0);
    });

    it("should return 0 when queue is empty", () => {
      const queue = createSerialQueue();
      expect(queue.getPendingCount()).toBe(0);
    });
  });

  describe("waitForIdle", () => {
    it("should wait for all jobs to complete", async () => {
      const queue = createSerialQueue();
      let resolveJob: () => void;

      const _job = queue.enqueue(async () => {
        return new Promise<void>((resolve) => {
          resolveJob = resolve;
        });
      });

      // Start job
      await vi.advanceTimersByTimeAsync(1);

      // waitForIdle should not complete yet
      const waitPromise = queue.waitForIdle();
      let waitCompleted = false;
      void waitPromise.then(() => {
        waitCompleted = true;
      });

      await vi.advanceTimersByTimeAsync(100);
      expect(waitCompleted).toBe(false);

      // Complete job
      resolveJob!();
      await vi.advanceTimersByTimeAsync(1);
      await waitPromise;

      expect(waitCompleted).toBe(true);
    });

    it("should complete immediately when queue is idle", async () => {
      const queue = createSerialQueue();
      await queue.waitForIdle();
      // Should complete without waiting
    });

    it("should wait for multiple jobs", async () => {
      // Use real timers for this test since p-queue's onIdle uses real promises
      vi.useRealTimers();

      try {
        const queue = createSerialQueue();
        const resolvers: Array<() => void> = [];

        // Enqueue jobs
        for (let i = 0; i < 3; i++) {
          queue.enqueue(async () => {
            return new Promise<void>((resolve) => {
              resolvers.push(resolve);
            });
          });
        }

        // Wait for first job to start executing
        await new Promise((resolve) => {
          setTimeout(resolve, 50);
        });

        // Resolve jobs one by one (they execute serially)
        if (resolvers.length > 0) {
          resolvers[0](); // Resolve first job
          await new Promise((resolve) => {
            setTimeout(resolve, 50);
          });
        }

        if (resolvers.length > 1) {
          resolvers[1](); // Resolve second job
          await new Promise((resolve) => {
            setTimeout(resolve, 50);
          });
        }

        if (resolvers.length > 2) {
          resolvers[2](); // Resolve third job
        }

        // Wait for idle with timeout
        await Promise.race([
          queue.waitForIdle(),
          new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error("waitForIdle timed out"));
            }, 2000);
          }),
        ]);

        // Verify all jobs completed
        expect(queue.getPendingCount()).toBe(0);
      } finally {
        vi.useFakeTimers();
      }
    }, 10000);
  });

  describe("error handling", () => {
    it("should handle errors gracefully", async () => {
      const queue = createSerialQueue();
      const error = new Error("Task error");

      const job = queue.enqueue(async () => {
        throw error;
      }, "error-job");

      await expect(job.promise).rejects.toThrow("Task error");
      expect(job.getStatus()).toBe("failed");
    });

    it("should continue processing after error", async () => {
      const queue = createSerialQueue();
      const executionOrder: string[] = [];

      const job1 = queue.enqueue(async () => {
        executionOrder.push("job1");
        throw new Error("Job1 failed");
      }, "job1");

      const job2 = queue.enqueue(async () => {
        executionOrder.push("job2");
        return Promise.resolve();
      }, "job2");

      await expect(job1.promise).rejects.toThrow();
      await job2.promise;

      expect(executionOrder).toEqual(["job1", "job2"]);
      expect(job2.getStatus()).toBe("completed");
    });

    it("should handle non-Error exceptions", async () => {
      const queue = createSerialQueue();
      const job = queue.enqueue(async () => {
        throw "String error";
      });

      await expect(job.promise).rejects.toBe("String error");
      expect(job.getStatus()).toBe("failed");
    });
  });

  describe("AbortSignal integration", () => {
    it("should provide AbortSignal to job function", async () => {
      const queue = createSerialQueue();
      let receivedSignal: AbortSignal | undefined;

      const job = queue.enqueue(async (signal) => {
        receivedSignal = signal;
        return Promise.resolve();
      });

      await job.promise;
      expect(receivedSignal).toBeDefined();
      expect(receivedSignal?.aborted).toBe(false);
    });

    it("should mark signal as aborted when job is cancelled", async () => {
      const queue = createSerialQueue();
      let receivedSignal: AbortSignal | undefined;

      const job = queue.enqueue(async (signal) => {
        receivedSignal = signal;
        return new Promise<void>(() => {
          // Never resolves
        });
      });

      // Attach rejection handler BEFORE cancelling to prevent unhandled rejection
      const jobRejection = job.promise.catch(() => "rejected");

      await vi.advanceTimersByTimeAsync(1);
      expect(receivedSignal).toBeDefined();
      expect(receivedSignal?.aborted).toBe(false);

      job.cancel();
      await vi.advanceTimersByTimeAsync(1);
      expect(receivedSignal?.aborted).toBe(true);

      // Verify rejection was handled
      expect(await jobRejection).toBe("rejected");
    });
  });
});
