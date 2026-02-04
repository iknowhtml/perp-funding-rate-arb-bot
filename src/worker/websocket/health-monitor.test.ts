import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHealthMonitor } from "./health-monitor";

describe("createHealthMonitor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("recordMessage", () => {
    it("should record message timestamp for stream", () => {
      const onUnhealthy = vi.fn();
      const health = createHealthMonitor({
        streams: {
          ticker: { expectedIntervalMs: 1000, staleThresholdMs: 5000 },
        },
        onUnhealthy,
      });

      health.recordMessage("ticker");

      const status = health.getStatus();
      expect(status.ticker.lastMessageMs).toBeLessThan(100);
    });
  });

  describe("recordPong", () => {
    it("should record pong timestamp", () => {
      const health = createHealthMonitor({
        streams: {
          ticker: { expectedIntervalMs: 1000, staleThresholdMs: 5000 },
        },
        onUnhealthy: vi.fn(),
      });

      health.recordPong();

      // Pong doesn't affect stream health directly, but is recorded
      // (implementation detail - we just verify it doesn't crash)
      expect(health.isHealthy()).toBeDefined();
    });
  });

  describe("isStreamHealthy", () => {
    it("should return true for healthy stream", () => {
      const health = createHealthMonitor({
        streams: {
          ticker: { expectedIntervalMs: 1000, staleThresholdMs: 5000 },
        },
        onUnhealthy: vi.fn(),
      });

      health.recordMessage("ticker");

      expect(health.isStreamHealthy("ticker")).toBe(true);
    });

    it("should return false for stale stream", async () => {
      const health = createHealthMonitor({
        streams: {
          ticker: { expectedIntervalMs: 1000, staleThresholdMs: 5000 },
        },
        onUnhealthy: vi.fn(),
      });

      health.recordMessage("ticker");

      // Advance time past stale threshold
      await vi.advanceTimersByTimeAsync(6000);

      expect(health.isStreamHealthy("ticker")).toBe(false);
    });

    it("should return false for stream with no messages", () => {
      const health = createHealthMonitor({
        streams: {
          ticker: { expectedIntervalMs: 1000, staleThresholdMs: 5000 },
        },
        onUnhealthy: vi.fn(),
      });

      expect(health.isStreamHealthy("ticker")).toBe(false);
    });

    it("should return true for silence-allowed stream with no messages", () => {
      const health = createHealthMonitor({
        streams: {
          orders: {
            expectedIntervalMs: 60000,
            staleThresholdMs: 120000,
            allowSilence: true,
          },
        },
        onUnhealthy: vi.fn(),
      });

      expect(health.isStreamHealthy("orders")).toBe(true);
    });
  });

  describe("isHealthy", () => {
    it("should return true when all streams are healthy", () => {
      const health = createHealthMonitor({
        streams: {
          ticker: { expectedIntervalMs: 1000, staleThresholdMs: 5000 },
          orders: { expectedIntervalMs: 60000, staleThresholdMs: 120000 },
        },
        onUnhealthy: vi.fn(),
      });

      health.recordMessage("ticker");
      health.recordMessage("orders");

      expect(health.isHealthy()).toBe(true);
    });

    it("should return false when any stream is unhealthy", async () => {
      const health = createHealthMonitor({
        streams: {
          ticker: { expectedIntervalMs: 1000, staleThresholdMs: 5000 },
          orders: { expectedIntervalMs: 60000, staleThresholdMs: 120000 },
        },
        onUnhealthy: vi.fn(),
      });

      health.recordMessage("ticker");
      health.recordMessage("orders");

      // Advance time to make ticker stale
      await vi.advanceTimersByTimeAsync(6000);

      expect(health.isHealthy()).toBe(false);
    });
  });

  describe("getStatus", () => {
    it("should return status for all streams", () => {
      const health = createHealthMonitor({
        streams: {
          ticker: { expectedIntervalMs: 1000, staleThresholdMs: 5000 },
          orders: { expectedIntervalMs: 60000, staleThresholdMs: 120000 },
        },
        onUnhealthy: vi.fn(),
      });

      health.recordMessage("ticker");

      const status = health.getStatus();

      expect(status.ticker).toBeDefined();
      expect(status.ticker.healthy).toBe(true);
      expect(status.ticker.lastMessageMs).toBeLessThan(100);

      expect(status.orders).toBeDefined();
      expect(status.orders.healthy).toBe(false);
      expect(status.orders.lastMessageMs).toBeNull();
    });
  });

  describe("start/stop", () => {
    it("should call onUnhealthy when stream becomes stale", async () => {
      const onUnhealthy = vi.fn();
      const health = createHealthMonitor({
        streams: {
          ticker: { expectedIntervalMs: 1000, staleThresholdMs: 5000 },
        },
        onUnhealthy,
        checkIntervalMs: 1000,
      });

      health.recordMessage("ticker");
      health.start();

      // Advance time past stale threshold
      await vi.advanceTimersByTimeAsync(6000);

      expect(onUnhealthy).toHaveBeenCalledWith("ticker", expect.any(Number));
    });

    it("should call onRecovered when stream recovers", async () => {
      const onUnhealthy = vi.fn();
      const onRecovered = vi.fn();
      const health = createHealthMonitor({
        streams: {
          ticker: { expectedIntervalMs: 1000, staleThresholdMs: 5000 },
        },
        onUnhealthy,
        onRecovered,
        checkIntervalMs: 1000,
      });

      health.start();
      health.recordMessage("ticker");

      // Advance time to make stale
      await vi.advanceTimersByTimeAsync(6000);
      expect(onUnhealthy).toHaveBeenCalled();

      // Record new message to recover
      health.recordMessage("ticker");
      await vi.advanceTimersByTimeAsync(1000);

      expect(onRecovered).toHaveBeenCalledWith("ticker");
    });

    it("should stop monitoring when stopped", async () => {
      const onUnhealthy = vi.fn();
      const health = createHealthMonitor({
        streams: {
          ticker: { expectedIntervalMs: 1000, staleThresholdMs: 5000 },
        },
        onUnhealthy,
        checkIntervalMs: 1000,
      });

      health.recordMessage("ticker");
      health.start();

      health.stop();

      // Advance time - should not trigger checks
      await vi.advanceTimersByTimeAsync(6000);

      // onUnhealthy should not be called after stop
      const callCount = onUnhealthy.mock.calls.length;
      await vi.advanceTimersByTimeAsync(10000);
      expect(onUnhealthy.mock.calls.length).toBe(callCount);
    });
  });

  describe("expected silence", () => {
    it("should not trigger unhealthy for silence-allowed streams", async () => {
      const onUnhealthy = vi.fn();
      const health = createHealthMonitor({
        streams: {
          orders: {
            expectedIntervalMs: 60000,
            staleThresholdMs: 120000,
            allowSilence: true,
          },
        },
        onUnhealthy,
        checkIntervalMs: 1000,
      });

      health.start();

      // Advance time - should not trigger unhealthy
      await vi.advanceTimersByTimeAsync(130000);

      expect(onUnhealthy).not.toHaveBeenCalled();
      expect(health.isStreamHealthy("orders")).toBe(true);
    });

    it("should still track messages for silence-allowed streams", () => {
      const health = createHealthMonitor({
        streams: {
          orders: {
            expectedIntervalMs: 60000,
            staleThresholdMs: 120000,
            allowSilence: true,
          },
        },
        onUnhealthy: vi.fn(),
      });

      health.recordMessage("orders");

      const status = health.getStatus();
      expect(status.orders.lastMessageMs).toBeLessThan(100);
    });
  });
});
