import { describe, expect, it } from "vitest";

import { DEFAULT_STRATEGY_CONFIG } from "./config";
import type { StrategyConfig } from "./config";
import { generateEntrySignal } from "./entry-signal";
import { analyzeFundingRateTrend } from "./trend-analysis";
import type { FundingRateHistory, FundingRateSnapshot } from "./types";

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

const createHistory = (
  trend: "increasing" | "decreasing" | "stable",
  regime: "high_stable" | "high_volatile" | "low_stable" | "low_volatile",
): FundingRateHistory => {
  const snapshots: FundingRateSnapshot[] = [];
  const baseTime = new Date("2024-01-01T00:00:00Z");

  // Create snapshots that will produce the desired trend and regime
  for (let i = 0; i < 24; i++) {
    let rate: bigint;
    const isHigh = regime.startsWith("high");
    const isVolatile = regime.endsWith("volatile");

    if (isHigh) {
      // High regime: average > 10 bps
      if (trend === "increasing") {
        rate = 12n + BigInt(i); // 12-35 bps (increasing)
      } else if (trend === "decreasing") {
        rate = 35n - BigInt(i); // 35-12 bps (decreasing)
      } else {
        // Stable: around 15 bps
        rate = isVolatile ? 15n + BigInt((i % 10) * 5) : 15n + (i % 2 === 0 ? 1n : 0n);
      }
    } else {
      // Low regime: average <= 10 bps
      if (trend === "increasing") {
        rate = 2n + BigInt(i); // 2-25 bps, but will average low due to early values
      } else if (trend === "decreasing") {
        rate = 10n - BigInt(i); // 10-(-14) but we'll cap
      } else {
        // Stable: around 5 bps
        rate = isVolatile ? (i % 2 === 0 ? 0n : 15n) : 5n + (i % 2 === 0 ? 1n : 0n);
      }
    }

    snapshots.push(createSnapshot(rate, rate, new Date(baseTime.getTime() + i * 3600000)));
  }

  const analyzed = analyzeFundingRateTrend(snapshots, DEFAULT_STRATEGY_CONFIG);

  // If the analyzed result doesn't match, create a direct history object
  // This ensures tests work even if trend analysis doesn't produce exact match
  return {
    snapshots: analyzed.snapshots,
    averageRateBps: analyzed.averageRateBps,
    volatilityBps: analyzed.volatilityBps,
    trend,
    regime,
  };
};

describe("generateEntrySignal", () => {
  const config = DEFAULT_STRATEGY_CONFIG;

  describe("rejection cases", () => {
    it("should return null when current rate below threshold", () => {
      const fundingRate = createSnapshot(5n); // Below 10 bps threshold
      const history = createHistory("stable", "high_stable");

      const result = generateEntrySignal(fundingRate, history, config);

      expect(result).toBeNull();
    });

    it("should return null when regime is low_stable", () => {
      const fundingRate = createSnapshot(15n);
      const history = createHistory("stable", "low_stable");

      const result = generateEntrySignal(fundingRate, history, config);

      expect(result).toBeNull();
    });

    it("should return null when regime is low_volatile", () => {
      const fundingRate = createSnapshot(15n);
      const history = createHistory("stable", "low_volatile");

      const result = generateEntrySignal(fundingRate, history, config);

      expect(result).toBeNull();
    });
  });

  describe("HIGH confidence signals", () => {
    it("should generate HIGH confidence when all conditions optimal", () => {
      const fundingRate = createSnapshot(15n, 20n); // High current, higher predicted
      const history = createHistory("increasing", "high_stable");

      const result = generateEntrySignal(fundingRate, history, config);

      expect(result).not.toBeNull();
      expect(result?.confidence).toBe("HIGH");
      expect(result?.type).toBe("ENTER");
      expect(result?.reasons).toContain("Predicted rate 20bps is higher than current");
      expect(result?.reasons).toContain("Trend is increasing");
      expect(result?.reasons).toContain("Regime is high_stable");
    });

    it("should generate HIGH confidence with stable trend and high_stable regime", () => {
      const fundingRate = createSnapshot(15n, 18n);
      const history = createHistory("stable", "high_stable");

      const result = generateEntrySignal(fundingRate, history, config);

      expect(result).not.toBeNull();
      expect(result?.confidence).toBe("HIGH");
    });
  });

  describe("MEDIUM confidence signals", () => {
    it("should generate MEDIUM confidence with decreasing trend but high_stable regime", () => {
      const fundingRate = createSnapshot(15n, 20n);
      const history = createHistory("decreasing", "high_stable");

      const result = generateEntrySignal(fundingRate, history, config);

      expect(result).not.toBeNull();
      expect(result?.confidence).toBe("MEDIUM");
      expect(result?.reasons).toContain("Trend is decreasing");
    });

    it("should generate MEDIUM confidence with high_volatile regime", () => {
      const fundingRate = createSnapshot(15n, 20n);
      const history = createHistory("increasing", "high_volatile");

      const result = generateEntrySignal(fundingRate, history, config);

      expect(result).not.toBeNull();
      expect(result?.confidence).toBe("MEDIUM");
      expect(result?.reasons).toContain("Regime is high_volatile");
    });

    it("should generate MEDIUM confidence when predicted rate below current but other factors good", () => {
      const fundingRate = createSnapshot(20n, 15n); // Predicted lower than current
      const history = createHistory("increasing", "high_stable");

      const result = generateEntrySignal(fundingRate, history, config);

      expect(result).not.toBeNull();
      expect(result?.confidence).toBe("MEDIUM");
    });
  });

  describe("LOW confidence signals", () => {
    it("should generate LOW confidence with multiple negative factors", () => {
      const fundingRate = createSnapshot(12n, 10n); // Predicted lower, close to threshold
      const history = createHistory("decreasing", "high_volatile");

      const result = generateEntrySignal(fundingRate, history, config);

      expect(result).not.toBeNull();
      expect(result?.confidence).toBe("LOW");
    });

    it("should generate LOW confidence when predicted rate below minimum threshold", () => {
      const fundingRate = createSnapshot(15n, 3n); // Predicted below 5 bps minimum
      const history = createHistory("stable", "high_stable");

      const result = generateEntrySignal(fundingRate, history, config);

      expect(result).not.toBeNull();
      expect(result?.confidence).toBe("LOW");
      expect(result?.reasons).toContain("Predicted rate 3bps below minimum 5bps");
    });
  });

  describe("expected yield calculation", () => {
    it("should calculate expected yield correctly", () => {
      const fundingRate = createSnapshot(15n, 20n);
      const history = createHistory("increasing", "high_stable");

      const result = generateEntrySignal(fundingRate, history, config);

      expect(result).not.toBeNull();
      // Expected yield = (predictedRate * 8 hours) / 8 = predictedRate
      expect(result?.expectedYieldBps).toBe(20n);
    });

    it("should calculate expected yield for different predicted rates", () => {
      const fundingRate = createSnapshot(15n, 16n);
      const history = createHistory("stable", "high_stable");

      const result = generateEntrySignal(fundingRate, history, config);

      expect(result).not.toBeNull();
      expect(result?.expectedYieldBps).toBe(16n);
    });
  });

  describe("custom config", () => {
    it("should respect custom minimum funding rate threshold", () => {
      const customConfig: StrategyConfig = {
        ...config,
        minFundingRateBps: 20, // Higher threshold
      };

      const fundingRate = createSnapshot(15n); // Below custom threshold
      const history = createHistory("stable", "high_stable");

      const result = generateEntrySignal(fundingRate, history, customConfig);

      expect(result).toBeNull();
    });

    it("should respect custom minimum predicted rate threshold", () => {
      const customConfig: StrategyConfig = {
        ...config,
        minPredictedRateBps: 15, // Higher threshold
      };

      const fundingRate = createSnapshot(20n, 10n); // Predicted below custom threshold
      const history = createHistory("stable", "high_stable");

      const result = generateEntrySignal(fundingRate, history, customConfig);

      expect(result).not.toBeNull();
      expect(result?.confidence).toBe("LOW");
      expect(result?.reasons).toContain("Predicted rate 10bps below minimum 15bps");
    });
  });
});
