import * as v from "valibot";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMessageParser } from "./message-parser";

describe("createMessageParser", () => {
  const logger = {
    warn: vi.fn(),
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("registerHandler", () => {
    it("should register handler for message type", () => {
      const parser = createMessageParser({ logger });
      const handler = vi.fn();

      const TickerSchema = v.object({
        type: v.literal("ticker"),
        symbol: v.string(),
        price: v.number(),
      });

      parser.registerHandler("ticker", {
        schema: TickerSchema,
        handler,
      });

      parser.parse(JSON.stringify({ type: "ticker", symbol: "BTC", price: 50000 }));

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({
        type: "ticker",
        symbol: "BTC",
        price: 50000,
      });
    });
  });

  describe("parse", () => {
    it("should parse valid JSON message", () => {
      const parser = createMessageParser({ logger });
      const handler = vi.fn();

      parser.registerHandler("test", {
        schema: v.object({ type: v.literal("test"), data: v.string() }),
        handler,
      });

      parser.parse(JSON.stringify({ type: "test", data: "value" }));

      expect(handler).toHaveBeenCalledWith({ type: "test", data: "value" });
    });

    it("should extract type from 'type' field", () => {
      const parser = createMessageParser({ logger });
      const handler = vi.fn();

      parser.registerHandler("ticker", {
        schema: v.object({ type: v.literal("ticker") }),
        handler,
      });

      parser.parse(JSON.stringify({ type: "ticker" }));

      expect(handler).toHaveBeenCalled();
    });

    it("should extract type from 'channel' field", () => {
      const parser = createMessageParser({ logger });
      const handler = vi.fn();

      parser.registerHandler("orders", {
        schema: v.object({ channel: v.literal("orders") }),
        handler,
      });

      parser.parse(JSON.stringify({ channel: "orders" }));

      expect(handler).toHaveBeenCalled();
    });

    it("should log warning for missing type/channel", () => {
      const parser = createMessageParser({ logger });

      parser.parse(JSON.stringify({ data: "value" }));

      expect(logger.warn).toHaveBeenCalledWith(
        "Message missing type/channel field",
        expect.any(Object),
      );
    });

    it("should log warning for invalid JSON", () => {
      const parser = createMessageParser({ logger });

      parser.parse("invalid json");

      expect(logger.warn).toHaveBeenCalledWith("Failed to parse message", expect.any(Object));
    });

    it("should log warning for validation failure", () => {
      const parser = createMessageParser({ logger });
      const handler = vi.fn();

      parser.registerHandler("ticker", {
        schema: v.object({
          type: v.literal("ticker"),
          price: v.number(),
        }),
        handler,
      });

      parser.parse(JSON.stringify({ type: "ticker", price: "invalid" }));

      expect(logger.warn).toHaveBeenCalledWith(
        "Message validation failed",
        expect.objectContaining({ type: "ticker" }),
      );
      expect(handler).not.toHaveBeenCalled();
    });

    it("should ignore messages without registered handler", () => {
      const parser = createMessageParser({ logger });

      parser.parse(JSON.stringify({ type: "unknown" }));

      // Should not crash, just ignore
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe("de-duplication", () => {
    it("should skip duplicate messages", () => {
      const parser = createMessageParser({ logger, dedupeTtlMs: 60000 });
      const handler = vi.fn();

      parser.registerHandler("ticker", {
        schema: v.object({
          type: v.literal("ticker"),
          symbol: v.string(),
          timestamp: v.number(),
        }),
        handler,
        getDedupeKey: (msg) => `${msg.symbol}-${msg.timestamp}`,
      });

      const message = { type: "ticker" as const, symbol: "BTC", timestamp: 1234567890 };

      parser.parse(JSON.stringify(message));
      parser.parse(JSON.stringify(message)); // Duplicate

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("should process different messages", () => {
      const parser = createMessageParser({ logger });
      const handler = vi.fn();

      parser.registerHandler("ticker", {
        schema: v.object({
          type: v.literal("ticker"),
          symbol: v.string(),
          timestamp: v.number(),
        }),
        handler,
        getDedupeKey: (msg) => `${msg.symbol}-${msg.timestamp}`,
      });

      parser.parse(JSON.stringify({ type: "ticker", symbol: "BTC", timestamp: 1234567890 }));
      parser.parse(JSON.stringify({ type: "ticker", symbol: "BTC", timestamp: 1234567891 })); // Different timestamp

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("should evict expired entries", async () => {
      const parser = createMessageParser({ logger, dedupeTtlMs: 1000 });
      const handler = vi.fn();

      parser.registerHandler("ticker", {
        schema: v.object({
          type: v.literal("ticker"),
          symbol: v.string(),
          timestamp: v.number(),
        }),
        handler,
        getDedupeKey: (msg) => `${msg.symbol}-${msg.timestamp}`,
      });

      const message = { type: "ticker" as const, symbol: "BTC", timestamp: 1234567890 };

      parser.parse(JSON.stringify(message));

      // Advance time past TTL
      await vi.advanceTimersByTimeAsync(1100);

      // Same message should be processed again (cache expired)
      parser.parse(JSON.stringify(message));

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("should evict oldest when cache is full", () => {
      const parser = createMessageParser({ logger, maxDedupeSize: 2 });
      const handler = vi.fn();

      parser.registerHandler("ticker", {
        schema: v.object({
          type: v.literal("ticker"),
          symbol: v.string(),
          timestamp: v.number(),
        }),
        handler,
        getDedupeKey: (msg) => `${msg.symbol}-${msg.timestamp}`,
      });

      // Fill cache
      parser.parse(JSON.stringify({ type: "ticker", symbol: "BTC", timestamp: 1 }));
      parser.parse(JSON.stringify({ type: "ticker", symbol: "ETH", timestamp: 2 }));

      // This should evict oldest (BTC-1)
      parser.parse(JSON.stringify({ type: "ticker", symbol: "SOL", timestamp: 3 }));

      // BTC-1 should be processed again (was evicted)
      parser.parse(JSON.stringify({ type: "ticker", symbol: "BTC", timestamp: 1 }));

      expect(handler).toHaveBeenCalledTimes(4);
    });
  });

  describe("getDedupeStats", () => {
    it("should return cache stats", () => {
      const parser = createMessageParser({ logger });
      const handler = vi.fn();

      parser.registerHandler("ticker", {
        schema: v.object({
          type: v.literal("ticker"),
          symbol: v.string(),
          timestamp: v.number(),
        }),
        handler,
        getDedupeKey: (msg) => `${msg.symbol}-${msg.timestamp}`,
      });

      parser.parse(JSON.stringify({ type: "ticker", symbol: "BTC", timestamp: 1 }));
      parser.parse(JSON.stringify({ type: "ticker", symbol: "BTC", timestamp: 1 })); // Duplicate

      const stats = parser.getDedupeStats();

      expect(stats.size).toBe(1);
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });
  });

  describe("clearDedupeCache", () => {
    it("should clear cache and reset stats", () => {
      const parser = createMessageParser({ logger });
      const handler = vi.fn();

      parser.registerHandler("ticker", {
        schema: v.object({
          type: v.literal("ticker"),
          symbol: v.string(),
          timestamp: v.number(),
        }),
        handler,
        getDedupeKey: (msg) => `${msg.symbol}-${msg.timestamp}`,
      });

      parser.parse(JSON.stringify({ type: "ticker", symbol: "BTC", timestamp: 1 }));
      parser.parse(JSON.stringify({ type: "ticker", symbol: "BTC", timestamp: 1 })); // Duplicate

      parser.clearDedupeCache();

      const stats = parser.getDedupeStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);

      // Should process duplicate again after clear
      parser.parse(JSON.stringify({ type: "ticker", symbol: "BTC", timestamp: 1 }));
      expect(handler).toHaveBeenCalledTimes(2);
    });
  });
});
