import { describe, expect, it } from "vitest";

import type { DerivedPosition } from "@/domains/position";

import { evaluateHealthResponse } from "./health";
import type { HealthSnapshot } from "./health";

const createOpenPosition = (overrides?: Partial<DerivedPosition>): DerivedPosition => ({
  open: true,
  side: "SHORT",
  spotQuantityBase: 100000n,
  perpQuantityBase: 100000n,
  notionalQuote: 5_000_000_000_000n,
  entryTime: new Date(Date.now() - 10_000),
  entryPriceQuote: 50_000_000_000_000n,
  entryFundingRateBps: 10n,
  markPriceQuote: 50_000_000_000_000n,
  unrealizedPnlQuote: 0n,
  fundingAccruedQuote: 0n,
  marginUsedQuote: 500_000_000_000n,
  marginBufferBps: 2000n,
  liquidationPriceQuote: null,
  liquidationDistanceBps: 10000n,
  lastUpdated: new Date(),
  source: "rest",
  ...overrides,
});

const createClosedPosition = (): DerivedPosition => ({
  ...createOpenPosition(),
  open: false,
  side: null,
  spotQuantityBase: 0n,
  perpQuantityBase: 0n,
  notionalQuote: 0n,
  entryTime: null,
  entryPriceQuote: null,
  entryFundingRateBps: null,
  marginUsedQuote: 0n,
  marginBufferBps: 10000n,
});

describe("evaluateHealthResponse", () => {
  it("returns EMERGENCY_EXIT when both feeds down and position open", () => {
    const snapshot: HealthSnapshot = {
      restFresh: false,
      wsFresh: false,
      position: createOpenPosition(),
    };
    expect(evaluateHealthResponse(snapshot)).toEqual({
      action: "EMERGENCY_EXIT",
      reason: "all_feeds_down",
    });
  });

  it("returns FULL_PAUSE when both feeds down and no position", () => {
    const snapshot: HealthSnapshot = {
      restFresh: false,
      wsFresh: false,
      position: null,
    };
    expect(evaluateHealthResponse(snapshot)).toEqual({ action: "FULL_PAUSE" });
  });

  it("returns FULL_PAUSE when both feeds down and position closed", () => {
    const snapshot: HealthSnapshot = {
      restFresh: false,
      wsFresh: false,
      position: createClosedPosition(),
    };
    expect(evaluateHealthResponse(snapshot)).toEqual({ action: "FULL_PAUSE" });
  });

  it("returns PAUSE_ENTRIES when WS stale and no position", () => {
    const snapshot: HealthSnapshot = {
      restFresh: true,
      wsFresh: false,
      position: null,
    };
    expect(evaluateHealthResponse(snapshot)).toEqual({ action: "PAUSE_ENTRIES" });
  });

  it("returns FORCE_EXIT when WS stale and position open for > 30s", () => {
    const snapshot: HealthSnapshot = {
      restFresh: true,
      wsFresh: false,
      position: createOpenPosition({
        entryTime: new Date(Date.now() - 35_000),
      }),
    };
    expect(evaluateHealthResponse(snapshot)).toEqual({
      action: "FORCE_EXIT",
      reason: "ws_stale_with_position",
    });
  });

  it("returns PAUSE_ENTRIES when WS stale and position open but age < 30s", () => {
    const snapshot: HealthSnapshot = {
      restFresh: true,
      wsFresh: false,
      position: createOpenPosition({
        entryTime: new Date(Date.now() - 5_000),
      }),
    };
    expect(evaluateHealthResponse(snapshot)).toEqual({ action: "PAUSE_ENTRIES" });
  });

  it("returns FORCE_EXIT when REST failing, position open, and low margin buffer", () => {
    const snapshot: HealthSnapshot = {
      restFresh: false,
      wsFresh: true,
      position: createOpenPosition({ marginBufferBps: 400n }),
    };
    expect(evaluateHealthResponse(snapshot)).toEqual({
      action: "FORCE_EXIT",
      reason: "rest_failing_low_margin",
    });
  });

  it("returns REDUCE_RISK when REST failing and position open with sufficient margin", () => {
    const snapshot: HealthSnapshot = {
      restFresh: false,
      wsFresh: true,
      position: createOpenPosition({ marginBufferBps: 1000n }),
    };
    expect(evaluateHealthResponse(snapshot)).toEqual({ action: "REDUCE_RISK" });
  });

  it("returns CONTINUE when all fresh and no position", () => {
    const snapshot: HealthSnapshot = {
      restFresh: true,
      wsFresh: true,
      position: null,
    };
    expect(evaluateHealthResponse(snapshot)).toEqual({ action: "CONTINUE" });
  });

  it("returns CONTINUE when all fresh and position open", () => {
    const snapshot: HealthSnapshot = {
      restFresh: true,
      wsFresh: true,
      position: createOpenPosition(),
    };
    expect(evaluateHealthResponse(snapshot)).toEqual({ action: "CONTINUE" });
  });
});
