import { describe, expect, it, vi } from "vitest";

import type { ExchangeAdapter, ExchangeOrder } from "@/adapters/types";
import type { Logger } from "@/lib/logger/logger";

import { calculateHedgeDrift, calculateOrderNotionalQuote, correctDrift } from "./drift";
import { DEFAULT_EXECUTION_CONFIG } from "./types";
import type { ExecutionConfig, HedgeDrift } from "./types";

/** Create a mock filled ExchangeOrder. */
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
  avgFillPriceQuote: 50000n,
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

describe("calculateOrderNotionalQuote", () => {
  it("should calculate notional from filled quantity and avg price", () => {
    const order = createMockOrder({
      filledQuantityBase: 1000n,
      avgFillPriceQuote: 50000n,
    });

    expect(calculateOrderNotionalQuote(order)).toBe(50000000n);
  });

  it("should return 0n when avgFillPriceQuote is null", () => {
    const order = createMockOrder({ avgFillPriceQuote: null });

    expect(calculateOrderNotionalQuote(order)).toBe(0n);
  });

  it("should return 0n when filledQuantityBase is 0", () => {
    const order = createMockOrder({ filledQuantityBase: 0n });

    expect(calculateOrderNotionalQuote(order)).toBe(0n);
  });
});

describe("calculateHedgeDrift", () => {
  const maxDriftBps = 50n; // 0.5%

  it("should return zero drift when notionals are equal", () => {
    const perp = createMockOrder({
      filledQuantityBase: 1000n,
      avgFillPriceQuote: 50000n,
    });
    const spot = createMockOrder({
      filledQuantityBase: 1000n,
      avgFillPriceQuote: 50000n,
    });

    const drift = calculateHedgeDrift(perp, spot, maxDriftBps);

    expect(drift.driftBps).toBe(0n);
    expect(drift.needsCorrection).toBe(false);
    expect(drift.perpNotionalQuote).toBe(50000000n);
    expect(drift.spotNotionalQuote).toBe(50000000n);
  });

  it("should detect small drift within tolerance", () => {
    const perp = createMockOrder({
      filledQuantityBase: 1000n,
      avgFillPriceQuote: 50000n, // Notional: 50000000
    });
    const spot = createMockOrder({
      filledQuantityBase: 1000n,
      avgFillPriceQuote: 50010n, // Notional: 50010000 (0.02% drift)
    });

    const drift = calculateHedgeDrift(perp, spot, maxDriftBps);

    expect(drift.driftBps).toBe(1n); // ~0.02% = ~2 bps, but integer division gives 1
    expect(drift.needsCorrection).toBe(false);
  });

  it("should flag correction when drift exceeds max", () => {
    const perp = createMockOrder({
      filledQuantityBase: 1000n,
      avgFillPriceQuote: 50000n, // Notional: 50,000,000
    });
    const spot = createMockOrder({
      filledQuantityBase: 1000n,
      avgFillPriceQuote: 50500n, // Notional: 50,500,000 (1% drift)
    });

    const drift = calculateHedgeDrift(perp, spot, maxDriftBps);

    // diff = 500,000, denominator = 50,500,000
    // driftBps = 500000 * 10000 / 50500000 = 99 bps
    expect(drift.driftBps).toBe(99n);
    expect(drift.needsCorrection).toBe(true);
  });

  it("should handle perp > spot notional", () => {
    const perp = createMockOrder({
      filledQuantityBase: 1000n,
      avgFillPriceQuote: 51000n, // Higher price
    });
    const spot = createMockOrder({
      filledQuantityBase: 1000n,
      avgFillPriceQuote: 50000n,
    });

    const drift = calculateHedgeDrift(perp, spot, maxDriftBps);

    expect(drift.perpNotionalQuote).toBeGreaterThan(drift.spotNotionalQuote);
    expect(drift.driftBps).toBeGreaterThan(0n);
  });

  it("should handle both notionals zero", () => {
    const perp = createMockOrder({
      filledQuantityBase: 0n,
      avgFillPriceQuote: 50000n,
    });
    const spot = createMockOrder({
      filledQuantityBase: 0n,
      avgFillPriceQuote: 50000n,
    });

    const drift = calculateHedgeDrift(perp, spot, maxDriftBps);

    expect(drift.driftBps).toBe(0n);
    expect(drift.needsCorrection).toBe(false);
  });

  it("should handle null fill prices", () => {
    const perp = createMockOrder({ avgFillPriceQuote: null });
    const spot = createMockOrder({ avgFillPriceQuote: null });

    const drift = calculateHedgeDrift(perp, spot, maxDriftBps);

    expect(drift.perpNotionalQuote).toBe(0n);
    expect(drift.spotNotionalQuote).toBe(0n);
    expect(drift.driftBps).toBe(0n);
    expect(drift.needsCorrection).toBe(false);
  });
});

describe("correctDrift", () => {
  const logger = createMockLogger();

  const createTestConfig = (): ExecutionConfig => ({
    ...DEFAULT_EXECUTION_CONFIG,
    orderFillTimeoutMs: 1000,
    fillPollIntervalMs: 10,
  });

  const midPriceQuote = 50000n;

  it("should not place orders when correction is not needed", async () => {
    const adapter = {
      createOrder: vi.fn(),
      getOrder: vi.fn(),
    } as unknown as ExchangeAdapter;

    const drift: HedgeDrift = {
      perpNotionalQuote: 50000000n,
      spotNotionalQuote: 50000000n,
      driftBps: 10n,
      needsCorrection: false,
    };

    await correctDrift(
      drift,
      adapter,
      "BTC-USD",
      "BTC-USD-PERP",
      midPriceQuote,
      createTestConfig(),
      logger,
    );

    expect(adapter.createOrder).not.toHaveBeenCalled();
  });

  it("should buy spot when perp notional > spot notional", async () => {
    const mockOrder = createMockOrder({ id: "correction-1" });
    const adapter = {
      createOrder: vi.fn().mockResolvedValue(mockOrder),
      getOrder: vi.fn().mockResolvedValue(mockOrder),
    } as unknown as ExchangeAdapter;

    const drift: HedgeDrift = {
      perpNotionalQuote: 51000000n,
      spotNotionalQuote: 50000000n,
      driftBps: 196n,
      needsCorrection: true,
    };

    await correctDrift(
      drift,
      adapter,
      "BTC-USD",
      "BTC-USD-PERP",
      midPriceQuote,
      createTestConfig(),
      logger,
    );

    expect(adapter.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: "BTC-USD",
        side: "BUY",
        type: "MARKET",
        quantityBase: 20n, // 1000000 / 50000 = 20
      }),
    );
  });

  it("should sell perp when spot notional > perp notional", async () => {
    const mockOrder = createMockOrder({ id: "correction-1" });
    const adapter = {
      createOrder: vi.fn().mockResolvedValue(mockOrder),
      getOrder: vi.fn().mockResolvedValue(mockOrder),
    } as unknown as ExchangeAdapter;

    const drift: HedgeDrift = {
      perpNotionalQuote: 50000000n,
      spotNotionalQuote: 51000000n,
      driftBps: 196n,
      needsCorrection: true,
    };

    await correctDrift(
      drift,
      adapter,
      "BTC-USD",
      "BTC-USD-PERP",
      midPriceQuote,
      createTestConfig(),
      logger,
    );

    expect(adapter.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: "BTC-USD-PERP",
        side: "SELL",
        type: "MARKET",
        quantityBase: 20n, // 1000000 / 50000 = 20
      }),
    );
  });

  it("should throw when midPriceQuote is zero", async () => {
    const adapter = {
      createOrder: vi.fn(),
      getOrder: vi.fn(),
    } as unknown as ExchangeAdapter;

    const drift: HedgeDrift = {
      perpNotionalQuote: 51000000n,
      spotNotionalQuote: 50000000n,
      driftBps: 196n,
      needsCorrection: true,
    };

    await expect(
      correctDrift(drift, adapter, "BTC-USD", "BTC-USD-PERP", 0n, createTestConfig(), logger),
    ).rejects.toThrow("Cannot correct drift");
  });

  it("should skip when correction rounds to zero base", async () => {
    const adapter = {
      createOrder: vi.fn(),
      getOrder: vi.fn(),
    } as unknown as ExchangeAdapter;

    const drift: HedgeDrift = {
      perpNotionalQuote: 50001n, // Very small diff: 1
      spotNotionalQuote: 50000n,
      driftBps: 196n,
      needsCorrection: true,
    };

    // With midPriceQuote=50000, diff=1 / 50000 = 0 base (rounds down)
    await correctDrift(
      drift,
      adapter,
      "BTC-USD",
      "BTC-USD-PERP",
      midPriceQuote,
      createTestConfig(),
      logger,
    );

    expect(adapter.createOrder).not.toHaveBeenCalled();
  });
});
