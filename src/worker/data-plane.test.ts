import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  Balance,
  ExchangeAdapter,
  FundingRate,
  Order,
  Position,
  Ticker,
} from "@/adapters/types";
import type { Logger } from "@/lib/logger";

import { createDataPlane } from "./data-plane";
import { createStateStore } from "./state";

describe("createDataPlane", () => {
  let mockAdapter: ExchangeAdapter;
  let mockLogger: Logger;
  let stateStore: ReturnType<typeof createStateStore>;

  beforeEach(() => {
    vi.useFakeTimers();

    mockAdapter = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      isConnected: vi.fn().mockReturnValue(true),
      getBalance: vi.fn(),
      getBalances: vi.fn().mockResolvedValue([]),
      createOrder: vi.fn(),
      cancelOrder: vi.fn(),
      getOrder: vi.fn(),
      getOpenOrders: vi.fn().mockResolvedValue([]),
      getPosition: vi.fn(),
      getPositions: vi.fn().mockResolvedValue([]),
      getTicker: vi.fn(),
      getFundingRate: vi.fn().mockResolvedValue({
        symbol: "BTC-USD",
        rateBps: 10n,
        nextFundingTime: new Date(),
        timestamp: new Date(),
      } as FundingRate),
      getOrderBook: vi.fn(),
      subscribeTicker: vi.fn(),
      unsubscribeTicker: vi.fn(),
    };

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
    it("should connect adapter and start polling", async () => {
      const dataPlane = createDataPlane({
        adapter: mockAdapter,
        stateStore,
        logger: mockLogger,
        symbols: ["BTC-USD"],
      });

      await dataPlane.start();

      expect(mockAdapter.connect).toHaveBeenCalledTimes(1);
      expect(mockAdapter.subscribeTicker).toHaveBeenCalledWith("BTC-USD", expect.any(Function));
      expect(mockAdapter.getFundingRate).toHaveBeenCalledWith("BTC-USD");
      expect(mockAdapter.getBalances).toHaveBeenCalled();
      expect(stateStore.getState().wsConnected).toBe(true);
      expect(dataPlane.isRunning()).toBe(true);
    });

    it("should subscribe to multiple symbols", async () => {
      const dataPlane = createDataPlane({
        adapter: mockAdapter,
        stateStore,
        logger: mockLogger,
        symbols: ["BTC-USD", "ETH-USD"],
      });

      await dataPlane.start();

      expect(mockAdapter.subscribeTicker).toHaveBeenCalledTimes(2);
      expect(mockAdapter.subscribeTicker).toHaveBeenCalledWith("BTC-USD", expect.any(Function));
      expect(mockAdapter.subscribeTicker).toHaveBeenCalledWith("ETH-USD", expect.any(Function));
    });

    it("should poll funding rate at configured interval", async () => {
      const dataPlane = createDataPlane({
        adapter: mockAdapter,
        stateStore,
        logger: mockLogger,
        symbols: ["BTC-USD"],
        fundingPollIntervalMs: 1000,
      });

      await dataPlane.start();
      vi.advanceTimersByTime(2500);

      // Initial poll + 2 interval polls
      expect(mockAdapter.getFundingRate).toHaveBeenCalledTimes(3);
    });

    it("should poll account data at configured interval", async () => {
      const dataPlane = createDataPlane({
        adapter: mockAdapter,
        stateStore,
        logger: mockLogger,
        symbols: ["BTC-USD"],
        accountPollIntervalMs: 1000,
      });

      await dataPlane.start();
      vi.advanceTimersByTime(2500);

      // Initial poll + 2 interval polls
      expect(mockAdapter.getBalances).toHaveBeenCalledTimes(3);
      expect(mockAdapter.getPositions).toHaveBeenCalledTimes(3);
      expect(mockAdapter.getOpenOrders).toHaveBeenCalledTimes(3);
    });

    it("should handle ticker updates via callback", async () => {
      const dataPlane = createDataPlane({
        adapter: mockAdapter,
        stateStore,
        logger: mockLogger,
        symbols: ["BTC-USD"],
      });

      await dataPlane.start();

      // Get the callback passed to subscribeTicker
      const subscribeCall = vi.mocked(mockAdapter.subscribeTicker).mock.calls[0];
      const tickerCallback = subscribeCall[1] as (ticker: Ticker) => void;

      const ticker: Ticker = {
        symbol: "BTC-USD",
        bidPriceQuote: 50000000000n,
        askPriceQuote: 50001000000n,
        lastPriceQuote: 50000500000n,
        volumeBase: 1000000000n,
        timestamp: new Date(),
      };

      tickerCallback(ticker);

      expect(stateStore.getState().ticker).toEqual(ticker);
      expect(mockLogger.debug).toHaveBeenCalledWith("Ticker updated", {
        symbol: "BTC-USD",
      });
    });

    it("should update state store with account data", async () => {
      const balances: Balance[] = [
        {
          asset: "USD",
          availableBase: 100000000n,
          heldBase: 0n,
          totalBase: 100000000n,
        },
      ];
      const positions: Position[] = [
        {
          symbol: "BTC-USD",
          side: "SHORT",
          sizeBase: 1000000n,
          entryPriceQuote: 50000000000n,
          markPriceQuote: 50001000000n,
          liquidationPriceQuote: null,
          unrealizedPnlQuote: -100000n,
          leverageBps: 10000n,
          marginQuote: 5000000000n,
        },
      ];
      const orders: Order[] = [
        {
          id: "order-1",
          exchangeOrderId: "ex-1",
          symbol: "BTC-USD",
          side: "BUY",
          type: "MARKET",
          status: "OPEN",
          quantityBase: 1000000n,
          filledQuantityBase: 0n,
          priceQuote: null,
          avgFillPriceQuote: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      vi.mocked(mockAdapter.getBalances).mockResolvedValue(balances);
      vi.mocked(mockAdapter.getPositions).mockResolvedValue(positions);
      vi.mocked(mockAdapter.getOpenOrders).mockResolvedValue(orders);

      const dataPlane = createDataPlane({
        adapter: mockAdapter,
        stateStore,
        logger: mockLogger,
        symbols: ["BTC-USD"],
      });

      await dataPlane.start();
      // Wait for initial poll to complete
      await vi.runOnlyPendingTimersAsync();

      const state = stateStore.getState();
      expect(state.balances.get("USD")).toEqual(balances[0]);
      expect(state.positions.get("BTC-USD")).toEqual(positions[0]);
      expect(state.openOrders.get("order-1")).toEqual(orders[0]);
    });

    it("should handle adapter connection failure", async () => {
      vi.mocked(mockAdapter.connect).mockRejectedValue(new Error("Connection failed"));

      const dataPlane = createDataPlane({
        adapter: mockAdapter,
        stateStore,
        logger: mockLogger,
        symbols: ["BTC-USD"],
      });

      await expect(dataPlane.start()).rejects.toThrow("Connection failed");
      expect(stateStore.getState().wsConnected).toBe(false);
      expect(dataPlane.isRunning()).toBe(false);
    });

    it("should log errors on polling failures", async () => {
      vi.mocked(mockAdapter.getFundingRate).mockRejectedValue(
        new Error("Funding rate fetch failed"),
      );

      const dataPlane = createDataPlane({
        adapter: mockAdapter,
        stateStore,
        logger: mockLogger,
        symbols: ["BTC-USD"],
      });

      await dataPlane.start();
      // Wait for initial poll to complete
      await vi.runOnlyPendingTimersAsync();

      expect(mockLogger.error).toHaveBeenCalledWith("Funding rate poll failed", {
        error: expect.any(Error),
      });
    });

    it("should not start if already running", async () => {
      const dataPlane = createDataPlane({
        adapter: mockAdapter,
        stateStore,
        logger: mockLogger,
        symbols: ["BTC-USD"],
      });

      await dataPlane.start();
      await dataPlane.start();

      expect(mockAdapter.connect).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith("Data plane already running");
    });
  });

  describe("stop", () => {
    it("should disconnect adapter and stop polling", async () => {
      const dataPlane = createDataPlane({
        adapter: mockAdapter,
        stateStore,
        logger: mockLogger,
        symbols: ["BTC-USD"],
      });

      await dataPlane.start();
      await dataPlane.stop();

      expect(mockAdapter.unsubscribeTicker).toHaveBeenCalledWith("BTC-USD");
      expect(mockAdapter.disconnect).toHaveBeenCalledTimes(1);
      expect(stateStore.getState().wsConnected).toBe(false);
      expect(dataPlane.isRunning()).toBe(false);
    });

    it("should unsubscribe from all symbols", async () => {
      const dataPlane = createDataPlane({
        adapter: mockAdapter,
        stateStore,
        logger: mockLogger,
        symbols: ["BTC-USD", "ETH-USD"],
      });

      await dataPlane.start();
      await dataPlane.stop();

      expect(mockAdapter.unsubscribeTicker).toHaveBeenCalledTimes(2);
      expect(mockAdapter.unsubscribeTicker).toHaveBeenCalledWith("BTC-USD");
      expect(mockAdapter.unsubscribeTicker).toHaveBeenCalledWith("ETH-USD");
    });

    it("should stop polling after stop", async () => {
      const dataPlane = createDataPlane({
        adapter: mockAdapter,
        stateStore,
        logger: mockLogger,
        symbols: ["BTC-USD"],
        fundingPollIntervalMs: 1000,
      });

      await dataPlane.start();
      const initialCallCount = vi.mocked(mockAdapter.getFundingRate).mock.calls.length;

      await dataPlane.stop();
      vi.advanceTimersByTime(2000);

      // No additional calls after stop
      expect(mockAdapter.getFundingRate).toHaveBeenCalledTimes(initialCallCount);
    });

    it("should handle stop when not running", async () => {
      const dataPlane = createDataPlane({
        adapter: mockAdapter,
        stateStore,
        logger: mockLogger,
        symbols: ["BTC-USD"],
      });

      await dataPlane.stop();

      expect(mockAdapter.disconnect).not.toHaveBeenCalled();
    });
  });

  describe("isRunning", () => {
    it("should return false initially", () => {
      const dataPlane = createDataPlane({
        adapter: mockAdapter,
        stateStore,
        logger: mockLogger,
        symbols: ["BTC-USD"],
      });

      expect(dataPlane.isRunning()).toBe(false);
    });

    it("should return true after start", async () => {
      const dataPlane = createDataPlane({
        adapter: mockAdapter,
        stateStore,
        logger: mockLogger,
        symbols: ["BTC-USD"],
      });

      await dataPlane.start();
      expect(dataPlane.isRunning()).toBe(true);
    });

    it("should return false after stop", async () => {
      const dataPlane = createDataPlane({
        adapter: mockAdapter,
        stateStore,
        logger: mockLogger,
        symbols: ["BTC-USD"],
      });

      await dataPlane.start();
      await dataPlane.stop();
      expect(dataPlane.isRunning()).toBe(false);
    });
  });
});
