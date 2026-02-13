import { executionEstimate } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { gte } from "drizzle-orm";

import type { Database } from "@/lib/db/client";

export const DEFAULT_MEDIAN_THRESHOLD_BPS = 3n;
export const DEFAULT_P90_THRESHOLD_BPS = 8n;

export interface ImpactDistribution {
  market: string;
  sampleCount: number;
  medianBps: bigint;
  p90Bps: bigint;
  minBps: bigint;
  maxBps: bigint;
  meanBps: bigint;
}

export interface MarketGoNoGo {
  market: string;
  distribution: ImpactDistribution;
  medianPassed: boolean;
  p90Passed: boolean;
}

export interface GoNoGoResult {
  passed: boolean;
  markets: MarketGoNoGo[];
}

export const calculatePercentile = (sortedValues: bigint[], percentile: number): bigint => {
  if (sortedValues.length === 0) return 0n;
  const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
  const clampedIndex = Math.max(0, index);
  const value = sortedValues[clampedIndex];
  return value ?? 0n;
};

export const calculateImpactDistribution = (
  impactBpsValues: bigint[],
  market: string,
): ImpactDistribution => {
  const sorted = [...impactBpsValues].sort((a, b) => {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  });
  const count = sorted.length;
  const medianBps = calculatePercentile(sorted, 50);
  const p90Bps = calculatePercentile(sorted, 90);
  const minBps = count > 0 ? (sorted[0] ?? 0n) : 0n;
  const maxBps = count > 0 ? (sorted[count - 1] ?? 0n) : 0n;
  const sum = sorted.reduce((a, b) => a + b, 0n);
  const meanBps = count > 0 ? sum / BigInt(count) : 0n;

  return {
    market,
    sampleCount: count,
    medianBps,
    p90Bps,
    minBps,
    maxBps,
    meanBps,
  };
};

export const getImpactDistributions = async (
  database: Database,
  options?: { sinceDaysAgo?: number },
): Promise<ImpactDistribution[]> => {
  const sinceDaysAgo = options?.sinceDaysAgo ?? 7;
  const since = new Date();
  since.setDate(since.getDate() - sinceDaysAgo);

  const rows = await database
    .select({
      market: executionEstimate.market,
      simulatedImpactBps: executionEstimate.simulatedImpactBps,
    })
    .from(executionEstimate)
    .where(gte(executionEstimate.ts, since));

  const byMarket = new Map<string, bigint[]>();
  for (const row of rows) {
    const bps = row.simulatedImpactBps ?? 0n;
    const arr = byMarket.get(row.market) ?? [];
    arr.push(bps);
    byMarket.set(row.market, arr);
  }

  const distributions: ImpactDistribution[] = [];
  for (const [market, values] of byMarket.entries()) {
    distributions.push(calculateImpactDistribution(values, market));
  }
  return distributions;
};

export const evaluateGoNoGo = (
  distributions: ImpactDistribution[],
  thresholds?: { medianBps?: bigint; p90Bps?: bigint },
): GoNoGoResult => {
  const medianThreshold = thresholds?.medianBps ?? DEFAULT_MEDIAN_THRESHOLD_BPS;
  const p90Threshold = thresholds?.p90Bps ?? DEFAULT_P90_THRESHOLD_BPS;

  const markets: MarketGoNoGo[] = distributions.map((d) => {
    const medianPassed = d.medianBps < medianThreshold;
    const p90Passed = d.p90Bps < p90Threshold;
    return {
      market: d.market,
      distribution: d,
      medianPassed,
      p90Passed,
    };
  });

  const passed = markets.every((m) => m.medianPassed && m.p90Passed);
  return { passed, markets };
};

export const runGoNoGoCheck = async (
  database: Database,
  thresholds?: { medianBps?: bigint; p90Bps?: bigint },
): Promise<GoNoGoResult> => {
  const distributions = await getImpactDistributions(database);
  const result = evaluateGoNoGo(distributions, thresholds);

  for (const m of result.markets) {
    const status = m.medianPassed && m.p90Passed ? "PASS" : "FAIL";
    logger.info(`Go/No-Go ${status}: ${m.market}`, {
      medianBps: m.distribution.medianBps.toString(),
      p90Bps: m.distribution.p90Bps.toString(),
      sampleCount: m.distribution.sampleCount,
    });
  }

  logger.info(result.passed ? "Go/No-Go: OVERALL PASS" : "Go/No-Go: OVERALL FAIL");
  return result;
};
