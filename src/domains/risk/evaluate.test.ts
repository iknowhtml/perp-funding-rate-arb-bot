import { describe, expect, it } from "vitest";

import { DEFAULT_RISK_CONFIG } from "./config";
import type { RiskConfig } from "./config";
import { calculateRiskMetrics, evaluateRisk } from "./evaluate";
import type { RiskSnapshot } from "./types";

/** USDC scale factor: 10^6 */
const QUOTE_SCALE = 1_000_000n;

/**
 * Create a default safe snapshot for testing.
 * All values are well within default risk limits.
 */
const createSafeSnapshot = (overrides?: Partial<RiskSnapshot>): RiskSnapshot => ({
  equityQuote: 100_000n * QUOTE_SCALE, // $100,000
  marginUsedQuote: 5_000n * QUOTE_SCALE, // $5,000 (5% utilization)
  position: {
    side: "SHORT",
    notionalQuote: 5_000n * QUOTE_SCALE, // $5,000 (well under $10,000 max)
    leverageBps: 5000n, // 0.5x (well under 3x max)
    markPriceQuote: 50_000n * QUOTE_SCALE, // $50,000
    liquidationPriceQuote: 75_000n * QUOTE_SCALE, // $75,000 (50% buffer for SHORT)
  },
  dailyPnlQuote: 100n * QUOTE_SCALE, // +$100 profit
  peakEquityQuote: 100_000n * QUOTE_SCALE, // No drawdown
  ...overrides,
});

describe("calculateRiskMetrics", () => {
  it("should compute metrics from snapshot with position", () => {
    const snapshot = createSafeSnapshot();
    const metrics = calculateRiskMetrics(snapshot);

    expect(metrics.notionalQuote).toBe(5_000n * QUOTE_SCALE);
    expect(metrics.leverageBps).toBe(5000n);
    expect(metrics.dailyPnlQuote).toBe(100n * QUOTE_SCALE);
    // Margin utilization: 5000/100000 = 5% = 500 bps
    expect(metrics.marginUtilizationBps).toBe(500n);
    // Drawdown: (100000 - 100000) / 100000 = 0%
    expect(metrics.drawdownBps).toBe(0n);
    // Liquidation distance: (75000 - 50000) / 50000 = 50% = 5000 bps (SHORT)
    expect(metrics.liquidationDistanceBps).toBe(5000n);
  });

  it("should return safe defaults when no position", () => {
    const snapshot = createSafeSnapshot({ position: null });
    const metrics = calculateRiskMetrics(snapshot);

    expect(metrics.notionalQuote).toBe(0n);
    expect(metrics.leverageBps).toBe(0n);
    expect(metrics.liquidationDistanceBps).toBe(10000n); // 100% buffer
  });

  it("should calculate drawdown correctly", () => {
    const snapshot = createSafeSnapshot({
      equityQuote: 90_000n * QUOTE_SCALE, // $90,000
      peakEquityQuote: 100_000n * QUOTE_SCALE, // $100,000
    });
    const metrics = calculateRiskMetrics(snapshot);

    // Drawdown: (100000 - 90000) / 100000 = 10% = 1000 bps
    expect(metrics.drawdownBps).toBe(1000n);
  });

  it("should handle zero peak equity", () => {
    const snapshot = createSafeSnapshot({
      equityQuote: 0n,
      peakEquityQuote: 0n,
    });
    const metrics = calculateRiskMetrics(snapshot);

    expect(metrics.drawdownBps).toBe(0n);
  });

  it("should handle zero equity for margin utilization", () => {
    const snapshot = createSafeSnapshot({
      equityQuote: 0n,
      marginUsedQuote: 5_000n * QUOTE_SCALE,
    });
    const metrics = calculateRiskMetrics(snapshot);

    // calculateMarginUtilizationBps returns 10000 (100%) for zero equity
    expect(metrics.marginUtilizationBps).toBe(10000n);
  });
});

describe("evaluateRisk", () => {
  const config = DEFAULT_RISK_CONFIG;

  describe("SAFE scenarios", () => {
    it("should return SAFE/ALLOW when all within limits", () => {
      const snapshot = createSafeSnapshot();
      const result = evaluateRisk(snapshot, config);

      expect(result.level).toBe("SAFE");
      expect(result.action).toBe("ALLOW");
      expect(result.reasons).toHaveLength(0);
    });

    it("should return SAFE/ALLOW with no position", () => {
      const snapshot = createSafeSnapshot({ position: null });
      const result = evaluateRisk(snapshot, config);

      expect(result.level).toBe("SAFE");
      expect(result.action).toBe("ALLOW");
      expect(result.reasons).toHaveLength(0);
    });
  });

  describe("BLOCKED scenarios", () => {
    it("should BLOCK when position size exceeds maximum", () => {
      const snapshot = createSafeSnapshot({
        position: {
          side: "SHORT",
          notionalQuote: 15_000n * QUOTE_SCALE, // $15,000 > $10,000 max
          leverageBps: 5000n,
          markPriceQuote: 50_000n * QUOTE_SCALE,
          liquidationPriceQuote: 75_000n * QUOTE_SCALE,
        },
      });
      const result = evaluateRisk(snapshot, config);

      expect(result.level).toBe("BLOCKED");
      expect(result.action).toBe("BLOCK");
      expect(result.reasons).toContain("Position size exceeds maximum");
    });

    it("should BLOCK when leverage exceeds maximum", () => {
      const snapshot = createSafeSnapshot({
        position: {
          side: "SHORT",
          notionalQuote: 5_000n * QUOTE_SCALE,
          leverageBps: 40000n, // 4x > 3x max
          markPriceQuote: 50_000n * QUOTE_SCALE,
          liquidationPriceQuote: 75_000n * QUOTE_SCALE,
        },
      });
      const result = evaluateRisk(snapshot, config);

      expect(result.level).toBe("BLOCKED");
      expect(result.action).toBe("BLOCK");
      expect(result.reasons).toContain("Leverage exceeds maximum");
    });
  });

  describe("DANGER/EXIT scenarios", () => {
    it("should EXIT when daily loss exceeds maximum", () => {
      const snapshot = createSafeSnapshot({
        dailyPnlQuote: -600n * QUOTE_SCALE, // -$600 > $500 max loss
      });
      const result = evaluateRisk(snapshot, config);

      expect(result.level).toBe("DANGER");
      expect(result.action).toBe("EXIT");
      expect(result.reasons).toContain("Daily loss exceeds maximum");
    });

    it("should EXIT when drawdown exceeds maximum", () => {
      const snapshot = createSafeSnapshot({
        equityQuote: 85_000n * QUOTE_SCALE, // $85,000
        peakEquityQuote: 100_000n * QUOTE_SCALE, // 15% drawdown > 10% max
      });
      const result = evaluateRisk(snapshot, config);

      expect(result.level).toBe("DANGER");
      expect(result.action).toBe("EXIT");
      expect(result.reasons).toContain("Drawdown exceeds maximum");
    });

    it("should EXIT when liquidation buffer below minimum", () => {
      const snapshot = createSafeSnapshot({
        position: {
          side: "SHORT",
          notionalQuote: 5_000n * QUOTE_SCALE,
          leverageBps: 5000n,
          markPriceQuote: 50_000n * QUOTE_SCALE,
          // Liquidation at $54,000 -> 8% buffer < 20% min
          liquidationPriceQuote: 54_000n * QUOTE_SCALE,
        },
      });
      const result = evaluateRisk(snapshot, config);

      expect(result.level).toBe("DANGER");
      expect(result.action).toBe("EXIT");
      expect(result.reasons).toContain("Liquidation buffer below minimum");
    });
  });

  describe("WARNING/PAUSE scenarios", () => {
    it("should PAUSE when margin utilization exceeds maximum", () => {
      const snapshot = createSafeSnapshot({
        equityQuote: 100_000n * QUOTE_SCALE,
        marginUsedQuote: 85_000n * QUOTE_SCALE, // 85% > 80% max
      });
      const result = evaluateRisk(snapshot, config);

      expect(result.level).toBe("WARNING");
      expect(result.action).toBe("PAUSE");
      expect(result.reasons).toContain("Margin utilization exceeds maximum");
    });
  });

  describe("CAUTION scenarios", () => {
    it("should CAUTION when position size approaching limit", () => {
      const snapshot = createSafeSnapshot({
        position: {
          side: "SHORT",
          notionalQuote: 8_000n * QUOTE_SCALE, // $8,000 > $7,500 warning
          leverageBps: 5000n,
          markPriceQuote: 50_000n * QUOTE_SCALE,
          liquidationPriceQuote: 75_000n * QUOTE_SCALE,
        },
      });
      const result = evaluateRisk(snapshot, config);

      expect(result.level).toBe("CAUTION");
      expect(result.action).toBe("ALLOW");
      expect(result.reasons).toContain("Position size approaching limit");
    });

    it("should CAUTION when margin utilization approaching limit", () => {
      const snapshot = createSafeSnapshot({
        equityQuote: 100_000n * QUOTE_SCALE,
        marginUsedQuote: 75_000n * QUOTE_SCALE, // 75% > 70% warning, < 80% max
      });
      const result = evaluateRisk(snapshot, config);

      expect(result.level).toBe("CAUTION");
      expect(result.action).toBe("ALLOW");
      expect(result.reasons).toContain("Margin utilization approaching limit");
    });

    it("should CAUTION when liquidation buffer approaching minimum", () => {
      const snapshot = createSafeSnapshot({
        position: {
          side: "SHORT",
          notionalQuote: 5_000n * QUOTE_SCALE,
          leverageBps: 5000n,
          markPriceQuote: 50_000n * QUOTE_SCALE,
          // Liquidation at $62,000 -> 24% buffer < 30% warning, > 20% min
          liquidationPriceQuote: 62_000n * QUOTE_SCALE,
        },
      });
      const result = evaluateRisk(snapshot, config);

      expect(result.level).toBe("CAUTION");
      expect(result.action).toBe("ALLOW");
      expect(result.reasons).toContain("Liquidation buffer approaching minimum");
    });
  });

  describe("escalation (multiple violations)", () => {
    it("should escalate to highest severity when multiple violations", () => {
      const snapshot = createSafeSnapshot({
        position: {
          side: "SHORT",
          notionalQuote: 15_000n * QUOTE_SCALE, // BLOCKED: > $10,000
          leverageBps: 40000n, // BLOCKED: > 3x
          markPriceQuote: 50_000n * QUOTE_SCALE,
          liquidationPriceQuote: 54_000n * QUOTE_SCALE, // DANGER: < 20% buffer
        },
        dailyPnlQuote: -600n * QUOTE_SCALE, // DANGER: > $500 loss
        equityQuote: 100_000n * QUOTE_SCALE,
        marginUsedQuote: 85_000n * QUOTE_SCALE, // WARNING: > 80%
      });
      const result = evaluateRisk(snapshot, config);

      // Should be BLOCKED (highest) not DANGER or WARNING
      expect(result.level).toBe("BLOCKED");
      expect(result.action).toBe("BLOCK");
      // Should have multiple reasons
      expect(result.reasons.length).toBeGreaterThanOrEqual(4);
    });

    it("should not downgrade from BLOCKED to DANGER", () => {
      const snapshot = createSafeSnapshot({
        position: {
          side: "SHORT",
          notionalQuote: 15_000n * QUOTE_SCALE, // BLOCKED
          leverageBps: 5000n,
          markPriceQuote: 50_000n * QUOTE_SCALE,
          liquidationPriceQuote: 54_000n * QUOTE_SCALE, // DANGER
        },
      });
      const result = evaluateRisk(snapshot, config);

      expect(result.level).toBe("BLOCKED");
      expect(result.action).toBe("BLOCK");
    });

    it("should not downgrade from DANGER to WARNING", () => {
      const snapshot = createSafeSnapshot({
        dailyPnlQuote: -600n * QUOTE_SCALE, // DANGER
        equityQuote: 100_000n * QUOTE_SCALE,
        marginUsedQuote: 85_000n * QUOTE_SCALE, // WARNING
      });
      const result = evaluateRisk(snapshot, config);

      expect(result.level).toBe("DANGER");
      expect(result.action).toBe("EXIT");
    });
  });

  describe("custom config", () => {
    it("should respect custom config limits", () => {
      const customConfig: RiskConfig = {
        ...config,
        maxPositionSizeUsd: 50000, // $50,000 (more permissive)
        warningPositionSizeUsd: 40000, // $40,000 warning (also more permissive)
      };
      const snapshot = createSafeSnapshot({
        position: {
          side: "SHORT",
          notionalQuote: 15_000n * QUOTE_SCALE, // $15,000 (under both custom limits)
          leverageBps: 5000n,
          markPriceQuote: 50_000n * QUOTE_SCALE,
          liquidationPriceQuote: 75_000n * QUOTE_SCALE,
        },
      });
      const result = evaluateRisk(snapshot, customConfig);

      expect(result.level).toBe("SAFE");
      expect(result.action).toBe("ALLOW");
    });
  });
});
