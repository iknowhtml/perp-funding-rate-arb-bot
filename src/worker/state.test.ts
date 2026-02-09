import { describe, expect, it } from "vitest";

import type { Balance, FundingRate, Order, Position, Ticker } from "@/adapters/types";

import { createStateStore } from "./state";

describe("createStateStore", () => {
  it("should create state store with initial empty state", () => {
    const store = createStateStore();
    const state = store.getState();

    expect(state.ticker).toBeNull();
    expect(state.orderBook).toBeNull();
    expect(state.fundingRate).toBeNull();
    expect(state.balances.size).toBe(0);
    expect(state.positions.size).toBe(0);
    expect(state.openOrders.size).toBe(0);
    expect(state.lastTickerUpdate).toBeNull();
    expect(state.lastFundingUpdate).toBeNull();
    expect(state.lastAccountUpdate).toBeNull();
    expect(state.wsConnected).toBe(false);
  });

  describe("updateTicker", () => {
    it("should update ticker and lastTickerUpdate", () => {
      const store = createStateStore();
      const ticker: Ticker = {
        symbol: "BTC-USD",
        bidPriceQuote: 50000000000n,
        askPriceQuote: 50001000000n,
        lastPriceQuote: 50000500000n,
        volumeBase: 1000000000n,
        timestamp: new Date(),
      };

      store.updateTicker(ticker);
      const state = store.getState();

      expect(state.ticker).toEqual(ticker);
      expect(state.lastTickerUpdate).toBeInstanceOf(Date);
    });
  });

  describe("updateFundingRate", () => {
    it("should update funding rate and lastFundingUpdate", () => {
      const store = createStateStore();
      const fundingRate: FundingRate = {
        symbol: "BTC-USD",
        rateBps: 10n,
        nextFundingTime: new Date(Date.now() + 3600000),
        timestamp: new Date(),
      };

      store.updateFundingRate(fundingRate);
      const state = store.getState();

      expect(state.fundingRate).toEqual(fundingRate);
      expect(state.lastFundingUpdate).toBeInstanceOf(Date);
    });
  });

  describe("updateBalances", () => {
    it("should update balances map and lastAccountUpdate", () => {
      const store = createStateStore();
      const balances: Balance[] = [
        {
          asset: "USD",
          availableBase: 100000000n,
          heldBase: 0n,
          totalBase: 100000000n,
        },
        {
          asset: "BTC",
          availableBase: 1000000n,
          heldBase: 50000n,
          totalBase: 1050000n,
        },
      ];

      store.updateBalances(balances);
      const state = store.getState();

      expect(state.balances.size).toBe(2);
      expect(state.balances.get("USD")).toEqual(balances[0]);
      expect(state.balances.get("BTC")).toEqual(balances[1]);
      expect(state.lastAccountUpdate).toBeInstanceOf(Date);
    });

    it("should replace existing balances", () => {
      const store = createStateStore();
      const balances1: Balance[] = [
        {
          asset: "USD",
          availableBase: 100000000n,
          heldBase: 0n,
          totalBase: 100000000n,
        },
      ];
      const balances2: Balance[] = [
        {
          asset: "USD",
          availableBase: 200000000n,
          heldBase: 0n,
          totalBase: 200000000n,
        },
      ];

      store.updateBalances(balances1);
      store.updateBalances(balances2);
      const state = store.getState();

      expect(state.balances.size).toBe(1);
      expect(state.balances.get("USD")).toEqual(balances2[0]);
    });
  });

  describe("updatePositions", () => {
    it("should update positions map and lastAccountUpdate", () => {
      const store = createStateStore();
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

      store.updatePositions(positions);
      const state = store.getState();

      expect(state.positions.size).toBe(1);
      expect(state.positions.get("BTC-USD")).toEqual(positions[0]);
      expect(state.lastAccountUpdate).toBeInstanceOf(Date);
    });
  });

  describe("updateOrders", () => {
    it("should update orders map and lastAccountUpdate", () => {
      const store = createStateStore();
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

      store.updateOrders(orders);
      const state = store.getState();

      expect(state.openOrders.size).toBe(1);
      expect(state.openOrders.get("order-1")).toEqual(orders[0]);
      expect(state.lastAccountUpdate).toBeInstanceOf(Date);
    });
  });

  describe("setWsConnected", () => {
    it("should update wsConnected flag", () => {
      const store = createStateStore();
      store.setWsConnected(true);
      expect(store.getState().wsConnected).toBe(true);

      store.setWsConnected(false);
      expect(store.getState().wsConnected).toBe(false);
    });
  });

  describe("reset", () => {
    it("should reset state to initial empty state", () => {
      const store = createStateStore();
      store.updateTicker({
        symbol: "BTC-USD",
        bidPriceQuote: 50000000000n,
        askPriceQuote: 50001000000n,
        lastPriceQuote: 50000500000n,
        volumeBase: 1000000000n,
        timestamp: new Date(),
      });
      store.updateFundingRate({
        symbol: "BTC-USD",
        rateBps: 10n,
        nextFundingTime: new Date(),
        timestamp: new Date(),
      });
      store.updateBalances([
        {
          asset: "USD",
          availableBase: 100000000n,
          heldBase: 0n,
          totalBase: 100000000n,
        },
      ]);
      store.setWsConnected(true);

      store.reset();
      const state = store.getState();

      expect(state.ticker).toBeNull();
      expect(state.fundingRate).toBeNull();
      expect(state.balances.size).toBe(0);
      expect(state.wsConnected).toBe(false);
    });
  });

  describe("getState", () => {
    it("should return readonly state", () => {
      const store = createStateStore();
      const state = store.getState();

      // TypeScript should prevent mutation, but runtime check too
      expect(() => {
        // @ts-expect-error - Testing readonly behavior
        state.ticker = null;
      }).not.toThrow(); // Runtime doesn't enforce readonly, but TypeScript does
    });
  });
});
