import { describe, expect, it } from "vitest";

import { DEFAULT_RISK_CONFIG } from "./config";
import type { RiskConfig } from "./config";
import { calculateMaxPositionSizeQuote } from "./position-sizing";

/** USDC scale factor: 10^6 */
const QUOTE_SCALE = 1_000_000n;

describe("calculateMaxPositionSizeQuote", () => {
  const config = DEFAULT_RISK_CONFIG;

  it("should return capital-based limit when smaller than config limit", () => {
    // Available capital: $1,000 at 3x leverage = $3,000 max by capital
    // Config limit: $10,000
    // Expected: $3,000 (capital-limited)
    const result = calculateMaxPositionSizeQuote(
      2_000n * QUOTE_SCALE, // $2,000 equity
      1_000n * QUOTE_SCALE, // $1,000 margin used
      config,
    );

    // Available: $1,000 * 3x = $3,000
    expect(result).toBe(3_000n * QUOTE_SCALE);
  });

  it("should return config limit when smaller than capital-based limit", () => {
    // Available capital: $100,000 at 3x leverage = $300,000 max by capital
    // Config limit: $10,000
    // Expected: $10,000 (config-limited)
    const result = calculateMaxPositionSizeQuote(
      200_000n * QUOTE_SCALE, // $200,000 equity
      100_000n * QUOTE_SCALE, // $100,000 margin used
      config,
    );

    expect(result).toBe(10_000n * QUOTE_SCALE);
  });

  it("should return 0 when no available capital", () => {
    const result = calculateMaxPositionSizeQuote(
      10_000n * QUOTE_SCALE, // $10,000 equity
      10_000n * QUOTE_SCALE, // $10,000 margin used (all used)
      config,
    );

    expect(result).toBe(0n);
  });

  it("should return 0 when margin exceeds equity", () => {
    const result = calculateMaxPositionSizeQuote(
      5_000n * QUOTE_SCALE, // $5,000 equity
      8_000n * QUOTE_SCALE, // $8,000 margin used (underwater)
      config,
    );

    expect(result).toBe(0n);
  });

  it("should return 0 when equity is zero", () => {
    const result = calculateMaxPositionSizeQuote(0n, 0n, config);

    expect(result).toBe(0n);
  });

  it("should respect custom leverage limits", () => {
    const customConfig: RiskConfig = {
      ...config,
      maxLeverageBps: 10000, // 1x leverage
    };

    // Available capital: $10,000 at 1x = $10,000 max by capital
    // Config limit: $10,000
    // Expected: $10,000
    const result = calculateMaxPositionSizeQuote(
      20_000n * QUOTE_SCALE, // $20,000 equity
      10_000n * QUOTE_SCALE, // $10,000 margin used
      customConfig,
    );

    expect(result).toBe(10_000n * QUOTE_SCALE);
  });

  it("should respect custom position size limits", () => {
    const customConfig: RiskConfig = {
      ...config,
      maxPositionSizeUsd: 500, // $500 max
    };

    // Available capital: $10,000 at 3x = $30,000 max by capital
    // Config limit: $500
    // Expected: $500 (config-limited)
    const result = calculateMaxPositionSizeQuote(
      20_000n * QUOTE_SCALE,
      10_000n * QUOTE_SCALE,
      customConfig,
    );

    expect(result).toBe(500n * QUOTE_SCALE);
  });
});
