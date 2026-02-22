import { describe, expect, it } from "vitest";

import {
  calculateBaseUnitScale,
  calculateLiquidationDistanceBps,
  calculateMarginUtilizationBps,
  calculateNotionalQuote,
  calculateUnrealizedPnlQuote,
} from "./metrics";

describe("calculateBaseUnitScale", () => {
  it("should calculate scale for 8 decimals (BTC)", () => {
    expect(calculateBaseUnitScale(8)).toBe(100000000n);
  });

  it("should calculate scale for 18 decimals (ETH)", () => {
    expect(calculateBaseUnitScale(18)).toBe(1000000000000000000n);
  });

  it("should calculate scale for 6 decimals (USDC)", () => {
    expect(calculateBaseUnitScale(6)).toBe(1000000n);
  });

  it("should calculate scale for 0 decimals", () => {
    expect(calculateBaseUnitScale(0)).toBe(1n);
  });
});

describe("calculateNotionalQuote", () => {
  it("should calculate notional for LONG position", () => {
    const sizeBase = 100000000n; // 1 BTC (8 decimals)
    const markPriceQuote = 50000000000n; // $50,000 (6 decimals for USD = 50000000 * 1000)
    const baseDecimals = 8;

    // Expected: (100000000 * 50000000000) / 100000000 = 50000000000
    const result = calculateNotionalQuote(sizeBase, markPriceQuote, baseDecimals);
    expect(result).toBe(50000000000n);
  });

  it("should return zero for zero size", () => {
    const result = calculateNotionalQuote(0n, 50000000000n, 8);
    expect(result).toBe(0n);
  });

  it("should handle large numbers without precision loss", () => {
    const sizeBase = 9007199254740993n; // Larger than Number.MAX_SAFE_INTEGER
    const markPriceQuote = 100000000000n;
    const baseDecimals = 8;

    const result = calculateNotionalQuote(sizeBase, markPriceQuote, baseDecimals);
    expect(result).toBe((sizeBase * markPriceQuote) / 100000000n);
  });

  it("should handle fractional base units correctly", () => {
    const sizeBase = 50000000n; // 0.5 BTC (8 decimals)
    const markPriceQuote = 50000000000n; // $50,000
    const baseDecimals = 8;

    const result = calculateNotionalQuote(sizeBase, markPriceQuote, baseDecimals);
    expect(result).toBe(25000000000n); // Half the notional
  });
});

describe("calculateUnrealizedPnlQuote", () => {
  it("should calculate profit for LONG position", () => {
    const sizeBase = 100000000n; // 1 BTC
    const entryPriceQuote = 40000000000n; // $40,000 entry
    const markPriceQuote = 50000000000n; // $50,000 current
    const side = "LONG";
    const baseDecimals = 8;

    // Expected: (100000000 * 50000000000) / 100000000 - (100000000 * 40000000000) / 100000000
    // = 50000000000 - 40000000000 = 10000000000
    const result = calculateUnrealizedPnlQuote(
      sizeBase,
      entryPriceQuote,
      markPriceQuote,
      side,
      baseDecimals,
    );
    expect(result).toBe(10000000000n);
  });

  it("should calculate loss for LONG position", () => {
    const sizeBase = 100000000n; // 1 BTC
    const entryPriceQuote = 50000000000n; // $50,000 entry
    const markPriceQuote = 40000000000n; // $40,000 current
    const side = "LONG";
    const baseDecimals = 8;

    // Expected: 40000000000 - 50000000000 = -10000000000
    const result = calculateUnrealizedPnlQuote(
      sizeBase,
      entryPriceQuote,
      markPriceQuote,
      side,
      baseDecimals,
    );
    expect(result).toBe(-10000000000n);
  });

  it("should calculate profit for SHORT position", () => {
    const sizeBase = 100000000n; // 1 BTC
    const entryPriceQuote = 50000000000n; // $50,000 entry
    const markPriceQuote = 40000000000n; // $40,000 current
    const side = "SHORT";
    const baseDecimals = 8;

    // Expected: 50000000000 - 40000000000 = 10000000000
    const result = calculateUnrealizedPnlQuote(
      sizeBase,
      entryPriceQuote,
      markPriceQuote,
      side,
      baseDecimals,
    );
    expect(result).toBe(10000000000n);
  });

  it("should calculate loss for SHORT position", () => {
    const sizeBase = 100000000n; // 1 BTC
    const entryPriceQuote = 40000000000n; // $40,000 entry
    const markPriceQuote = 50000000000n; // $50,000 current
    const side = "SHORT";
    const baseDecimals = 8;

    // Expected: 40000000000 - 50000000000 = -10000000000
    const result = calculateUnrealizedPnlQuote(
      sizeBase,
      entryPriceQuote,
      markPriceQuote,
      side,
      baseDecimals,
    );
    expect(result).toBe(-10000000000n);
  });

  it("should return zero for zero size", () => {
    const result = calculateUnrealizedPnlQuote(0n, 40000000000n, 50000000000n, "LONG", 8);
    expect(result).toBe(0n);
  });
});

describe("calculateMarginUtilizationBps", () => {
  it("should calculate utilization for normal case", () => {
    const marginUsedQuote = 5000000000n; // $5,000
    const equityQuote = 10000000000n; // $10,000

    // Expected: (5000000000 * 10000) / 10000000000 = 5000 bps (50%)
    const result = calculateMarginUtilizationBps(marginUsedQuote, equityQuote);
    expect(result).toBe(5000n);
  });

  it("should return 100% for zero equity", () => {
    const marginUsedQuote = 5000000000n;
    const equityQuote = 0n;

    const result = calculateMarginUtilizationBps(marginUsedQuote, equityQuote);
    expect(result).toBe(10000n); // 100%
  });

  it("should calculate 100% utilization when margin equals equity", () => {
    const marginUsedQuote = 10000000000n;
    const equityQuote = 10000000000n;

    const result = calculateMarginUtilizationBps(marginUsedQuote, equityQuote);
    expect(result).toBe(10000n); // 100%
  });

  it("should handle fractional utilization", () => {
    const marginUsedQuote = 2500000000n; // $2,500
    const equityQuote = 10000000000n; // $10,000

    // Expected: (2500000000 * 10000) / 10000000000 = 2500 bps (25%)
    const result = calculateMarginUtilizationBps(marginUsedQuote, equityQuote);
    expect(result).toBe(2500n);
  });
});

describe("calculateLiquidationDistanceBps", () => {
  it("should calculate distance for LONG position", () => {
    const markPriceQuote = 50000000000n; // $50,000
    const liquidationPriceQuote = 40000000000n; // $40,000
    const side = "LONG";

    // Expected: ((50000000000 - 40000000000) * 10000) / 50000000000 = 2000n
    const result = calculateLiquidationDistanceBps(markPriceQuote, liquidationPriceQuote, side);
    expect(result).toBe(2000n); // 20% buffer
  });

  it("should calculate distance for SHORT position", () => {
    const markPriceQuote = 40000000000n; // $40,000
    const liquidationPriceQuote = 50000000000n; // $50,000
    const side = "SHORT";

    // For SHORT: liquidation is above mark, we're safe
    // Distance = (liquidationPrice - markPrice) / markPrice = (50k - 40k) / 40k = 0.25 = 2500 bps
    const result = calculateLiquidationDistanceBps(markPriceQuote, liquidationPriceQuote, side);
    expect(result).toBe(2500n); // 25% buffer
  });

  it("should return 100% buffer for null liquidation price", () => {
    const result = calculateLiquidationDistanceBps(50000000000n, null, "LONG");
    expect(result).toBe(10000n); // 100%
  });

  it("should return 100% buffer for null side", () => {
    const result = calculateLiquidationDistanceBps(50000000000n, 40000000000n, null);
    expect(result).toBe(10000n); // 100%
  });

  it("should return zero when already past liquidation for LONG", () => {
    const markPriceQuote = 40000000000n; // $40,000 (at or below liquidation)
    const liquidationPriceQuote = 50000000000n; // $50,000
    const side = "LONG";

    // Mark is at or below liquidation, so we're liquidated
    const result = calculateLiquidationDistanceBps(markPriceQuote, liquidationPriceQuote, side);
    expect(result).toBe(0n); // Already liquidated
  });

  it("should return zero when already past liquidation for SHORT", () => {
    const markPriceQuote = 50000000000n; // $50,000 (at or above liquidation)
    const liquidationPriceQuote = 40000000000n; // $40,000
    const side = "SHORT";

    // Mark is at or above liquidation, so we're liquidated
    const result = calculateLiquidationDistanceBps(markPriceQuote, liquidationPriceQuote, side);
    expect(result).toBe(0n); // Already liquidated
  });
});
