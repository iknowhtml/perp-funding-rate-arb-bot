import { describe, expect, it } from "vitest";

import { DEFAULT_RISK_CONFIG } from "@/domains/risk";
import type { RiskAssessment } from "@/domains/risk";

import { DEFAULT_STRATEGY_CONFIG } from "./config";
import { evaluateStrategy } from "./evaluate";
import type {
  FundingRateHistory,
  FundingRateSnapshot,
  StrategyInput,
  StrategyPosition,
} from "./types";

const createHistory = (
  trend: "increasing" | "decreasing" | "stable",
  regime: "high_stable" | "high_volatile" | "low_stable" | "low_volatile",
): FundingRateHistory => {
  const snapshots: FundingRateSnapshot[] = [];
  const baseTime = new Date("2024-01-01T00:00:00Z");

  let baseRate: bigint;
  if (regime.startsWith("high")) {
    baseRate = 15n;
  } else {
    baseRate = 5n;
  }

  for (let i = 0; i < 24; i++) {
    let rate = baseRate;
    if (regime.endsWith("volatile")) {
      rate = baseRate + BigInt((i % 3) * 2);
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

const createSafeRiskAssessment = (overrides?: Partial<RiskAssessment>): RiskAssessment => ({
  level: "SAFE",
  action: "ALLOW",
  reasons: [],
  metrics: {
    notionalQuote: 0n,
    leverageBps: 0n,
    marginUtilizationBps: 500n,
    liquidationDistanceBps: 10000n,
    dailyPnlQuote: 0n,
    drawdownBps: 0n,
  },
  ...overrides,
});

const createStrategyInput = (overrides?: Partial<StrategyInput>): StrategyInput => {
  const baseTime = new Date("2024-01-01T00:00:00Z");
  const fundingRate = createSnapshot(15n, 18n, baseTime);
  const fundingHistory: FundingRateSnapshot[] = [];
  for (let i = 0; i < 24; i++) {
    fundingHistory.push(createSnapshot(15n, 15n, new Date(baseTime.getTime() + i * 3600000)));
  }

  return {
    fundingRate,
    fundingHistory,
    position: null,
    equityQuote: 100_000n * QUOTE_SCALE,
    marginUsedQuote: 5_000n * QUOTE_SCALE,
    ...overrides,
  };
};

describe("evaluateStrategy", () => {
  const riskConfig = DEFAULT_RISK_CONFIG;
  const strategyConfig = DEFAULT_STRATEGY_CONFIG;

  describe("risk blocking", () => {
    it("should return NOOP when risk action is BLOCK", () => {
      const risk = createSafeRiskAssessment({ action: "BLOCK" });
      const input = createStrategyInput();

      const result = evaluateStrategy(input, risk, riskConfig, strategyConfig);

      expect(result).toEqual({ type: "NOOP" });
    });

    it("should return NOOP when risk action is EXIT and no position", () => {
      const risk = createSafeRiskAssessment({ action: "EXIT" });
      const input = createStrategyInput({ position: null });

      const result = evaluateStrategy(input, risk, riskConfig, strategyConfig);

      expect(result).toEqual({ type: "NOOP" });
    });

    it("should return EXIT_HEDGE when risk action is EXIT and position open", () => {
      const risk = createSafeRiskAssessment({ action: "EXIT" });
      const entryTime = new Date("2024-01-01T00:00:00Z");
      const position: StrategyPosition = {
        open: true,
        entryTime,
        entryFundingRateBps: 20n,
        entryTrend: "stable",
        entryRegime: "high_stable",
        sizeQuote: 10_000n * QUOTE_SCALE,
        side: "SHORT",
      };
      const input = createStrategyInput({ position });

      const result = evaluateStrategy(input, risk, riskConfig, strategyConfig);

      expect(result).toEqual({
        type: "EXIT_HEDGE",
        reason: "risk",
      });
    });

    it("should return NOOP when risk action is PAUSE", () => {
      const risk = createSafeRiskAssessment({ action: "PAUSE" });
      const input = createStrategyInput();

      const result = evaluateStrategy(input, risk, riskConfig, strategyConfig);

      expect(result).toEqual({ type: "NOOP" });
    });
  });

  describe("entry signals", () => {
    it("should return ENTER_HEDGE when conditions met and risk allows", () => {
      const risk = createSafeRiskAssessment({ action: "ALLOW" });
      const fundingRate = createSnapshot(15n, 18n); // Above threshold, predicted higher
      const history = createHistory("increasing", "high_stable");
      const input = createStrategyInput({
        fundingRate,
        fundingHistory: history.snapshots,
        position: null,
      });

      const result = evaluateStrategy(input, risk, riskConfig, strategyConfig);

      expect(result.type).toBe("ENTER_HEDGE");
      if (result.type === "ENTER_HEDGE") {
        expect(result.params.confidence).toBe("HIGH");
        expect(result.params.expectedYieldBps).toBeGreaterThan(0n);
        expect(result.params.sizeQuote).toBeGreaterThan(0n);
      }
    });

    it("should return NOOP when entry signal generated but risk is PAUSE", () => {
      const risk = createSafeRiskAssessment({ action: "PAUSE" });
      const fundingRate = createSnapshot(15n, 18n);
      const history = createHistory("increasing", "high_stable");
      const input = createStrategyInput({
        fundingRate,
        fundingHistory: history.snapshots,
        position: null,
      });

      const result = evaluateStrategy(input, risk, riskConfig, strategyConfig);

      expect(result).toEqual({ type: "NOOP" });
    });

    it("should return NOOP when no entry signal generated", () => {
      const risk = createSafeRiskAssessment({ action: "ALLOW" });
      const fundingRate = createSnapshot(5n); // Below threshold
      const history = createHistory("stable", "high_stable");
      const input = createStrategyInput({
        fundingRate,
        fundingHistory: history.snapshots,
        position: null,
      });

      const result = evaluateStrategy(input, risk, riskConfig, strategyConfig);

      expect(result).toEqual({ type: "NOOP" });
    });

    it("should calculate position size using risk-based sizing", () => {
      const risk = createSafeRiskAssessment({ action: "ALLOW" });
      const fundingRate = createSnapshot(15n, 18n);
      const history = createHistory("increasing", "high_stable");
      const input = createStrategyInput({
        fundingRate,
        fundingHistory: history.snapshots,
        position: null,
        equityQuote: 50_000n * QUOTE_SCALE, // $50,000
        marginUsedQuote: 10_000n * QUOTE_SCALE, // $10,000 used
      });

      const result = evaluateStrategy(input, risk, riskConfig, strategyConfig);

      expect(result.type).toBe("ENTER_HEDGE");
      if (result.type === "ENTER_HEDGE") {
        // Available capital: $40,000, max leverage 3x = $120,000 max by capital
        // Config limit: $10,000
        // Should use config limit ($10,000)
        expect(result.params.sizeQuote).toBe(10_000n * QUOTE_SCALE);
      }
    });
  });

  describe("exit signals", () => {
    it("should return EXIT_HEDGE when exit signal generated", () => {
      const risk = createSafeRiskAssessment({ action: "ALLOW" });
      const entryTime = new Date("2024-01-01T00:00:00Z");
      const currentTime = new Date("2024-01-01T08:00:00Z");
      const position: StrategyPosition = {
        open: true,
        entryTime,
        entryFundingRateBps: 20n,
        entryTrend: "stable",
        entryRegime: "high_stable",
        sizeQuote: 10_000n * QUOTE_SCALE,
        side: "SHORT",
      };
      const fundingRate = createSnapshot(15n, 2n, currentTime); // Predicted below threshold
      const history = createHistory("stable", "high_stable");
      const input = createStrategyInput({
        fundingRate,
        fundingHistory: history.snapshots,
        position,
      });

      const result = evaluateStrategy(input, risk, riskConfig, strategyConfig);

      expect(result.type).toBe("EXIT_HEDGE");
      if (result.type === "EXIT_HEDGE") {
        expect(result.reason).toBe("rate_drop");
      }
    });

    it("should return NOOP when no exit signal and risk allows", () => {
      const risk = createSafeRiskAssessment({ action: "ALLOW" });
      const entryTime = new Date("2024-01-01T00:00:00Z");
      const currentTime = new Date("2024-01-01T08:00:00Z");
      const position: StrategyPosition = {
        open: true,
        entryTime,
        entryFundingRateBps: 20n,
        entryTrend: "stable",
        entryRegime: "high_stable",
        sizeQuote: 1_000n * QUOTE_SCALE, // Small position to avoid target yield
        side: "SHORT",
      };
      const fundingRate = createSnapshot(15n, 15n, currentTime); // Above threshold
      const history = createHistory("stable", "high_stable");
      const input = createStrategyInput({
        fundingRate,
        fundingHistory: history.snapshots,
        position,
      });

      const result = evaluateStrategy(input, risk, riskConfig, strategyConfig);

      expect(result).toEqual({ type: "NOOP" });
    });

    it("should prioritize exit signal reason over risk exit", () => {
      const risk = createSafeRiskAssessment({ action: "EXIT" });
      const entryTime = new Date("2024-01-01T00:00:00Z");
      const currentTime = new Date("2024-01-01T08:00:00Z");
      const position: StrategyPosition = {
        open: true,
        entryTime,
        entryFundingRateBps: 20n,
        entryTrend: "increasing",
        entryRegime: "high_stable",
        sizeQuote: 1_000n * QUOTE_SCALE,
        side: "SHORT",
      };
      const fundingRate = createSnapshot(15n, 15n, currentTime); // Above exit threshold
      // Create history with decreasing trend (first half higher than second half)
      const baseTime = new Date("2024-01-01T00:00:00Z");
      const fundingHistory: FundingRateSnapshot[] = [];
      for (let i = 0; i < 24; i++) {
        const rate = 20n - BigInt(i); // Decreasing: 20, 19, 18, ..., -3
        fundingHistory.push(createSnapshot(rate, rate, new Date(baseTime.getTime() + i * 3600000)));
      }
      const input = createStrategyInput({
        fundingRate,
        fundingHistory,
        position,
      });

      const result = evaluateStrategy(input, risk, riskConfig, strategyConfig);

      expect(result.type).toBe("EXIT_HEDGE");
      if (result.type === "EXIT_HEDGE") {
        expect(result.reason).toBe("trend_change"); // Should use exit signal reason, not "risk"
      }
    });
  });

  describe("position state handling", () => {
    it("should handle null position as no position", () => {
      const risk = createSafeRiskAssessment({ action: "ALLOW" });
      const fundingRate = createSnapshot(15n, 18n);
      const history = createHistory("increasing", "high_stable");
      const input = createStrategyInput({
        fundingRate,
        fundingHistory: history.snapshots,
        position: null,
      });

      const result = evaluateStrategy(input, risk, riskConfig, strategyConfig);

      expect(result.type).toBe("ENTER_HEDGE");
    });

    it("should handle closed position as no position", () => {
      const risk = createSafeRiskAssessment({ action: "ALLOW" });
      const fundingRate = createSnapshot(15n, 18n);
      const history = createHistory("increasing", "high_stable");
      const entryTime = new Date("2024-01-01T00:00:00Z");
      const position: StrategyPosition = {
        open: false, // Closed position
        entryTime,
        entryFundingRateBps: 20n,
        entryTrend: "stable",
        entryRegime: "high_stable",
        sizeQuote: 10_000n * QUOTE_SCALE,
        side: "SHORT",
      };
      const input = createStrategyInput({
        fundingRate,
        fundingHistory: history.snapshots,
        position,
      });

      const result = evaluateStrategy(input, risk, riskConfig, strategyConfig);

      expect(result.type).toBe("ENTER_HEDGE"); // Should treat as no position
    });
  });
});
