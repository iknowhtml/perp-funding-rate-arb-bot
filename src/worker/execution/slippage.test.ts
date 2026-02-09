import { describe, expect, it, vi } from "vitest";

import type { ExchangeAdapter, OrderBook, OrderBookLevel } from "@/adapters/types";

import {
  calculateAvailableDepthBase,
  calculateMidPriceQuote,
  estimateSlippage,
  validateExecution,
} from "./slippage";
import { BPS_PER_UNIT, DEFAULT_EXECUTION_CONFIG } from "./types";
import type { ExecutionConfig } from "./types";

/** Create a mock order book with given levels. */
const createMockOrderBook = (bids: OrderBookLevel[], asks: OrderBookLevel[]): OrderBook => ({
  symbol: "BTC-USD",
  bids,
  asks,
  timestamp: new Date(),
});

/** Helper to create an order book level. */
const level = (priceQuote: bigint, quantityBase: bigint): OrderBookLevel => ({
  priceQuote,
  quantityBase,
});

describe("calculateMidPriceQuote", () => {
  it("should calculate mid price from best bid and ask", () => {
    const book = createMockOrderBook([level(49900n, 100n)], [level(50100n, 100n)]);

    expect(calculateMidPriceQuote(book)).toBe(50000n);
  });

  it("should return 0n when bids are empty", () => {
    const book = createMockOrderBook([], [level(50100n, 100n)]);

    expect(calculateMidPriceQuote(book)).toBe(0n);
  });

  it("should return 0n when asks are empty", () => {
    const book = createMockOrderBook([level(49900n, 100n)], []);

    expect(calculateMidPriceQuote(book)).toBe(0n);
  });

  it("should return 0n when both sides are empty", () => {
    const book = createMockOrderBook([], []);

    expect(calculateMidPriceQuote(book)).toBe(0n);
  });

  it("should handle integer division rounding", () => {
    const book = createMockOrderBook([level(49999n, 100n)], [level(50000n, 100n)]);

    // (49999 + 50000) / 2 = 49999 (integer division)
    expect(calculateMidPriceQuote(book)).toBe(49999n);
  });
});

describe("calculateAvailableDepthBase", () => {
  it("should sum all level quantities", () => {
    const levels = [level(100n, 50n), level(101n, 75n), level(102n, 25n)];

    expect(calculateAvailableDepthBase(levels)).toBe(150n);
  });

  it("should return 0n for empty levels", () => {
    expect(calculateAvailableDepthBase([])).toBe(0n);
  });

  it("should handle single level", () => {
    expect(calculateAvailableDepthBase([level(100n, 500n)])).toBe(500n);
  });
});

describe("estimateSlippage", () => {
  const maxSlippageBps = 100n; // 1%

  it("should estimate zero slippage when order fits in top level", () => {
    const book = createMockOrderBook([level(49900n, 1000n)], [level(50100n, 1000n)]);

    const result = estimateSlippage(book, "BUY", 100n, maxSlippageBps);

    // Mid = 50000, fill at 50100, slippage = (50100-50000)/50000 * 10000 = 20 bps
    expect(result.estimatedSlippageBps).toBe(20n);
    expect(result.avgFillPriceQuote).toBe(50100n);
    expect(result.midPriceQuote).toBe(50000n);
    expect(result.canExecute).toBe(true);
  });

  it("should walk multiple levels for large orders", () => {
    const book = createMockOrderBook(
      [level(49900n, 1000n)],
      [
        level(50100n, 50n), // Fill 50 @ 50100
        level(50200n, 50n), // Fill 50 @ 50200
      ],
    );

    const result = estimateSlippage(book, "BUY", 100n, maxSlippageBps);

    // Total cost = 50 * 50100 + 50 * 50200 = 2505000 + 2510000 = 5015000
    // Avg price = 5015000 / 100 = 50150
    // Mid = 50000
    // Slippage = (50150 - 50000) / 50000 * 10000 = 30 bps
    expect(result.avgFillPriceQuote).toBe(50150n);
    expect(result.estimatedSlippageBps).toBe(30n);
    expect(result.canExecute).toBe(true);
  });

  it("should estimate sell slippage from bids", () => {
    const book = createMockOrderBook(
      [
        level(49900n, 50n), // Fill 50 @ 49900
        level(49800n, 50n), // Fill 50 @ 49800
      ],
      [level(50100n, 1000n)],
    );

    const result = estimateSlippage(book, "SELL", 100n, maxSlippageBps);

    // Total cost = 50 * 49900 + 50 * 49800 = 2495000 + 2490000 = 4985000
    // Avg price = 4985000 / 100 = 49850
    // Mid = 50000
    // Slippage = (50000 - 49850) / 50000 * 10000 = 30 bps
    expect(result.avgFillPriceQuote).toBe(49850n);
    expect(result.estimatedSlippageBps).toBe(30n);
    expect(result.canExecute).toBe(true);
  });

  it("should return canExecute=false when slippage exceeds limit", () => {
    const book = createMockOrderBook(
      [level(49900n, 1000n)],
      [
        level(50100n, 10n),
        level(51000n, 1000n), // Most fills at much higher price
      ],
    );

    const result = estimateSlippage(book, "BUY", 100n, 50n); // 0.5% limit

    // Avg fill price will be close to 51000, slippage > 50 bps
    expect(result.canExecute).toBe(false);
  });

  it("should return canExecute=false when order book too thin", () => {
    const book = createMockOrderBook(
      [level(49900n, 1000n)],
      [level(50100n, 50n)], // Only 50 available, need 100
    );

    const result = estimateSlippage(book, "BUY", 100n, maxSlippageBps);

    expect(result.canExecute).toBe(false);
    expect(result.estimatedSlippageBps).toBe(BPS_PER_UNIT); // Max indicator
  });

  it("should return canExecute=false when order book is empty", () => {
    const book = createMockOrderBook([], []);

    const result = estimateSlippage(book, "BUY", 100n, maxSlippageBps);

    expect(result.canExecute).toBe(false);
    expect(result.midPriceQuote).toBe(0n);
  });

  it("should handle price improvement (negative slippage) as zero", () => {
    // Scenario where fill price is better than mid (unlikely but possible)
    const book = createMockOrderBook(
      [level(50100n, 1000n)], // High bid
      [level(49900n, 1000n)], // Low ask (crossed book, unusual)
    );

    const result = estimateSlippage(book, "BUY", 100n, maxSlippageBps);

    // Mid = 50000, fill at 49900 = price improvement
    expect(result.estimatedSlippageBps).toBe(0n);
    expect(result.canExecute).toBe(true);
  });
});

describe("validateExecution", () => {
  it("should return valid when slippage and liquidity are within limits", async () => {
    const adapter = {
      getOrderBook: vi
        .fn()
        .mockResolvedValue(createMockOrderBook([level(49900n, 10000n)], [level(50100n, 10000n)])),
    } as unknown as ExchangeAdapter;

    const config: ExecutionConfig = {
      ...DEFAULT_EXECUTION_CONFIG,
      maxSlippageBps: 100n,
      minLiquidityMultiplier: 3n,
    };

    const result = await validateExecution(adapter, "BTC-USD", "BUY", 100n, config);

    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("should return invalid when slippage exceeds limit", async () => {
    const adapter = {
      getOrderBook: vi.fn().mockResolvedValue(
        createMockOrderBook(
          [level(49900n, 1000n)],
          [
            level(50100n, 10n),
            level(60000n, 10000n), // Very thin top of book
          ],
        ),
      ),
    } as unknown as ExchangeAdapter;

    const config: ExecutionConfig = {
      ...DEFAULT_EXECUTION_CONFIG,
      maxSlippageBps: 10n, // Very tight slippage limit
    };

    const result = await validateExecution(adapter, "BTC-USD", "BUY", 100n, config);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Slippage");
  });

  it("should return invalid when liquidity is insufficient", async () => {
    const adapter = {
      getOrderBook: vi.fn().mockResolvedValue(
        createMockOrderBook(
          [level(49900n, 10000n)],
          [level(50100n, 200n)], // Only 200 available
        ),
      ),
    } as unknown as ExchangeAdapter;

    const config: ExecutionConfig = {
      ...DEFAULT_EXECUTION_CONFIG,
      maxSlippageBps: 100n,
      minLiquidityMultiplier: 3n, // Need 300 for size 100
    };

    const result = await validateExecution(adapter, "BTC-USD", "BUY", 100n, config);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Insufficient liquidity");
  });
});
