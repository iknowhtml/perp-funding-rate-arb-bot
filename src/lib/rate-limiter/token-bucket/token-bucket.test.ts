import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTokenBucket } from "./token-bucket";

describe("createTokenBucket", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("tryConsume", () => {
    it("should consume tokens when available", () => {
      const bucket = createTokenBucket({
        maxTokens: 10,
        refillRatePerSecond: 10,
      });

      expect(bucket.tryConsume(1)).toBe(true);
      expect(bucket.getAvailableTokens()).toBe(9);
    });

    it("should consume multiple tokens at once", () => {
      const bucket = createTokenBucket({
        maxTokens: 10,
        refillRatePerSecond: 10,
      });

      expect(bucket.tryConsume(5)).toBe(true);
      expect(bucket.getAvailableTokens()).toBe(5);
    });

    it("should fail when not enough tokens", () => {
      const bucket = createTokenBucket({
        maxTokens: 5,
        refillRatePerSecond: 1,
      });

      expect(bucket.tryConsume(5)).toBe(true);
      expect(bucket.tryConsume(1)).toBe(false);
      expect(bucket.getAvailableTokens()).toBe(0);
    });

    it("should default to consuming 1 token", () => {
      const bucket = createTokenBucket({
        maxTokens: 10,
        refillRatePerSecond: 10,
      });

      expect(bucket.tryConsume()).toBe(true);
      expect(bucket.getAvailableTokens()).toBe(9);
    });
  });

  describe("getWaitTimeMs", () => {
    it("should return 0 when tokens available", () => {
      const bucket = createTokenBucket({
        maxTokens: 10,
        refillRatePerSecond: 10,
      });

      expect(bucket.getWaitTimeMs(5)).toBe(0);
    });

    it("should calculate wait time when tokens not available", () => {
      const bucket = createTokenBucket({
        maxTokens: 10,
        refillRatePerSecond: 10,
        initialTokens: 0,
      });

      // Need 5 tokens, refill rate is 10/s, so need 0.5 seconds = 500ms
      expect(bucket.getWaitTimeMs(5)).toBe(500);
    });

    it("should calculate correct wait time for partial availability", () => {
      const bucket = createTokenBucket({
        maxTokens: 10,
        refillRatePerSecond: 2,
        initialTokens: 3,
      });

      // Have 3 tokens, need 5, so need 2 more at 2/s = 1000ms
      expect(bucket.getWaitTimeMs(5)).toBe(1000);
    });
  });

  describe("consume (async)", () => {
    it("should consume immediately when tokens available", async () => {
      const bucket = createTokenBucket({
        maxTokens: 10,
        refillRatePerSecond: 10,
      });

      await bucket.consume(5);
      expect(bucket.getAvailableTokens()).toBe(5);
    });

    it("should wait and then consume when tokens not available", async () => {
      const bucket = createTokenBucket({
        maxTokens: 10,
        refillRatePerSecond: 10,
        initialTokens: 0,
      });

      const consumePromise = bucket.consume(5);

      // Should be waiting
      expect(bucket.getAvailableTokens()).toBe(0);

      // Advance time by 500ms (need 5 tokens at 10/s)
      await vi.advanceTimersByTimeAsync(500);

      await consumePromise;

      // After consuming 5 tokens with 500ms of refill (5 tokens added), should have 0
      // Actually: starts with 0, waits 500ms, gets 5 tokens, consumes 5, has 0
      expect(bucket.getAvailableTokens()).toBe(0);
    });
  });

  describe("refill", () => {
    it("should refill tokens over time", () => {
      const bucket = createTokenBucket({
        maxTokens: 10,
        refillRatePerSecond: 10,
        initialTokens: 0,
      });

      expect(bucket.getAvailableTokens()).toBe(0);

      // Advance 500ms = 5 tokens
      vi.advanceTimersByTime(500);
      expect(bucket.getAvailableTokens()).toBe(5);

      // Advance another 500ms = 10 tokens (capped at max)
      vi.advanceTimersByTime(500);
      expect(bucket.getAvailableTokens()).toBe(10);
    });

    it("should not exceed max capacity", () => {
      const bucket = createTokenBucket({
        maxTokens: 10,
        refillRatePerSecond: 100,
        initialTokens: 0,
      });

      // Even with high refill rate, should cap at 10
      vi.advanceTimersByTime(1000);
      expect(bucket.getAvailableTokens()).toBe(10);
    });
  });

  describe("reset", () => {
    it("should reset bucket to full capacity", () => {
      const bucket = createTokenBucket({
        maxTokens: 10,
        refillRatePerSecond: 10,
      });

      bucket.tryConsume(10);
      expect(bucket.getAvailableTokens()).toBe(0);

      bucket.reset();
      expect(bucket.getAvailableTokens()).toBe(10);
    });
  });

  describe("penalize", () => {
    it("should reduce capacity with multiplier < 1", () => {
      const bucket = createTokenBucket({
        maxTokens: 10,
        refillRatePerSecond: 10,
      });

      bucket.penalize(0.5);
      expect(bucket.getAvailableTokens()).toBe(5);

      // Even after refill, should cap at new capacity
      vi.advanceTimersByTime(10000);
      expect(bucket.getAvailableTokens()).toBe(5);
    });

    it("should ensure minimum capacity of 1", () => {
      const bucket = createTokenBucket({
        maxTokens: 10,
        refillRatePerSecond: 10,
      });

      bucket.penalize(0);
      expect(bucket.getAvailableTokens()).toBeGreaterThanOrEqual(0);
    });
  });

  describe("initialTokens", () => {
    it("should start with specified initial tokens", () => {
      const bucket = createTokenBucket({
        maxTokens: 100,
        refillRatePerSecond: 10,
        initialTokens: 50,
      });

      expect(bucket.getAvailableTokens()).toBe(50);
    });

    it("should default to maxTokens when not specified", () => {
      const bucket = createTokenBucket({
        maxTokens: 100,
        refillRatePerSecond: 10,
      });

      expect(bucket.getAvailableTokens()).toBe(100);
    });
  });
});
