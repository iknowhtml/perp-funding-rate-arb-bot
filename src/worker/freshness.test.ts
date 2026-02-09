import * as v from "valibot";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_FRESHNESS_CONFIG, FreshnessConfigSchema, isStateFresh } from "./freshness";
import { type BotState, createStateStore } from "./state";

describe("FreshnessConfigSchema", () => {
  it("should validate valid config", () => {
    const valid = {
      tickerStaleMs: 5000,
      fundingStaleMs: 60000,
      accountStaleMs: 45000,
    };
    expect(() => v.parse(FreshnessConfigSchema, valid)).not.toThrow();
  });

  it("should reject config with tickerStaleMs below minimum", () => {
    const invalid = {
      tickerStaleMs: 500, // Below 1000 minimum
      fundingStaleMs: 60000,
      accountStaleMs: 45000,
    };
    expect(() => v.parse(FreshnessConfigSchema, invalid)).toThrow();
  });

  it("should reject config with fundingStaleMs above maximum", () => {
    const invalid = {
      tickerStaleMs: 5000,
      fundingStaleMs: 400000, // Above 300000 maximum
      accountStaleMs: 45000,
    };
    expect(() => v.parse(FreshnessConfigSchema, invalid)).toThrow();
  });
});

describe("isStateFresh", () => {
  let stateStore: ReturnType<typeof createStateStore>;
  let state: BotState;

  beforeEach(() => {
    vi.useFakeTimers();
    stateStore = createStateStore();
    state = stateStore.getState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return false when WS is not connected", () => {
    const fresh = isStateFresh(state, DEFAULT_FRESHNESS_CONFIG);
    expect(fresh).toBe(false);
  });

  it("should return false when ticker is stale", () => {
    stateStore.setWsConnected(true);
    stateStore.updateTicker({
      symbol: "BTC-USD",
      bidPriceQuote: 50000000000n,
      askPriceQuote: 50001000000n,
      lastPriceQuote: 50000500000n,
      volumeBase: 1000000000n,
      timestamp: new Date(),
    });

    // Advance time beyond ticker staleness threshold
    vi.advanceTimersByTime(DEFAULT_FRESHNESS_CONFIG.tickerStaleMs + 1000);
    state = stateStore.getState();

    const fresh = isStateFresh(state, DEFAULT_FRESHNESS_CONFIG);
    expect(fresh).toBe(false);
  });

  it("should return false when funding rate is stale", () => {
    stateStore.setWsConnected(true);
    stateStore.updateTicker({
      symbol: "BTC-USD",
      bidPriceQuote: 50000000000n,
      askPriceQuote: 50001000000n,
      lastPriceQuote: 50000500000n,
      volumeBase: 1000000000n,
      timestamp: new Date(),
    });
    stateStore.updateFundingRate({
      symbol: "BTC-USD",
      rateBps: 10n,
      nextFundingTime: new Date(Date.now() + 3600000),
      timestamp: new Date(),
    });

    // Advance time beyond funding staleness threshold
    vi.advanceTimersByTime(DEFAULT_FRESHNESS_CONFIG.fundingStaleMs + 1000);
    state = stateStore.getState();

    const fresh = isStateFresh(state, DEFAULT_FRESHNESS_CONFIG);
    expect(fresh).toBe(false);
  });

  it("should return false when account data is stale", () => {
    stateStore.setWsConnected(true);
    stateStore.updateTicker({
      symbol: "BTC-USD",
      bidPriceQuote: 50000000000n,
      askPriceQuote: 50001000000n,
      lastPriceQuote: 50000500000n,
      volumeBase: 1000000000n,
      timestamp: new Date(),
    });
    stateStore.updateFundingRate({
      symbol: "BTC-USD",
      rateBps: 10n,
      nextFundingTime: new Date(Date.now() + 3600000),
      timestamp: new Date(),
    });
    stateStore.updateBalances([
      {
        asset: "USD",
        availableBase: 100000000n,
        heldBase: 0n,
        totalBase: 100000000n,
      },
    ]);

    // Advance time beyond account staleness threshold
    vi.advanceTimersByTime(DEFAULT_FRESHNESS_CONFIG.accountStaleMs + 1000);
    state = stateStore.getState();

    const fresh = isStateFresh(state, DEFAULT_FRESHNESS_CONFIG);
    expect(fresh).toBe(false);
  });

  it("should return true when all data sources are fresh", () => {
    stateStore.setWsConnected(true);
    stateStore.updateTicker({
      symbol: "BTC-USD",
      bidPriceQuote: 50000000000n,
      askPriceQuote: 50001000000n,
      lastPriceQuote: 50000500000n,
      volumeBase: 1000000000n,
      timestamp: new Date(),
    });
    stateStore.updateFundingRate({
      symbol: "BTC-USD",
      rateBps: 10n,
      nextFundingTime: new Date(Date.now() + 3600000),
      timestamp: new Date(),
    });
    stateStore.updateBalances([
      {
        asset: "USD",
        availableBase: 100000000n,
        heldBase: 0n,
        totalBase: 100000000n,
      },
    ]);

    state = stateStore.getState();
    const fresh = isStateFresh(state, DEFAULT_FRESHNESS_CONFIG);
    expect(fresh).toBe(true);
  });

  it("should return false when ticker update is null", () => {
    stateStore.setWsConnected(true);
    stateStore.updateFundingRate({
      symbol: "BTC-USD",
      rateBps: 10n,
      nextFundingTime: new Date(Date.now() + 3600000),
      timestamp: new Date(),
    });
    stateStore.updateBalances([
      {
        asset: "USD",
        availableBase: 100000000n,
        heldBase: 0n,
        totalBase: 100000000n,
      },
    ]);

    state = stateStore.getState();
    const fresh = isStateFresh(state, DEFAULT_FRESHNESS_CONFIG);
    expect(fresh).toBe(false);
  });
});
