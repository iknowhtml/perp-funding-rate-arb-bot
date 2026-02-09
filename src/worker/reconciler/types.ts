/**
 * Reconciler types, schemas, config, and type guards.
 *
 * @see {@link ../../../adrs/0001-bot-architecture.md ADR-0001: Bot Architecture}
 */

import * as v from "valibot";

import { derivedPositionSchema, inconsistencySchema } from "@/domains/position";
import type { DerivedPosition, Inconsistency } from "@/domains/position";

// --- Config ---

/**
 * Configuration for periodic reconciliation.
 */
export interface ReconcilerConfig {
  /** Reconciliation interval in ms. */
  intervalMs: number;
  /** Position size tolerance in bps. */
  toleranceSizeBps: bigint;
  /** Price tolerance in bps. */
  tolerancePriceBps: bigint;
  /** Balance tolerance in bps. */
  toleranceBalanceBps: bigint;
  /** Perpetual symbol (e.g., "BTC-USD-PERP"). */
  perpSymbol: string;
  /** Base asset (e.g., "BTC"). */
  baseAsset: string;
  /** Quote asset (e.g., "USD"). */
  quoteAsset: string;
  /** Base asset decimal places. */
  baseDecimals: number;
}

export const ReconcilerConfigSchema = v.object({
  intervalMs: v.pipe(v.number(), v.minValue(1000)),
  toleranceSizeBps: v.bigint(),
  tolerancePriceBps: v.bigint(),
  toleranceBalanceBps: v.bigint(),
  perpSymbol: v.string(),
  baseAsset: v.string(),
  quoteAsset: v.string(),
  baseDecimals: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(18)),
});

export const DEFAULT_RECONCILER_CONFIG: ReconcilerConfig = {
  intervalMs: 60_000, // 60 seconds
  toleranceSizeBps: 50n, // 0.5%
  tolerancePriceBps: 100n, // 1%
  toleranceBalanceBps: 50n, // 0.5%
  perpSymbol: "BTC-USD-PERP",
  baseAsset: "BTC",
  quoteAsset: "USD",
  baseDecimals: 8,
};

// --- Balance Inconsistency ---

/**
 * Balance drift detected during reconciliation.
 */
export interface BalanceInconsistency {
  asset: string;
  field: "totalBase" | "availableBase";
  expected: bigint;
  actual: bigint;
  diffBps: bigint;
  severity: "warning" | "critical";
}

export const balanceInconsistencySchema = v.object({
  asset: v.string(),
  field: v.picklist(["totalBase", "availableBase"] as const),
  expected: v.bigint(),
  actual: v.bigint(),
  diffBps: v.bigint(),
  severity: v.picklist(["warning", "critical"] as const),
});

// --- Result ---

/**
 * Result of a reconciliation run.
 */
export interface ReconcilerResult {
  consistent: boolean;
  positionInconsistencies: Inconsistency[];
  balanceInconsistencies: BalanceInconsistency[];
  correctedPosition: DerivedPosition;
  timestamp: Date;
}

export const reconcilerResultSchema = v.object({
  consistent: v.boolean(),
  positionInconsistencies: v.array(inconsistencySchema),
  balanceInconsistencies: v.array(balanceInconsistencySchema),
  correctedPosition: derivedPositionSchema,
  timestamp: v.date(),
});

// --- Type Guards ---

export const isReconcilerConfig = (value: unknown): value is ReconcilerConfig =>
  v.is(ReconcilerConfigSchema, value);

export const isReconcilerResult = (value: unknown): value is ReconcilerResult =>
  v.is(reconcilerResultSchema, value);
