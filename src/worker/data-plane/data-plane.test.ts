import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Logger } from "@/lib/logger";
import type { ProtocolAdapter } from "@/lib/protocols";

import { createStateStore } from "../state";
import { createDataPlane } from "./data-plane";

const GMX_MARKET = "0x47c031236e19d024b42f8AE6780E44A573170703";
/** Valid GM token address so getLiquidityBalance is invoked (Arbitrum). */
const GMX_POOL = "0x4277f8f2c384827b5273592ff7cebd9f2c1ac258";

const createMockProtocolAdapter = (): ProtocolAdapter => ({
  getMarketsInfo: vi.fn().mockResolvedValue([]),
  getTickers: vi.fn().mockResolvedValue([]),
  getPositionState: vi.fn().mockResolvedValue(null),
  getLiquidityBalance: vi.fn().mockResolvedValue({ pool: GMX_POOL, balance: 0n }),
  simulateOrder: vi.fn().mockResolvedValue({ impactBps: 0n }),
  submitOrder: vi.fn().mockResolvedValue({ hash: "0x", success: true }),
});

describe("createDataPlane", () => {
  let mockAdapter: ProtocolAdapter;
  let mockLogger: Logger;
  let stateStore: ReturnType<typeof createStateStore>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockAdapter = createMockProtocolAdapter();
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    stateStore = createStateStore();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("start", () => {
    it("should start polling and call getMarketsInfo and getTickers", async () => {
      const dataPlane = createDataPlane({
        adapter: mockAdapter,
        stateStore,
        logger: mockLogger,
        symbols: ["BTC-USD"],
        gmxMarket: GMX_MARKET,
        gmxPool: GMX_POOL,
      });

      await dataPlane.start();

      expect(mockAdapter.getMarketsInfo).toHaveBeenCalled();
      expect(mockAdapter.getTickers).toHaveBeenCalled();
      expect(mockAdapter.getPositionState).toHaveBeenCalledWith(GMX_MARKET);
      expect(mockAdapter.getLiquidityBalance).toHaveBeenCalledWith(GMX_POOL);
      expect(dataPlane.isRunning()).toBe(true);
    });

    it("should poll at configured intervals", async () => {
      const dataPlane = createDataPlane({
        adapter: mockAdapter,
        stateStore,
        logger: mockLogger,
        symbols: ["BTC-USD"],
        gmxMarket: GMX_MARKET,
        gmxPool: GMX_POOL,
        fundingPollIntervalMs: 1000,
        accountPollIntervalMs: 1000,
      });

      await dataPlane.start();
      vi.advanceTimersByTime(2500);

      expect(mockAdapter.getMarketsInfo).toHaveBeenCalled();
      expect(mockAdapter.getTickers).toHaveBeenCalled();
      expect(mockAdapter.getPositionState).toHaveBeenCalled();
      expect(mockAdapter.getLiquidityBalance).toHaveBeenCalled();
    });
  });

  describe("stop", () => {
    it("should stop polling and set running to false", async () => {
      const dataPlane = createDataPlane({
        adapter: mockAdapter,
        stateStore,
        logger: mockLogger,
        symbols: ["BTC-USD"],
        gmxMarket: GMX_MARKET,
        gmxPool: GMX_POOL,
      });

      await dataPlane.start();
      expect(dataPlane.isRunning()).toBe(true);

      await dataPlane.stop();
      expect(dataPlane.isRunning()).toBe(false);
    });
  });
});
