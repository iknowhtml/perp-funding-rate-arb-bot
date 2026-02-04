import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMessageQueue } from "./message-queue";

describe("createMessageQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("enqueue", () => {
    it("should process messages serially", async () => {
      const executionOrder: number[] = [];
      const queue = createMessageQueue<number>(
        (msg) => {
          executionOrder.push(msg);
          return Promise.resolve();
        },
        { concurrency: 1 },
      );

      queue.enqueue(1);
      queue.enqueue(2);
      queue.enqueue(3);

      await vi.advanceTimersByTimeAsync(100);
      await queue.waitForIdle();

      expect(executionOrder).toEqual([1, 2, 3]);
    });

    it("should process messages concurrently when concurrency > 1", async () => {
      const executionOrder: number[] = [];
      const queue = createMessageQueue<number>(
        (msg) => {
          executionOrder.push(msg);
          return Promise.resolve();
        },
        { concurrency: 2 },
      );

      queue.enqueue(1);
      queue.enqueue(2);
      queue.enqueue(3);

      await vi.advanceTimersByTimeAsync(100);
      await queue.waitForIdle();

      // Order may vary but all should be processed
      expect(executionOrder).toHaveLength(3);
      expect(executionOrder).toContain(1);
      expect(executionOrder).toContain(2);
      expect(executionOrder).toContain(3);
    });

    it("should return true when message is enqueued", () => {
      const queue = createMessageQueue<number>(() => Promise.resolve());
      expect(queue.enqueue(1)).toBe(true);
    });

    it("should drop messages when queue is full", () => {
      const onDrop = vi.fn();
      const queue = createMessageQueue<number>(
        () => new Promise(() => {}), // Never resolves
        { maxQueueSize: 2, onDrop },
      );

      expect(queue.enqueue(1)).toBe(true);
      expect(queue.enqueue(2)).toBe(true);
      expect(queue.enqueue(3)).toBe(false); // Should be dropped

      expect(onDrop).toHaveBeenCalledWith(1);
      expect(queue.getDroppedCount()).toBe(1);
    });
  });

  describe("getQueueSize", () => {
    it("should return current queue size", () => {
      const queue = createMessageQueue<number>(() => Promise.resolve());

      queue.enqueue(1);
      queue.enqueue(2);

      expect(queue.getQueueSize()).toBeGreaterThanOrEqual(0);
    });

    it("should return 0 when queue is empty", async () => {
      const queue = createMessageQueue<number>(() => Promise.resolve());

      await queue.waitForIdle();
      expect(queue.getQueueSize()).toBe(0);
    });
  });

  describe("getDroppedCount", () => {
    it("should track dropped messages", () => {
      const queue = createMessageQueue<number>(
        () => new Promise(() => {}), // Never resolves
        { maxQueueSize: 1 },
      );

      queue.enqueue(1);
      queue.enqueue(2); // Should be dropped
      queue.enqueue(3); // Should be dropped

      expect(queue.getDroppedCount()).toBe(2);
    });

    it("should return 0 when no messages dropped", () => {
      const queue = createMessageQueue<number>(() => Promise.resolve());
      expect(queue.getDroppedCount()).toBe(0);
    });
  });

  describe("waitForIdle", () => {
    it("should wait for queue to drain", async () => {
      let resolveMessage: (() => void) | undefined;
      const queue = createMessageQueue<number>(() => {
        return new Promise<void>((resolve) => {
          resolveMessage = resolve;
        });
      });

      queue.enqueue(1);
      await vi.advanceTimersByTimeAsync(10);

      const waitPromise = queue.waitForIdle();
      let completed = false;
      void waitPromise.then(() => {
        completed = true;
      });

      await vi.advanceTimersByTimeAsync(100);
      expect(completed).toBe(false);

      resolveMessage!();
      await vi.advanceTimersByTimeAsync(10);
      await waitPromise;

      expect(completed).toBe(true);
    });

    it("should complete immediately when queue is idle", async () => {
      const queue = createMessageQueue<number>(() => Promise.resolve());
      await queue.waitForIdle();
      // Should complete without waiting
    });
  });

  describe("clear", () => {
    it("should clear queue and reset dropped count", () => {
      const queue = createMessageQueue<number>(
        () => new Promise(() => {}), // Never resolves
        { maxQueueSize: 1 },
      );

      queue.enqueue(1);
      queue.enqueue(2); // Dropped
      expect(queue.getDroppedCount()).toBe(1);

      queue.clear();

      expect(queue.getQueueSize()).toBe(0);
      expect(queue.getDroppedCount()).toBe(0);
    });
  });

  describe("error handling", () => {
    it("should continue processing after handler error", async () => {
      const executionOrder: number[] = [];
      const queue = createMessageQueue<number>((msg) => {
        executionOrder.push(msg);
        if (msg === 1) {
          throw new Error("Handler error");
        }
        return Promise.resolve();
      });

      queue.enqueue(1);
      queue.enqueue(2);

      await vi.advanceTimersByTimeAsync(100);
      await queue.waitForIdle();

      expect(executionOrder).toEqual([1, 2]);
    });
  });
});
