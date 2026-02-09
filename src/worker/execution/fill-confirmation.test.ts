import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ExchangeAdapter, ExchangeOrder } from "@/adapters/types";
import type { Logger } from "@/lib/logger/logger";

import { confirmOrderFill, isTerminalOrderStatus } from "./fill-confirmation";
import { OrderFillTimeoutError } from "./types";
import type { ExecutionConfig } from "./types";

/** Create a minimal mock adapter. */
const createMockAdapter = (): ExchangeAdapter =>
  ({
    getOrder: vi.fn(),
  }) as unknown as ExchangeAdapter;

/** Create a minimal mock logger. */
const createMockLogger = (): Logger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

/** Create a mock execution config with fast polling for tests. */
const createTestConfig = (overrides?: Partial<ExecutionConfig>): ExecutionConfig => ({
  maxSlippageBps: 50n,
  maxDriftBps: 50n,
  orderFillTimeoutMs: 1000, // 1 second for tests
  fillPollIntervalMs: 10, // Fast polling for tests
  fillPollMaxAttempts: 100,
  maxPartialFillRetries: 3,
  minLiquidityMultiplier: 3n,
  ...overrides,
});

/** Create a mock ExchangeOrder with given status. */
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

describe("isTerminalOrderStatus", () => {
  it("should return true for FILLED", () => {
    expect(isTerminalOrderStatus("FILLED")).toBe(true);
  });

  it("should return true for CANCELLED", () => {
    expect(isTerminalOrderStatus("CANCELLED")).toBe(true);
  });

  it("should return true for REJECTED", () => {
    expect(isTerminalOrderStatus("REJECTED")).toBe(true);
  });

  it("should return true for EXPIRED", () => {
    expect(isTerminalOrderStatus("EXPIRED")).toBe(true);
  });

  it("should return true for PARTIALLY_FILLED", () => {
    expect(isTerminalOrderStatus("PARTIALLY_FILLED")).toBe(true);
  });

  it("should return false for PENDING", () => {
    expect(isTerminalOrderStatus("PENDING")).toBe(false);
  });

  it("should return false for OPEN", () => {
    expect(isTerminalOrderStatus("OPEN")).toBe(false);
  });
});

describe("confirmOrderFill", () => {
  let adapter: ExchangeAdapter;
  let logger: Logger;
  let config: ExecutionConfig;

  beforeEach(() => {
    vi.useFakeTimers();
    adapter = createMockAdapter();
    logger = createMockLogger();
    config = createTestConfig();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should return immediately when order is already filled", async () => {
    const filledOrder = createMockOrder({ status: "FILLED" });
    vi.mocked(adapter.getOrder).mockResolvedValueOnce(filledOrder);

    const result = await confirmOrderFill(adapter, "order-1", config, logger);

    expect(result).toEqual(filledOrder);
    expect(adapter.getOrder).toHaveBeenCalledTimes(1);
  });

  it("should poll until order is filled", async () => {
    const pendingOrder = createMockOrder({ status: "PENDING" });
    const openOrder = createMockOrder({ status: "OPEN" });
    const filledOrder = createMockOrder({ status: "FILLED" });

    vi.mocked(adapter.getOrder)
      .mockResolvedValueOnce(pendingOrder)
      .mockResolvedValueOnce(openOrder)
      .mockResolvedValueOnce(filledOrder);

    const promise = confirmOrderFill(adapter, "order-1", config, logger);

    // Advance timers for polling intervals
    await vi.advanceTimersByTimeAsync(config.fillPollIntervalMs);
    await vi.advanceTimersByTimeAsync(config.fillPollIntervalMs);
    await vi.advanceTimersByTimeAsync(config.fillPollIntervalMs);

    const result = await promise;

    expect(result).toEqual(filledOrder);
    expect(adapter.getOrder).toHaveBeenCalledTimes(3);
  });

  it("should return on CANCELLED status", async () => {
    const cancelledOrder = createMockOrder({ status: "CANCELLED" });
    vi.mocked(adapter.getOrder).mockResolvedValueOnce(cancelledOrder);

    const result = await confirmOrderFill(adapter, "order-1", config, logger);

    expect(result.status).toBe("CANCELLED");
  });

  it("should return on REJECTED status", async () => {
    const rejectedOrder = createMockOrder({ status: "REJECTED" });
    vi.mocked(adapter.getOrder).mockResolvedValueOnce(rejectedOrder);

    const result = await confirmOrderFill(adapter, "order-1", config, logger);

    expect(result.status).toBe("REJECTED");
  });

  it("should return on PARTIALLY_FILLED status", async () => {
    const partialOrder = createMockOrder({
      status: "PARTIALLY_FILLED",
      filledQuantityBase: 50000n,
    });
    vi.mocked(adapter.getOrder).mockResolvedValueOnce(partialOrder);

    const result = await confirmOrderFill(adapter, "order-1", config, logger);

    expect(result.status).toBe("PARTIALLY_FILLED");
  });

  it("should handle null order (not yet visible) and keep polling", async () => {
    const filledOrder = createMockOrder({ status: "FILLED" });

    vi.mocked(adapter.getOrder)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(filledOrder);

    const promise = confirmOrderFill(adapter, "order-1", config, logger);

    await vi.advanceTimersByTimeAsync(config.fillPollIntervalMs);
    await vi.advanceTimersByTimeAsync(config.fillPollIntervalMs);
    await vi.advanceTimersByTimeAsync(config.fillPollIntervalMs);

    const result = await promise;

    expect(result).toEqual(filledOrder);
    expect(logger.warn).toHaveBeenCalled(); // Warns about null order
  });

  it("should throw OrderFillTimeoutError when max attempts exceeded", async () => {
    vi.useRealTimers(); // Use real timers for this test

    const pendingOrder = createMockOrder({ status: "PENDING" });
    vi.mocked(adapter.getOrder).mockResolvedValue(pendingOrder);

    const shortConfig = createTestConfig({
      fillPollMaxAttempts: 3,
      fillPollIntervalMs: 1, // Very fast for real timers
      orderFillTimeoutMs: 10000,
    });

    await expect(confirmOrderFill(adapter, "order-1", shortConfig, logger)).rejects.toThrow(
      OrderFillTimeoutError,
    );
  });

  it("should throw OrderFillTimeoutError when time exceeds timeout", async () => {
    vi.useRealTimers(); // Use real timers for this test

    const pendingOrder = createMockOrder({ status: "PENDING" });
    vi.mocked(adapter.getOrder).mockResolvedValue(pendingOrder);

    const shortConfig = createTestConfig({
      orderFillTimeoutMs: 50, // Very short timeout
      fillPollIntervalMs: 1,
      fillPollMaxAttempts: 1000,
    });

    await expect(confirmOrderFill(adapter, "order-1", shortConfig, logger)).rejects.toThrow(
      OrderFillTimeoutError,
    );
  });
});
