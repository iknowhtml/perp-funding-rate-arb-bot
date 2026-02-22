import { describe, expect, it, vi } from "vitest";

import {
  calculateImpactDistribution,
  calculatePercentile,
  evaluateGoNoGo,
  getImpactDistributions,
} from "./impact-analysis";

vi.mock("@/lib/env/env", () => ({
  env: {
    DATABASE_URL: "postgresql://localhost/test",
    PORT: 3000,
    NODE_ENV: "test",
    ARBITRUM_RPC_URL: "https://arb1.arbitrum.io/rpc",
  },
}));

describe("calculatePercentile", () => {
  it("returns median for [1,2,3,4,5]", () => {
    expect(calculatePercentile([1n, 2n, 3n, 4n, 5n], 50)).toBe(3n);
  });

  it("returns p90 for [1,2,3,4,5]", () => {
    expect(calculatePercentile([1n, 2n, 3n, 4n, 5n], 90)).toBe(5n);
  });

  it("returns median for single element", () => {
    expect(calculatePercentile([10n], 50)).toBe(10n);
  });

  it("returns p90 for single element", () => {
    expect(calculatePercentile([10n], 90)).toBe(10n);
  });

  it("handles empty array", () => {
    expect(calculatePercentile([], 50)).toBe(0n);
  });
});

describe("calculateImpactDistribution", () => {
  it("computes all metrics correctly", () => {
    const values = [1n, 2n, 3n, 4n, 5n];
    const d = calculateImpactDistribution(values, "0x123");
    expect(d.market).toBe("0x123");
    expect(d.sampleCount).toBe(5);
    expect(d.medianBps).toBe(3n);
    expect(d.p90Bps).toBe(5n);
    expect(d.minBps).toBe(1n);
    expect(d.maxBps).toBe(5n);
    expect(d.meanBps).toBe(3n);
  });
});

describe("evaluateGoNoGo", () => {
  it("passes when median < 3 and p90 < 8", () => {
    const d = calculateImpactDistribution([1n, 2n, 2n], "0x123");
    const result = evaluateGoNoGo([d]);
    expect(result.passed).toBe(true);
    expect(result.markets[0].medianPassed).toBe(true);
    expect(result.markets[0].p90Passed).toBe(true);
  });

  it("fails when median >= 3", () => {
    const d = calculateImpactDistribution([3n, 4n, 5n], "0x123");
    const result = evaluateGoNoGo([d]);
    expect(result.passed).toBe(false);
    expect(result.markets[0].medianPassed).toBe(false);
  });

  it("fails when p90 >= 8", () => {
    const d = calculateImpactDistribution([1n, 2n, 8n], "0x123");
    const result = evaluateGoNoGo([d]);
    expect(result.passed).toBe(false);
    expect(result.markets[0].p90Passed).toBe(false);
  });

  it("uses custom thresholds", () => {
    const d = calculateImpactDistribution([5n, 6n], "0x123");
    const result = evaluateGoNoGo([d], {
      medianBps: 10n,
      p90Bps: 10n,
    });
    expect(result.passed).toBe(true);
  });
});

describe("getImpactDistributions", () => {
  it("returns empty when no rows", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    } as never;

    const result = await getImpactDistributions(mockDb, { sinceDaysAgo: 1 });
    expect(result).toEqual([]);
  });

  it("returns distribution when rows exist", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { market: "0x123", simulatedImpactBps: 2n },
            { market: "0x123", simulatedImpactBps: 4n },
          ]),
        }),
      }),
    } as never;

    const result = await getImpactDistributions(mockDb, { sinceDaysAgo: 1 });
    expect(result).toHaveLength(1);
    expect(result[0].market).toBe("0x123");
    expect(result[0].sampleCount).toBe(2);
  });
});
