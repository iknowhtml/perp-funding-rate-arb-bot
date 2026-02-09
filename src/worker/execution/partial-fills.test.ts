import { describe, expect, it, vi } from "vitest";

import type { ExchangeAdapter, ExchangeOrder } from "@/adapters/types";
import type { Logger } from "@/lib/logger/logger";

import {
  calculateRemainingBase,
  completePartialFill,
  handlePartialFills,
  isPartiallyFilled,
} from "./partial-fills";
import { DEFAULT_EXECUTION_CONFIG, ExecutionError } from "./types";
import type { ExecutionConfig } from "./types";

/** Create a mock ExchangeOrder. */
const createMockOrder = (overrides?: Partial<ExchangeOrder>): ExchangeOrder => ({
  id: "order-1",
  exchangeOrderId: "exch-order-1",
  symbol: "BTC-USD",
  side: "BUY",
  type: "MARKET",
  status: "FILLED",
  quantityBase: 100000n,
  filledQuantityBase: 100000n,
  priceQuote: null,
  avgFillPriceQuote: 50000000000n,
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
  fillPollIntervalMs: 1,
  maxPartialFillRetries: 3,
});

describe("isPartiallyFilled", () => {
  it("should return true for PARTIALLY_FILLED order with remaining", () => {
    const order = createMockOrder({
      status: "PARTIALLY_FILLED",
      quantityBase: 100000n,
      filledQuantityBase: 50000n,
    });

    expect(isPartiallyFilled(order)).toBe(true);
  });

  it("should return false for FILLED order", () => {
    const order = createMockOrder({ status: "FILLED" });

    expect(isPartiallyFilled(order)).toBe(false);
  });

  it("should return false for CANCELLED order", () => {
    const order = createMockOrder({ status: "CANCELLED" });

    expect(isPartiallyFilled(order)).toBe(false);
  });

  it("should return false for PARTIALLY_FILLED but fully filled quantity", () => {
    const order = createMockOrder({
      status: "PARTIALLY_FILLED",
      quantityBase: 100000n,
      filledQuantityBase: 100000n,
    });

    expect(isPartiallyFilled(order)).toBe(false);
  });
});

describe("calculateRemainingBase", () => {
  it("should calculate remaining quantity", () => {
    const order = createMockOrder({
      quantityBase: 100000n,
      filledQuantityBase: 60000n,
    });

    expect(calculateRemainingBase(order)).toBe(40000n);
  });

  it("should return zero when fully filled", () => {
    const order = createMockOrder({
      quantityBase: 100000n,
      filledQuantityBase: 100000n,
    });

    expect(calculateRemainingBase(order)).toBe(0n);
  });
});

describe("completePartialFill", () => {
  const logger = createMockLogger();

  it("should return null for non-partial order", async () => {
    const adapter = { createOrder: vi.fn() } as unknown as ExchangeAdapter;
    const order = createMockOrder({ status: "FILLED" });

    const result = await completePartialFill(order, adapter, createTestConfig(), logger);

    expect(result).toBeNull();
    expect(adapter.createOrder).not.toHaveBeenCalled();
  });

  it("should place market order for remaining quantity", async () => {
    const partialOrder = createMockOrder({
      status: "PARTIALLY_FILLED",
      quantityBase: 100000n,
      filledQuantityBase: 60000n,
    });

    const completionOrder = createMockOrder({
      id: "completion-1",
      status: "FILLED",
      quantityBase: 40000n,
      filledQuantityBase: 40000n,
    });

    const adapter = {
      createOrder: vi.fn().mockResolvedValue(completionOrder),
      getOrder: vi.fn().mockResolvedValue(completionOrder),
    } as unknown as ExchangeAdapter;

    const result = await completePartialFill(partialOrder, adapter, createTestConfig(), logger);

    expect(result).toEqual(completionOrder);
    expect(adapter.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: "BTC-USD",
        side: "BUY",
        type: "MARKET",
        quantityBase: 40000n,
      }),
    );
  });

  it("should throw ExecutionError after exhausting retries", async () => {
    const partialOrder = createMockOrder({
      status: "PARTIALLY_FILLED",
      quantityBase: 100000n,
      filledQuantityBase: 60000n,
    });

    const adapter = {
      createOrder: vi.fn().mockRejectedValue(new Error("Exchange error")),
      getOrder: vi.fn(),
    } as unknown as ExchangeAdapter;

    await expect(
      completePartialFill(partialOrder, adapter, createTestConfig(), logger),
    ).rejects.toThrow(ExecutionError);

    // Should have retried 3 times
    expect(adapter.createOrder).toHaveBeenCalledTimes(3);
  });

  it("should retry when completion order is also partial", async () => {
    const partialOrder = createMockOrder({
      status: "PARTIALLY_FILLED",
      quantityBase: 100000n,
      filledQuantityBase: 60000n,
    });

    const stillPartial = createMockOrder({
      id: "completion-1",
      status: "PARTIALLY_FILLED",
      quantityBase: 40000n,
      filledQuantityBase: 20000n,
    });

    const fullyFilled = createMockOrder({
      id: "completion-2",
      status: "FILLED",
      quantityBase: 40000n,
      filledQuantityBase: 40000n,
    });

    const adapter = {
      createOrder: vi.fn().mockResolvedValueOnce(stillPartial).mockResolvedValueOnce(fullyFilled),
      getOrder: vi.fn().mockResolvedValueOnce(stillPartial).mockResolvedValueOnce(fullyFilled),
    } as unknown as ExchangeAdapter;

    const result = await completePartialFill(partialOrder, adapter, createTestConfig(), logger);

    expect(result).toEqual(fullyFilled);
    expect(adapter.createOrder).toHaveBeenCalledTimes(2);
  });
});

describe("handlePartialFills", () => {
  const logger = createMockLogger();

  it("should do nothing when neither order is partial", async () => {
    const adapter = { createOrder: vi.fn() } as unknown as ExchangeAdapter;

    const perpOrder = createMockOrder({ status: "FILLED" });
    const spotOrder = createMockOrder({ status: "FILLED" });

    await handlePartialFills(perpOrder, spotOrder, adapter, createTestConfig(), logger);

    expect(adapter.createOrder).not.toHaveBeenCalled();
  });

  it("should complete perp partial fill", async () => {
    const perpPartial = createMockOrder({
      id: "perp-1",
      symbol: "BTC-USD-PERP",
      side: "SELL",
      status: "PARTIALLY_FILLED",
      quantityBase: 100000n,
      filledQuantityBase: 80000n,
    });
    const spotFilled = createMockOrder({
      id: "spot-1",
      status: "FILLED",
    });

    const completionOrder = createMockOrder({
      id: "perp-completion",
      symbol: "BTC-USD-PERP",
      side: "SELL",
      status: "FILLED",
      quantityBase: 20000n,
      filledQuantityBase: 20000n,
    });

    const adapter = {
      createOrder: vi.fn().mockResolvedValue(completionOrder),
      getOrder: vi.fn().mockResolvedValue(completionOrder),
    } as unknown as ExchangeAdapter;

    await handlePartialFills(perpPartial, spotFilled, adapter, createTestConfig(), logger);

    expect(adapter.createOrder).toHaveBeenCalledTimes(1);
    expect(adapter.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: "BTC-USD-PERP",
        side: "SELL",
        quantityBase: 20000n,
      }),
    );
  });

  it("should complete both partial fills", async () => {
    const perpPartial = createMockOrder({
      id: "perp-1",
      symbol: "BTC-USD-PERP",
      side: "SELL",
      status: "PARTIALLY_FILLED",
      quantityBase: 100000n,
      filledQuantityBase: 80000n,
    });
    const spotPartial = createMockOrder({
      id: "spot-1",
      symbol: "BTC-USD",
      side: "BUY",
      status: "PARTIALLY_FILLED",
      quantityBase: 100000n,
      filledQuantityBase: 90000n,
    });

    const perpCompletion = createMockOrder({
      id: "perp-comp",
      status: "FILLED",
    });
    const spotCompletion = createMockOrder({
      id: "spot-comp",
      status: "FILLED",
    });

    const adapter = {
      createOrder: vi
        .fn()
        .mockResolvedValueOnce(perpCompletion)
        .mockResolvedValueOnce(spotCompletion),
      getOrder: vi.fn().mockResolvedValueOnce(perpCompletion).mockResolvedValueOnce(spotCompletion),
    } as unknown as ExchangeAdapter;

    await handlePartialFills(perpPartial, spotPartial, adapter, createTestConfig(), logger);

    expect(adapter.createOrder).toHaveBeenCalledTimes(2);
  });
});
