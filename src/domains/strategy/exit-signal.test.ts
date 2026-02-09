import { describe, expect, it } from "vitest";

import { DEFAULT_STRATEGY_CONFIG } from "./config";
import type { StrategyConfig } from "./config";
import { calculateRealizedYieldBps, generateExitSignal } from "./exit-signal";
import type { FundingRateHistory, FundingRateSnapshot, StrategyPosition } from "./types";

const QUOTE_SCALE = 1_000_000n;

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
  markPriceQuote: 50_000n * QUOTE_SCALE,
  indexPriceQuote: 50_000n * QUOTE_SCALE,
  timestamp,
  source: "exchange",
});

const createPosition = (
  entryTime: Date,
  entryFundingRateBps: bigint,
  entryTrend: "increasing" | "decreasing" | "stable",
  entryRegime: "high_stable" | "high_volatile" | "low_stable" | "low_volatile",
  sizeQuote: bigint = 10_000n * QUOTE_SCALE,
): StrategyPosition => ({
  open: true,
  entryTime,
  entryFundingRateBps,
  entryTrend,
  entryRegime,
  sizeQuote,
  side: "SHORT",
});

const createHistory = (
  trend: "increasing" | "decreasing" | "stable",
  regime: "high_stable" | "high_volatile" | "low_stable" | "low_volatile",
): FundingRateHistory => {
  // Create a simple history object directly to avoid issues with trend analysis
  const snapshots: FundingRateSnapshot[] = [];
  const baseTime = new Date("2024-01-01T00:00:00Z");

  // Create stable rates for the regime
  let baseRate: bigint;
  if (regime.startsWith("high")) {
    baseRate = 15n; // High regime
  } else {
    baseRate = 5n; // Low regime
  }

  for (let i = 0; i < 24; i++) {
    let rate = baseRate;
    if (regime.endsWith("volatile")) {
      rate = baseRate + BigInt((i % 3) * 2); // Add some volatility
    }
    snapshots.push(createSnapshot(rate, rate, new Date(baseTime.getTime() + i * 3600000)));
  }

  const rates = snapshots.map((s) => s.currentRateBps);
  const sum = rates.reduce((acc, r) => acc + r, 0n);
  const averageRateBps = sum / BigInt(rates.length);
  const mean = averageRateBps;
  const variance = rates.reduce((acc, r) => acc + (r - mean) ** 2n, 0n) / BigInt(rates.length);
  const volatilityBps = variance > 0n ? BigInt(Math.floor(Math.sqrt(Number(variance)))) : 0n;

  return {
    snapshots,
    averageRateBps,
    volatilityBps,
    trend,
    regime,
  };
};

describe("calculateRealizedYieldBps", () => {
  it("should return 0 for position held less than 8 hours", () => {
    const entryTime = new Date("2024-01-01T00:00:00Z");
    const currentTime = new Date("2024-01-01T04:00:00Z"); // 4 hours later
    const position = createPosition(entryTime, 20n, "stable", "high_stable");
    const fundingRate = createSnapshot(20n, 20n, currentTime);

    const result = calculateRealizedYieldBps(position, fundingRate);

    expect(result).toBe(0n); // Less than one funding period
  });

  it("should calculate yield for one funding period (8 hours)", () => {
    const entryTime = new Date("2024-01-01T00:00:00Z");
    const currentTime = new Date("2024-01-01T08:00:00Z"); // 8 hours later
    const position = createPosition(entryTime, 20n, "stable", "high_stable");
    const fundingRate = createSnapshot(20n, 20n, currentTime);

    const result = calculateRealizedYieldBps(position, fundingRate);

    // Yield = (size * rate * periods) / 10000
    // = (10_000_000_000 * 20 * 1) / 10000 = 20_000_000
    expect(result).toBe(20_000_000n);
  });

  it("should calculate yield for multiple funding periods", () => {
    const entryTime = new Date("2024-01-01T00:00:00Z");
    const currentTime = new Date("2024-01-01T24:00:00Z"); // 24 hours = 3 periods
    const position = createPosition(entryTime, 20n, "stable", "high_stable");
    const fundingRate = createSnapshot(20n, 20n, currentTime);

    const result = calculateRealizedYieldBps(position, fundingRate);

    // Yield = (size * rate * periods) / 10000
    // = (10_000_000_000 * 20 * 3) / 10000 = 60_000_000
    expect(result).toBe(60_000_000n);
  });

  it("should use entry funding rate, not current rate", () => {
    const entryTime = new Date("2024-01-01T00:00:00Z");
    const currentTime = new Date("2024-01-01T08:00:00Z");
    const position = createPosition(entryTime, 30n, "stable", "high_stable"); // Entry rate 30 bps
    const fundingRate = createSnapshot(10n, 10n, currentTime); // Current rate 10 bps

    const result = calculateRealizedYieldBps(position, fundingRate);

    // Should use entry rate (30 bps), not current (10 bps)
    expect(result).toBe(30_000_000n); // (10_000_000_000 * 30 * 1) / 10000
  });

  it("should handle different position sizes", () => {
    const entryTime = new Date("2024-01-01T00:00:00Z");
    const currentTime = new Date("2024-01-01T08:00:00Z");
    const position = createPosition(
      entryTime,
      20n,
      "stable",
      "high_stable",
      5_000n * QUOTE_SCALE, // Smaller position
    );
    const fundingRate = createSnapshot(20n, 20n, currentTime);

    const result = calculateRealizedYieldBps(position, fundingRate);

    // Yield = (5_000_000_000 * 20 * 1) / 10000 = 10_000_000
    expect(result).toBe(10_000_000n);
  });
});

describe("generateExitSignal", () => {
  const config = DEFAULT_STRATEGY_CONFIG;

  describe("rate drop exit", () => {
    it("should exit when predicted rate drops below threshold", () => {
      const entryTime = new Date("2024-01-01T00:00:00Z");
      const currentTime = new Date("2024-01-01T08:00:00Z");
      const position = createPosition(entryTime, 20n, "stable", "high_stable");
      const fundingRate = createSnapshot(15n, 2n, currentTime); // Predicted 2 bps < 3 bps threshold
      const history = createHistory("stable", "high_stable");

      const result = generateExitSignal(position, fundingRate, history, config);

      expect(result).not.toBeNull();
      expect(result?.type).toBe("EXIT");
      expect(result?.reason).toBe("rate_drop");
    });

    it("should not exit when predicted rate above threshold", () => {
      const entryTime = new Date("2024-01-01T00:00:00Z");
      const currentTime = new Date("2024-01-01T08:00:00Z");
      // Use smaller position to avoid target yield trigger
      const position = createPosition(
        entryTime,
        10n, // Lower entry rate
        "stable",
        "high_stable",
        1_000n * QUOTE_SCALE, // Smaller position
      );
      const fundingRate = createSnapshot(15n, 5n, currentTime); // Predicted 5 bps >= 3 bps threshold
      const history = createHistory("stable", "high_stable");

      const result = generateExitSignal(position, fundingRate, history, config);

      expect(result).toBeNull();
    });
  });

  describe("trend change exit", () => {
    it("should exit when trend changes to decreasing", () => {
      const entryTime = new Date("2024-01-01T00:00:00Z");
      const currentTime = new Date("2024-01-01T08:00:00Z");
      const position = createPosition(entryTime, 20n, "increasing", "high_stable");
      const fundingRate = createSnapshot(15n, 15n, currentTime);
      const history = createHistory("decreasing", "high_stable"); // Trend changed

      const result = generateExitSignal(position, fundingRate, history, config);

      expect(result).not.toBeNull();
      expect(result?.type).toBe("EXIT");
      expect(result?.reason).toBe("trend_change");
    });

    it("should not exit when trend was already decreasing", () => {
      const entryTime = new Date("2024-01-01T00:00:00Z");
      const currentTime = new Date("2024-01-01T08:00:00Z");
      // Use smaller position to avoid target yield trigger
      const position = createPosition(
        entryTime,
        10n,
        "decreasing",
        "high_stable",
        1_000n * QUOTE_SCALE,
      );
      const fundingRate = createSnapshot(15n, 15n, currentTime);
      const history = createHistory("decreasing", "high_stable"); // Still decreasing

      const result = generateExitSignal(position, fundingRate, history, config);

      expect(result).toBeNull(); // No change
    });
  });

  describe("regime change exit", () => {
    it("should exit when regime changes from high to low", () => {
      const entryTime = new Date("2024-01-01T00:00:00Z");
      const currentTime = new Date("2024-01-01T08:00:00Z");
      const position = createPosition(entryTime, 20n, "stable", "high_stable");
      const fundingRate = createSnapshot(15n, 15n, currentTime);
      const history = createHistory("stable", "low_stable"); // Regime changed

      const result = generateExitSignal(position, fundingRate, history, config);

      expect(result).not.toBeNull();
      expect(result?.type).toBe("EXIT");
      expect(result?.reason).toBe("regime_change");
    });

    it("should exit when regime changes from high_volatile to low", () => {
      const entryTime = new Date("2024-01-01T00:00:00Z");
      const currentTime = new Date("2024-01-01T08:00:00Z");
      const position = createPosition(entryTime, 20n, "stable", "high_volatile");
      const fundingRate = createSnapshot(15n, 15n, currentTime);
      const history = createHistory("stable", "low_volatile"); // Regime changed

      const result = generateExitSignal(position, fundingRate, history, config);

      expect(result).not.toBeNull();
      expect(result?.reason).toBe("regime_change");
    });

    it("should not exit when regime stays high", () => {
      const entryTime = new Date("2024-01-01T00:00:00Z");
      const currentTime = new Date("2024-01-01T08:00:00Z");
      // Use smaller position to avoid target yield trigger
      const position = createPosition(
        entryTime,
        10n,
        "stable",
        "high_stable",
        1_000n * QUOTE_SCALE,
      );
      const fundingRate = createSnapshot(15n, 15n, currentTime);
      const history = createHistory("stable", "high_stable"); // Still high

      const result = generateExitSignal(position, fundingRate, history, config);

      expect(result).toBeNull();
    });
  });

  describe("target yield exit", () => {
    it("should exit when target yield reached", () => {
      const entryTime = new Date("2024-01-01T00:00:00Z");
      const currentTime = new Date("2024-01-01T16:00:00Z"); // 16 hours = 2 periods
      // Use high entry rate to reach target faster
      // Target is 50 bps, so need: (size * rate * periods) / 10000 >= 50
      // With size = 10_000_000_000, rate = 30, periods = 2:
      // (10_000_000_000 * 30 * 2) / 10000 = 60_000_000 >= 50_000_000 (target)
      const position = createPosition(entryTime, 30n, "stable", "high_stable");
      const fundingRate = createSnapshot(15n, 15n, currentTime);
      const history = createHistory("stable", "high_stable");

      const result = generateExitSignal(position, fundingRate, history, config);

      expect(result).not.toBeNull();
      expect(result?.type).toBe("EXIT");
      expect(result?.reason).toBe("target_reached");
      expect(result?.realizedYieldBps).toBeGreaterThanOrEqual(50_000_000n);
    });

    it("should not exit when target yield not reached", () => {
      const entryTime = new Date("2024-01-01T00:00:00Z");
      const currentTime = new Date("2024-01-01T08:00:00Z"); // 8 hours = 1 period
      // Use smaller position/rate to ensure yield < target
      const position = createPosition(
        entryTime,
        10n, // Lower rate
        "stable",
        "high_stable",
        1_000n * QUOTE_SCALE, // Smaller position
      );
      const fundingRate = createSnapshot(15n, 15n, currentTime);
      const history = createHistory("stable", "high_stable");

      const result = generateExitSignal(position, fundingRate, history, config);

      expect(result).toBeNull(); // Yield = (1_000_000_000 * 10 * 1) / 10000 = 1_000_000 < 50_000_000 target
    });
  });

  describe("priority order", () => {
    it("should prioritize rate drop over other conditions", () => {
      const entryTime = new Date("2024-01-01T00:00:00Z");
      const currentTime = new Date("2024-01-01T08:00:00Z");
      const position = createPosition(entryTime, 20n, "stable", "high_stable");
      const fundingRate = createSnapshot(15n, 2n, currentTime); // Rate drop
      const history = createHistory("decreasing", "low_stable"); // Also trend/regime change

      const result = generateExitSignal(position, fundingRate, history, config);

      expect(result).not.toBeNull();
      expect(result?.reason).toBe("rate_drop"); // Should be rate_drop, not trend_change or regime_change
    });
  });

  describe("custom config", () => {
    it("should respect custom exit funding rate threshold", () => {
      const customConfig: StrategyConfig = {
        ...config,
        exitFundingRateBps: 10, // Higher threshold
      };

      const entryTime = new Date("2024-01-01T00:00:00Z");
      const currentTime = new Date("2024-01-01T08:00:00Z");
      const position = createPosition(entryTime, 20n, "stable", "high_stable");
      const fundingRate = createSnapshot(15n, 8n, currentTime); // 8 bps < 10 bps custom threshold
      const history = createHistory("stable", "high_stable");

      const result = generateExitSignal(position, fundingRate, history, customConfig);

      expect(result).not.toBeNull();
      expect(result?.reason).toBe("rate_drop");
    });

    it("should respect custom target yield", () => {
      const customConfig: StrategyConfig = {
        ...config,
        targetYieldBps: 100, // Higher target (100 bps = 100_000_000 in yield units)
      };

      const entryTime = new Date("2024-01-01T00:00:00Z");
      const currentTime = new Date("2024-01-01T08:00:00Z");
      // Use smaller position to ensure yield < custom target
      const position = createPosition(
        entryTime,
        10n,
        "stable",
        "high_stable",
        1_000n * QUOTE_SCALE,
      );
      const fundingRate = createSnapshot(15n, 15n, currentTime);
      const history = createHistory("stable", "high_stable");

      const result = generateExitSignal(position, fundingRate, history, customConfig);

      expect(result).toBeNull(); // Yield = 1_000_000 < 100_000_000 custom target
    });
  });
});
