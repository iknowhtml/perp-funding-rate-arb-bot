import { describe, expect, it } from "vitest";

import { DEFAULT_STRATEGY_CONFIG } from "./config";
import type { StrategyConfig } from "./config";
import {
  analyzeFundingRateTrend,
  bigintSqrt,
  calculateSma,
  calculateStdDev,
} from "./trend-analysis";
import type { FundingRateSnapshot } from "./types";

const createSnapshot = (
  currentRateBps: bigint,
  predictedRateBps: bigint = currentRateBps,
  timestamp: Date = new Date(),
): FundingRateSnapshot => ({
  symbol: "BTC-USD",
  currentRateBps,
  predictedRateBps,
  nextFundingTime: new Date(timestamp.getTime() + 8 * 60 * 60 * 1000),
  lastFundingTime: new Date(timestamp.getTime() - 8 * 60 * 60 * 1000),
  markPriceQuote: 50_000n * 1_000_000n,
  indexPriceQuote: 50_000n * 1_000_000n,
  timestamp,
  source: "exchange",
});

describe("bigintSqrt", () => {
  it("should return 0 for 0", () => {
    expect(bigintSqrt(0n)).toBe(0n);
  });

  it("should return 1 for 1", () => {
    expect(bigintSqrt(1n)).toBe(1n);
  });

  it("should calculate square root correctly", () => {
    expect(bigintSqrt(4n)).toBe(2n);
    expect(bigintSqrt(9n)).toBe(3n);
    expect(bigintSqrt(16n)).toBe(4n);
    expect(bigintSqrt(25n)).toBe(5n);
    expect(bigintSqrt(100n)).toBe(10n);
  });

  it("should handle large values", () => {
    expect(bigintSqrt(10_000n)).toBe(100n);
    expect(bigintSqrt(1_000_000n)).toBe(1000n);
  });

  it("should throw for negative values", () => {
    expect(() => bigintSqrt(-1n)).toThrow("Square root of negative number");
  });
});

describe("calculateSma", () => {
  it("should return 0 for empty array", () => {
    expect(calculateSma([])).toBe(0n);
  });

  it("should return the value for single element", () => {
    expect(calculateSma([10n])).toBe(10n);
  });

  it("should calculate average correctly", () => {
    expect(calculateSma([10n, 20n, 30n])).toBe(20n);
    expect(calculateSma([5n, 10n, 15n, 20n])).toBe(12n); // 50 / 4 = 12.5 -> 12n (integer division)
  });

  it("should handle large values", () => {
    expect(calculateSma([1000n, 2000n, 3000n])).toBe(2000n);
  });

  it("should handle negative values", () => {
    expect(calculateSma([-10n, 10n])).toBe(0n);
  });
});

describe("calculateStdDev", () => {
  it("should return 0 for empty array", () => {
    expect(calculateStdDev([])).toBe(0n);
  });

  it("should return 0 for single element", () => {
    expect(calculateStdDev([10n])).toBe(0n);
  });

  it("should return 0 for identical values", () => {
    expect(calculateStdDev([10n, 10n, 10n])).toBe(0n);
  });

  it("should calculate standard deviation correctly", () => {
    // Values: [10, 20, 30]
    // Mean: 20
    // Variance: ((10-20)^2 + (20-20)^2 + (30-20)^2) / 3 = (100 + 0 + 100) / 3 = 66.67
    // StdDev: sqrt(66.67) ≈ 8.16 -> 8n (integer sqrt)
    const result = calculateStdDev([10n, 20n, 30n]);
    expect(result).toBeGreaterThanOrEqual(8n);
    expect(result).toBeLessThanOrEqual(9n);
  });

  it("should handle larger variance", () => {
    // Values: [0, 100]
    // Mean: 50
    // Variance: ((0-50)^2 + (100-50)^2) / 2 = (2500 + 2500) / 2 = 2500
    // StdDev: sqrt(2500) = 50
    expect(calculateStdDev([0n, 100n])).toBe(50n);
  });
});

describe("analyzeFundingRateTrend", () => {
  const config = DEFAULT_STRATEGY_CONFIG;

  it("should handle empty snapshots", () => {
    const result = analyzeFundingRateTrend([], config);

    expect(result.snapshots).toHaveLength(0);
    expect(result.averageRateBps).toBe(0n);
    expect(result.volatilityBps).toBe(0n);
    expect(result.trend).toBe("stable");
    expect(result.regime).toBe("low_stable");
  });

  it("should handle snapshots less than window", () => {
    const snapshots = [createSnapshot(10n), createSnapshot(12n), createSnapshot(8n)];
    const result = analyzeFundingRateTrend(snapshots, config);

    expect(result.snapshots).toHaveLength(3);
    expect(result.averageRateBps).toBe(10n); // (10 + 12 + 8) / 3 = 10
    expect(result.volatilityBps).toBe(0n); // Not enough data
    expect(result.trend).toBe("stable");
    expect(result.regime).toBe("low_stable");
  });

  it("should detect increasing trend", () => {
    const snapshots: FundingRateSnapshot[] = [];
    const baseTime = new Date("2024-01-01T00:00:00Z");

    // Create 24 snapshots with increasing rates
    for (let i = 0; i < 24; i++) {
      const rate = 5n + BigInt(i); // 5, 6, 7, ..., 28
      snapshots.push(createSnapshot(rate, rate, new Date(baseTime.getTime() + i * 3600000)));
    }

    const result = analyzeFundingRateTrend(snapshots, config);

    expect(result.trend).toBe("increasing");
    expect(result.snapshots).toHaveLength(24);
  });

  it("should detect decreasing trend", () => {
    const snapshots: FundingRateSnapshot[] = [];
    const baseTime = new Date("2024-01-01T00:00:00Z");

    // Create 24 snapshots with decreasing rates
    for (let i = 0; i < 24; i++) {
      const rate = 30n - BigInt(i); // 30, 29, 28, ..., 7
      snapshots.push(createSnapshot(rate, rate, new Date(baseTime.getTime() + i * 3600000)));
    }

    const result = analyzeFundingRateTrend(snapshots, config);

    expect(result.trend).toBe("decreasing");
  });

  it("should detect stable trend", () => {
    const snapshots: FundingRateSnapshot[] = [];
    const baseTime = new Date("2024-01-01T00:00:00Z");

    // Create 24 snapshots with stable rates (around 10 bps)
    for (let i = 0; i < 24; i++) {
      const rate = 10n + (i % 3 === 0 ? 1n : 0n) - (i % 5 === 0 ? 1n : 0n); // ~10 bps
      snapshots.push(createSnapshot(rate, rate, new Date(baseTime.getTime() + i * 3600000)));
    }

    const result = analyzeFundingRateTrend(snapshots, config);

    expect(result.trend).toBe("stable");
  });

  it("should classify high_stable regime", () => {
    const snapshots: FundingRateSnapshot[] = [];
    const baseTime = new Date("2024-01-01T00:00:00Z");

    // High average (>10 bps) with low volatility
    for (let i = 0; i < 24; i++) {
      const rate = 15n + (i % 2 === 0 ? 1n : 0n); // ~15-16 bps, low volatility
      snapshots.push(createSnapshot(rate, rate, new Date(baseTime.getTime() + i * 3600000)));
    }

    const result = analyzeFundingRateTrend(snapshots, config);

    expect(result.regime).toBe("high_stable");
    expect(result.averageRateBps).toBeGreaterThan(10n);
  });

  it("should classify high_volatile regime", () => {
    const snapshots: FundingRateSnapshot[] = [];
    const baseTime = new Date("2024-01-01T00:00:00Z");

    // High average with high volatility
    for (let i = 0; i < 24; i++) {
      const rate = 15n + BigInt((i % 10) * 5); // 15, 20, 25, 30, ... (high volatility)
      snapshots.push(createSnapshot(rate, rate, new Date(baseTime.getTime() + i * 3600000)));
    }

    const result = analyzeFundingRateTrend(snapshots, config);

    expect(result.regime).toBe("high_volatile");
    expect(result.averageRateBps).toBeGreaterThan(10n);
  });

  it("should classify low_stable regime", () => {
    const snapshots: FundingRateSnapshot[] = [];
    const baseTime = new Date("2024-01-01T00:00:00Z");

    // Low average with low volatility
    for (let i = 0; i < 24; i++) {
      const rate = 5n + (i % 2 === 0 ? 1n : 0n); // ~5-6 bps, low volatility
      snapshots.push(createSnapshot(rate, rate, new Date(baseTime.getTime() + i * 3600000)));
    }

    const result = analyzeFundingRateTrend(snapshots, config);

    expect(result.regime).toBe("low_stable");
    expect(result.averageRateBps).toBeLessThanOrEqual(10n);
  });

  it("should classify low_volatile regime", () => {
    const snapshots: FundingRateSnapshot[] = [];
    const baseTime = new Date("2024-01-01T00:00:00Z");

    // Low average (~5 bps) with high volatility (need stddev > 5 bps)
    // Alternate between 0 and 15 bps to keep average low (~7.5) but volatility high
    for (let i = 0; i < 24; i++) {
      const rate = i % 2 === 0 ? 0n : 15n; // 0, 15, 0, 15, ... (avg=7.5, stddev > 5)
      snapshots.push(createSnapshot(rate, rate, new Date(baseTime.getTime() + i * 3600000)));
    }

    const result = analyzeFundingRateTrend(snapshots, config);

    expect(result.regime).toBe("low_volatile");
    expect(result.averageRateBps).toBeLessThanOrEqual(10n);
  });

  it("should use only recent snapshots within window", () => {
    const snapshots: FundingRateSnapshot[] = [];
    const baseTime = new Date("2024-01-01T00:00:00Z");

    // Create 30 snapshots, but window is 24
    for (let i = 0; i < 30; i++) {
      const rate = 10n + BigInt(i);
      snapshots.push(createSnapshot(rate, rate, new Date(baseTime.getTime() + i * 3600000)));
    }

    const result = analyzeFundingRateTrend(snapshots, config);

    expect(result.snapshots).toHaveLength(24);
    // Should use last 24 snapshots (rates 16-39), not all 30
    expect(result.snapshots[0]?.currentRateBps).toBe(16n);
    expect(result.snapshots[23]?.currentRateBps).toBe(39n);
  });

  it("should respect custom config thresholds", () => {
    const customConfig: StrategyConfig = {
      ...config,
      trendThresholdBps: 10, // Higher threshold
      volatilityThresholdBps: 10, // Higher threshold
    };

    const snapshots: FundingRateSnapshot[] = [];
    const baseTime = new Date("2024-01-01T00:00:00Z");

    // Create trend that would be "increasing" with default threshold (5 bps)
    // but "stable" with custom threshold (10 bps)
    for (let i = 0; i < 24; i++) {
      const rate = 10n + BigInt(Math.floor(i / 2)); // Gradual increase
      snapshots.push(createSnapshot(rate, rate, new Date(baseTime.getTime() + i * 3600000)));
    }

    const result = analyzeFundingRateTrend(snapshots, customConfig);

    // With higher threshold, trend should be stable (not increasing)
    expect(result.trend).toBe("stable");
  });
});
