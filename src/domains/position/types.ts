/**
 * Position derivation types and schemas.
 *
 * @see {@link ../../../adrs/0001-bot-architecture.md ADR-0001: Bot Architecture}
 */

import * as v from "valibot";

import { bigintSchema, positionSideSchema } from "@/adapters/types";

const dateSchema = v.custom<Date>((input) => input instanceof Date, "Expected Date");

/**
 * Source of position data.
 */
export type PositionSource = "rest" | "derived" | "reconciled";

/**
 * Configuration for position derivation.
 *
 * Contains asset-specific metadata needed for calculations.
 */
export interface PositionConfig {
  perpSymbol: string;
  baseAsset: string;
  quoteAsset: string;
  baseDecimals: number;
}

/**
 * Enriched position state derived from exchange data.
 *
 * Extends the raw exchange Position with computed metrics and tracking fields.
 */
export interface DerivedPosition {
  // Position state
  open: boolean;
  side: "LONG" | "SHORT" | null;

  // Size and value
  spotQuantityBase: bigint;
  perpQuantityBase: bigint;
  notionalQuote: bigint;

  // Entry tracking
  entryTime: Date | null;
  entryPriceQuote: bigint | null;
  entryFundingRateBps: bigint | null;

  // Current metrics
  markPriceQuote: bigint;
  unrealizedPnlQuote: bigint;
  fundingAccruedQuote: bigint;

  // Margin and risk
  marginUsedQuote: bigint;
  marginBufferBps: bigint;
  liquidationPriceQuote: bigint | null;
  liquidationDistanceBps: bigint;

  // Metadata
  lastUpdated: Date;
  source: PositionSource;
}

/**
 * Field-level inconsistency detected during reconciliation.
 */
export interface Inconsistency {
  field: string;
  expected: bigint;
  actual: bigint;
  severity: "warning" | "critical";
}

/**
 * Result of position reconciliation.
 *
 * Compares derived position against authoritative exchange position.
 */
export interface ReconciliationResult {
  consistent: boolean;
  inconsistencies: Inconsistency[];
  correctedPosition: DerivedPosition;
}

// Valibot Schemas

export const positionSourceSchema = v.picklist(["rest", "derived", "reconciled"] as const);

export const positionConfigSchema = v.object({
  perpSymbol: v.string(),
  baseAsset: v.string(),
  quoteAsset: v.string(),
  baseDecimals: v.number(),
});

export const inconsistencySeveritySchema = v.picklist(["warning", "critical"] as const);

export const inconsistencySchema = v.object({
  field: v.string(),
  expected: bigintSchema,
  actual: bigintSchema,
  severity: inconsistencySeveritySchema,
});

export const derivedPositionSchema = v.object({
  open: v.boolean(),
  side: v.nullable(positionSideSchema),
  spotQuantityBase: bigintSchema,
  perpQuantityBase: bigintSchema,
  notionalQuote: bigintSchema,
  entryTime: v.nullable(dateSchema),
  entryPriceQuote: v.nullable(bigintSchema),
  entryFundingRateBps: v.nullable(bigintSchema),
  markPriceQuote: bigintSchema,
  unrealizedPnlQuote: bigintSchema,
  fundingAccruedQuote: bigintSchema,
  marginUsedQuote: bigintSchema,
  marginBufferBps: bigintSchema,
  liquidationPriceQuote: v.nullable(bigintSchema),
  liquidationDistanceBps: bigintSchema,
  lastUpdated: dateSchema,
  source: positionSourceSchema,
});

export const reconciliationResultSchema = v.object({
  consistent: v.boolean(),
  inconsistencies: v.array(inconsistencySchema),
  correctedPosition: derivedPositionSchema,
});

// Type Guards

export const isPositionSource = (value: unknown): value is PositionSource =>
  v.is(positionSourceSchema, value);

export const isPositionConfig = (value: unknown): value is PositionConfig =>
  v.is(positionConfigSchema, value);

export const isDerivedPosition = (value: unknown): value is DerivedPosition =>
  v.is(derivedPositionSchema, value);

export const isInconsistency = (value: unknown): value is Inconsistency =>
  v.is(inconsistencySchema, value);

export const isReconciliationResult = (value: unknown): value is ReconciliationResult =>
  v.is(reconciliationResultSchema, value);
