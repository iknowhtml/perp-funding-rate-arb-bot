import { describe, expect, it, vi } from "vitest";

import type { ExchangeAdapter, ExchangeOrder, Position } from "@/adapters/types";
import type { Logger } from "@/lib/logger/logger";

import { executeExitHedge, verifyFlatPosition } from "./exit-hedge";
import type { ExitHedgeDeps, ExitHedgeExecutionParams } from "./exit-hedge";
import { DEFAULT_EXECUTION_CONFIG, ExecutionError } from "./types";
import type { ExecutionConfig } from "./types";

/** USDC scale factor: 10^6 */
const QUOTE_SCALE = 1_000_000n;

/** Create a mock filled order. */
const createFilledOrder = (overrides?: Partial<ExchangeOrder>): ExchangeOrder => ({
  id: "order-1",
  exchangeOrderId: "exch-1",
  symbol: "BTC-USD",
  side: "SELL",
  type: "MARKET",
  status: "FILLED",
  quantityBase: 100000n,
  filledQuantityBase: 100000n,
  priceQuote: null,
  avgFillPriceQuote: 50000n * QUOTE_SCALE,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const createMockLogger = (): Logger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

const createTestConfig = (): ExecutionConfig => ({
  ...DEFAULT_EXECUTION_CONFIG,
  orderFillTimeoutMs: 1000,
  fillPollIntervalMs: 10,
});

const createDefaultParams = (): ExitHedgeExecutionParams => ({
  reason: "rate_drop",
  symbol: "BTC-USD",
  perpSymbol: "BTC-USD-PERP",
  spotSizeBase: 100000n,
  perpSizeBase: 100000n,
  intentId: "intent-exit-1",
});

const createDefaultDeps = (overrides?: {
  adapter?: Partial<ExchangeAdapter>;
}): ExitHedgeDeps => {
  const spotSellOrder = createFilledOrder({
    id: "spot-sell-1",
    symbol: "BTC-USD",
    side: "SELL",
  });
  const perpBuyOrder = createFilledOrder({
    id: "perp-buy-1",
    symbol: "BTC-USD-PERP",
    side: "BUY",
  });

  const adapter = {
    createOrder: vi.fn().mockResolvedValueOnce(spotSellOrder).mockResolvedValueOnce(perpBuyOrder),
    getOrder: vi.fn().mockResolvedValueOnce(spotSellOrder).mockResolvedValueOnce(perpBuyOrder),
    getPosition: vi.fn().mockResolvedValue(null), // Flat after exit
    ...overrides?.adapter,
  } as unknown as ExchangeAdapter;

  return {
    adapter,
    executionConfig: createTestConfig(),
    logger: createMockLogger(),
  };
};

describe("verifyFlatPosition", () => {
  it("should return true when both positions are null", async () => {
    const adapter = {
      getPosition: vi.fn().mockResolvedValue(null),
    } as unknown as ExchangeAdapter;

    const result = await verifyFlatPosition(adapter, "BTC-USD", "BTC-USD-PERP");

    expect(result).toBe(true);
    expect(adapter.getPosition).toHaveBeenCalledTimes(2);
  });

  it("should return true when positions have zero size", async () => {
    const zeroPosition: Position = {
      symbol: "BTC-USD",
      side: "LONG",
      sizeBase: 0n,
      entryPriceQuote: 50000n * QUOTE_SCALE,
      markPriceQuote: 50000n * QUOTE_SCALE,
      liquidationPriceQuote: null,
      unrealizedPnlQuote: 0n,
      leverageBps: 0n,
      marginQuote: 0n,
    };

    const adapter = {
      getPosition: vi.fn().mockResolvedValue(zeroPosition),
    } as unknown as ExchangeAdapter;

    const result = await verifyFlatPosition(adapter, "BTC-USD", "BTC-USD-PERP");

    expect(result).toBe(true);
  });

  it("should return false when spot position has size", async () => {
    const spotPosition: Position = {
      symbol: "BTC-USD",
      side: "LONG",
      sizeBase: 100000n, // Not flat
      entryPriceQuote: 50000n * QUOTE_SCALE,
      markPriceQuote: 50000n * QUOTE_SCALE,
      liquidationPriceQuote: null,
      unrealizedPnlQuote: 0n,
      leverageBps: 10000n,
      marginQuote: 50000n * QUOTE_SCALE,
    };

    const adapter = {
      getPosition: vi
        .fn()
        .mockResolvedValueOnce(spotPosition) // spot has position
        .mockResolvedValueOnce(null), // perp is flat
    } as unknown as ExchangeAdapter;

    const result = await verifyFlatPosition(adapter, "BTC-USD", "BTC-USD-PERP");

    expect(result).toBe(false);
  });

  it("should return false when perp position has size", async () => {
    const perpPosition: Position = {
      symbol: "BTC-USD-PERP",
      side: "SHORT",
      sizeBase: 100000n,
      entryPriceQuote: 50000n * QUOTE_SCALE,
      markPriceQuote: 50000n * QUOTE_SCALE,
      liquidationPriceQuote: 75000n * QUOTE_SCALE,
      unrealizedPnlQuote: 0n,
      leverageBps: 10000n,
      marginQuote: 50000n * QUOTE_SCALE,
    };

    const adapter = {
      getPosition: vi
        .fn()
        .mockResolvedValueOnce(null) // spot is flat
        .mockResolvedValueOnce(perpPosition), // perp has position
    } as unknown as ExchangeAdapter;

    const result = await verifyFlatPosition(adapter, "BTC-USD", "BTC-USD-PERP");

    expect(result).toBe(false);
  });
});

describe("executeExitHedge", () => {
  it("should abort when no position to exit (zero sizes)", async () => {
    const deps = createDefaultDeps();
    const params: ExitHedgeExecutionParams = {
      ...createDefaultParams(),
      spotSizeBase: 0n,
      perpSizeBase: 0n,
    };

    const result = await executeExitHedge(params, deps);

    expect(result.success).toBe(false);
    expect(result.aborted).toBe(true);
    expect(result.reason).toBe("No position to exit");
  });

  it("should execute successfully with filled orders", async () => {
    const deps = createDefaultDeps();
    const params = createDefaultParams();

    const result = await executeExitHedge(params, deps);

    expect(result.success).toBe(true);
    expect(result.aborted).toBe(false);
    expect(result.spotOrder).toBeDefined();
    expect(result.perpOrder).toBeDefined();
  });

  it("should place spot sell before perp close", async () => {
    const deps = createDefaultDeps();
    const params = createDefaultParams();

    await executeExitHedge(params, deps);

    const createOrderCalls = vi.mocked(deps.adapter.createOrder).mock.calls;
    expect(createOrderCalls).toHaveLength(2);

    // First call: spot sell
    expect(createOrderCalls[0]?.[0]).toMatchObject({
      symbol: "BTC-USD",
      side: "SELL",
    });

    // Second call: perp buy (close)
    expect(createOrderCalls[1]?.[0]).toMatchObject({
      symbol: "BTC-USD-PERP",
      side: "BUY",
      reduceOnly: true,
    });
  });

  it("should return partial result when second order fails", async () => {
    const spotSellOrder = createFilledOrder({
      id: "spot-sell-1",
      symbol: "BTC-USD",
      side: "SELL",
    });

    const deps = createDefaultDeps({
      adapter: {
        createOrder: vi
          .fn()
          .mockResolvedValueOnce(spotSellOrder)
          .mockRejectedValueOnce(new Error("Exchange error")),
        getOrder: vi.fn().mockResolvedValueOnce(spotSellOrder),
        getPosition: vi.fn().mockResolvedValue(null),
      },
    });
    const params = createDefaultParams();

    const result = await executeExitHedge(params, deps);

    expect(result.success).toBe(false);
    expect(result.aborted).toBe(false);
    expect(result.spotOrder).toBeDefined();
    expect(result.perpOrder).toBeUndefined();
    expect(result.reason).toContain("Partial exit failure");
  });

  it("should throw ExecutionError when first order fails", async () => {
    const deps = createDefaultDeps({
      adapter: {
        createOrder: vi.fn().mockRejectedValueOnce(new Error("Exchange down")),
        getOrder: vi.fn(),
        getPosition: vi.fn(),
      },
    });
    const params = createDefaultParams();

    await expect(executeExitHedge(params, deps)).rejects.toThrow(ExecutionError);
  });

  it("should log error when not flat after exit", async () => {
    const spotSellOrder = createFilledOrder({ id: "spot-sell-1", side: "SELL" });
    const perpBuyOrder = createFilledOrder({ id: "perp-buy-1", side: "BUY" });

    // Position still exists after exit
    const remainingPosition: Position = {
      symbol: "BTC-USD-PERP",
      side: "SHORT",
      sizeBase: 1000n, // Still has a position
      entryPriceQuote: 50000n * QUOTE_SCALE,
      markPriceQuote: 50000n * QUOTE_SCALE,
      liquidationPriceQuote: 75000n * QUOTE_SCALE,
      unrealizedPnlQuote: 0n,
      leverageBps: 10000n,
      marginQuote: 50000n * QUOTE_SCALE,
    };

    const deps = createDefaultDeps({
      adapter: {
        createOrder: vi
          .fn()
          .mockResolvedValueOnce(spotSellOrder)
          .mockResolvedValueOnce(perpBuyOrder),
        getOrder: vi.fn().mockResolvedValueOnce(spotSellOrder).mockResolvedValueOnce(perpBuyOrder),
        getPosition: vi
          .fn()
          .mockResolvedValueOnce(null) // spot flat
          .mockResolvedValueOnce(remainingPosition), // perp not flat
      },
    });
    const params = createDefaultParams();

    const result = await executeExitHedge(params, deps);

    // Should still succeed (orders were placed)
    expect(result.success).toBe(true);
    // But logger.error should have been called about not being flat
    expect(deps.logger.error).toHaveBeenCalledWith(
      "Not flat after exit",
      expect.any(Error),
      expect.objectContaining({ intentId: "intent-exit-1" }),
    );
  });
});
