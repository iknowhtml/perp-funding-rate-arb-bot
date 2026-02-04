/**
 * Tests for Coinbase normalizers.
 */

import { describe, expect, it } from "vitest";

import { normalizeFundingRate, parseDecimalToBigInt, parseRateToBps } from "./normalizers";

describe("parseRateToBps", () => {
  it("should convert decimal rate to basis points", () => {
    expect(parseRateToBps("0.0001")).toBe(1n); // 0.01% = 1 bps
    expect(parseRateToBps("0.001")).toBe(10n); // 0.1% = 10 bps
    expect(parseRateToBps("0.01")).toBe(100n); // 1% = 100 bps
    expect(parseRateToBps("-0.0005")).toBe(-5n); // -0.05% = -5 bps
  });

  it("should handle zero", () => {
    expect(parseRateToBps("0")).toBe(0n);
    expect(parseRateToBps("0.0")).toBe(0n);
  });
});

describe("parseDecimalToBigInt", () => {
  it("should parse decimal string to bigint with given scale", () => {
    expect(parseDecimalToBigInt("123.45", 2)).toBe(12345n);
    expect(parseDecimalToBigInt("1000", 8)).toBe(100000000000n);
    expect(parseDecimalToBigInt("0.00000001", 8)).toBe(1n);
  });

  it("should pad fractional part to required decimals", () => {
    expect(parseDecimalToBigInt("1.5", 4)).toBe(15000n);
    expect(parseDecimalToBigInt("1", 4)).toBe(10000n);
  });

  it("should truncate fractional part if too long", () => {
    expect(parseDecimalToBigInt("1.123456789", 4)).toBe(11234n);
  });
});

describe("normalizeFundingRate", () => {
  it("should normalize product response to FundingRate", () => {
    const response = {
      productId: "BTC-PERP",
      futureProductDetails: {
        perpetualDetails: {
          fundingRate: "0.0003",
          fundingTime: "2026-02-04T08:00:00.000Z",
        },
      },
    };

    const result = normalizeFundingRate(response);

    expect(result.symbol).toBe("BTC-PERP");
    expect(result.rateBps).toBe(3n);
    expect(result.nextFundingTime).toBeInstanceOf(Date);
    expect(result.timestamp).toBeInstanceOf(Date);
  });

  it("should handle missing perpetual details", () => {
    const response = { productId: "BTC-USD" };

    const result = normalizeFundingRate(response);

    expect(result.symbol).toBe("BTC-USD");
    expect(result.rateBps).toBe(0n);
    expect(result.nextFundingTime).toBeInstanceOf(Date);
  });

  it("should handle missing funding rate", () => {
    const response = {
      productId: "ETH-PERP",
      futureProductDetails: {
        perpetualDetails: {
          fundingTime: "2026-02-04T08:00:00.000Z",
        },
      },
    };

    const result = normalizeFundingRate(response);

    expect(result.symbol).toBe("ETH-PERP");
    expect(result.rateBps).toBe(0n);
  });

  it("should throw on invalid response", () => {
    expect(() => normalizeFundingRate(null)).toThrow();
    expect(() => normalizeFundingRate({})).toThrow();
    expect(() => normalizeFundingRate({ productId: 123 })).toThrow();
  });
});
