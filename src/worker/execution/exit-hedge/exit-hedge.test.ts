import { describe, expect, it, vi } from "vitest";

import type { GmxAdapter } from "@/adapters/gmx";
import type { ExchangeOrder } from "@/adapters/types";
import type { Logger } from "@/lib/logger";

import { DEFAULT_EXECUTION_CONFIG, ExecutionError } from "../types";
import type { ExecutionConfig } from "../types";
import { executeExitHedge, verifyFlatPosition } from "./exit-hedge";
import type { ExitHedgeDeps, ExitHedgeExecutionParams } from "./exit-hedge";

/** USDC scale factor: 10^6 */
const QUOTE_SCALE = 1_000_000n;

/** Create a mock filled order. */
const _createFilledOrder = (overrides?: Partial<ExchangeOrder>): ExchangeOrder => ({
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

const GMX_MARKET = "0x47c031236e19d024b42f8AE6780E44A573170703";

const createDefaultDeps = (overrides?: {
  adapter?: Partial<GmxAdapter>;
}): ExitHedgeDeps => {
  const adapter: GmxAdapter = {
    getMarketsInfo: vi.fn().mockResolvedValue([]),
    getTickers: vi.fn().mockResolvedValue([]),
    getPositionState: vi.fn().mockResolvedValue(null),
    getLiquidityBalance: vi.fn().mockResolvedValue({ pool: "default", balance: 0n }),
    simulateOrder: vi.fn().mockResolvedValue({ impactBps: 0n }),
    submitOrder: vi.fn().mockResolvedValue({ hash: "0x", success: true }),
    ...overrides?.adapter,
  };

  return {
    adapter,
    executionConfig: { ...createTestConfig(), gmxMarketAddress: GMX_MARKET },
    logger: createMockLogger(),
  };
};

describe("verifyFlatPosition", () => {
  it("should return true when position state has no perp position", async () => {
    const adapter = createDefaultDeps().adapter;
    vi.mocked(adapter.getPositionState).mockResolvedValue(null);

    const result = await verifyFlatPosition(adapter, "BTC-USD", "BTC-USD-PERP", GMX_MARKET);

    expect(result).toBe(true);
    expect(adapter.getPositionState).toHaveBeenCalledWith(GMX_MARKET);
  });

  it("should return true when perp position has zero size", async () => {
    const adapter = createDefaultDeps().adapter;
    vi.mocked(adapter.getPositionState).mockResolvedValue({
      ts: new Date(),
      market: GMX_MARKET,
      perpPosition: { sizeUsd: 0n, entryPrice: 0n, pnlUsd: 0n, liquidationPrice: null },
      gmBalance: 0n,
      gmCostBasisUsd: 0n,
      gmMtmValueUsd: 0n,
    });

    const result = await verifyFlatPosition(adapter, "BTC-USD", "BTC-USD-PERP", GMX_MARKET);

    expect(result).toBe(true);
  });

  it("should return false when perp position has size", async () => {
    const adapter = createDefaultDeps().adapter;
    vi.mocked(adapter.getPositionState).mockResolvedValue({
      ts: new Date(),
      market: GMX_MARKET,
      perpPosition: {
        sizeUsd: 100000n,
        entryPrice: 50000n * QUOTE_SCALE,
        pnlUsd: 0n,
        liquidationPrice: null,
      },
      gmBalance: 0n,
      gmCostBasisUsd: 0n,
      gmMtmValueUsd: 0n,
    });

    const result = await verifyFlatPosition(adapter, "BTC-USD", "BTC-USD-PERP", GMX_MARKET);

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

  it("should throw when exit hedge not implemented for GMX", async () => {
    const deps = createDefaultDeps();
    const params = createDefaultParams();

    await expect(executeExitHedge(params, deps)).rejects.toThrow(ExecutionError);
    await expect(executeExitHedge(params, deps)).rejects.toThrow("not yet implemented for GMX");
  });

  it("should return aborted when gmxMarketAddress not set", async () => {
    const { gmxMarketAddress: _omit, ...configWithoutMarket } = createTestConfig();
    const deps = createDefaultDeps();
    deps.executionConfig = configWithoutMarket as ExecutionConfig;
    const params = createDefaultParams();

    const result = await executeExitHedge(params, deps);

    expect(result.success).toBe(false);
    expect(result.aborted).toBe(true);
    expect(result.reason).toContain("GMX market address not configured");
  });
});
