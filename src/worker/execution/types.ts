/**
 * Execution engine types, schemas, config, and errors.
 *
 * @see {@link ../../../../adrs/0001-bot-architecture.md ADR-0001: Bot Architecture}
 * @see {@link ../../../../adrs/0013-execution-safety-slippage.md ADR-0013: Execution Safety & Slippage}
 */

import * as v from "valibot";

import { exchangeOrderSchema } from "@/adapters/types";
import type { ExchangeOrder } from "@/adapters/types";

// --- Execution Result ---

/**
 * Result of an execution (enter or exit hedge).
 */
export interface ExecutionResult {
  success: boolean;
  aborted: boolean;
  reason?: string;
  perpOrder?: ExchangeOrder;
  spotOrder?: ExchangeOrder;
  drift?: HedgeDrift;
  slippageEstimate?: SlippageEstimate;
  timestamp: Date;
}

// --- Hedge Drift ---

/**
 * Hedge drift between perp and spot notional values.
 *
 * Drift is measured in bps relative to the perp notional.
 * Notional values are in quote currency smallest units (`*Quote`).
 */
export interface HedgeDrift {
  perpNotionalQuote: bigint;
  spotNotionalQuote: bigint;
  driftBps: bigint;
  needsCorrection: boolean;
}

// --- Slippage ---

/**
 * Slippage estimate from order book simulation.
 *
 * All prices in quote currency smallest units (`*Quote`),
 * slippage in basis points (`*Bps`).
 */
export interface SlippageEstimate {
  estimatedSlippageBps: bigint;
  avgFillPriceQuote: bigint;
  midPriceQuote: bigint;
  availableDepthBase: bigint;
  requiredDepthBase: bigint;
  canExecute: boolean;
}

// --- Execution Config ---

/**
 * Configuration for execution engine behavior.
 */
export interface ExecutionConfig {
  /** Maximum acceptable slippage in basis points. */
  maxSlippageBps: bigint;
  /** Maximum hedge drift before correction in basis points. */
  maxDriftBps: bigint;
  /** Timeout for order fill confirmation in ms. */
  orderFillTimeoutMs: number;
  /** Interval between fill confirmation polls in ms. */
  fillPollIntervalMs: number;
  /** Maximum fill poll attempts before timeout. */
  fillPollMaxAttempts: number;
  /** Maximum retries for partial fill completion. */
  maxPartialFillRetries: number;
  /** Minimum liquidity depth multiplier (e.g., 3 = need 3x depth). */
  minLiquidityMultiplier: bigint;
}

export const ExecutionConfigSchema = v.object({
  maxSlippageBps: v.bigint(),
  maxDriftBps: v.bigint(),
  orderFillTimeoutMs: v.pipe(v.number(), v.minValue(1000)),
  fillPollIntervalMs: v.pipe(v.number(), v.minValue(100)),
  fillPollMaxAttempts: v.pipe(v.number(), v.minValue(1)),
  maxPartialFillRetries: v.pipe(v.number(), v.minValue(1)),
  minLiquidityMultiplier: v.bigint(),
});

export const DEFAULT_EXECUTION_CONFIG: ExecutionConfig = {
  maxSlippageBps: 50n, // 0.5%
  maxDriftBps: 50n, // 0.5%
  orderFillTimeoutMs: 60_000, // 60 seconds
  fillPollIntervalMs: 500, // 500ms between polls
  fillPollMaxAttempts: 120, // 60s / 500ms
  maxPartialFillRetries: 3,
  minLiquidityMultiplier: 3n, // Need 3x the depth
};

// --- Constants ---

/** Basis points per unit (1 = 10000 bps). */
export const BPS_PER_UNIT = 10000n;

// --- Errors ---

/**
 * Base error for execution failures.
 */
export class ExecutionError extends Error {
  public readonly code: string;

  constructor(message: string, code: string, cause?: unknown) {
    super(message, { cause });
    this.name = "ExecutionError";
    this.code = code;
  }
}

/**
 * Error when order fill confirmation times out.
 */
export class OrderFillTimeoutError extends ExecutionError {
  constructor(
    public readonly orderId: string,
    public readonly timeoutMs: number,
  ) {
    super(
      `Order ${orderId} fill confirmation timed out after ${timeoutMs}ms`,
      "ORDER_FILL_TIMEOUT",
    );
    this.name = "OrderFillTimeoutError";
  }
}

/**
 * Error when pre-trade slippage exceeds limits.
 */
export class SlippageExceededError extends ExecutionError {
  constructor(
    public readonly estimatedSlippageBps: bigint,
    public readonly maxSlippageBps: bigint,
  ) {
    super(
      `Estimated slippage ${estimatedSlippageBps}bps exceeds limit ${maxSlippageBps}bps`,
      "SLIPPAGE_EXCEEDED",
    );
    this.name = "SlippageExceededError";
  }
}

// --- Valibot Schemas ---

export const hedgeDriftSchema = v.object({
  perpNotionalQuote: v.bigint(),
  spotNotionalQuote: v.bigint(),
  driftBps: v.bigint(),
  needsCorrection: v.boolean(),
});

export const slippageEstimateSchema = v.object({
  estimatedSlippageBps: v.bigint(),
  avgFillPriceQuote: v.bigint(),
  midPriceQuote: v.bigint(),
  availableDepthBase: v.bigint(),
  requiredDepthBase: v.bigint(),
  canExecute: v.boolean(),
});

export const executionResultSchema = v.object({
  success: v.boolean(),
  aborted: v.boolean(),
  reason: v.optional(v.string()),
  perpOrder: v.optional(exchangeOrderSchema),
  spotOrder: v.optional(exchangeOrderSchema),
  drift: v.optional(hedgeDriftSchema),
  slippageEstimate: v.optional(slippageEstimateSchema),
  timestamp: v.date(),
});

// --- Type Guards ---

export const isHedgeDrift = (value: unknown): value is HedgeDrift => v.is(hedgeDriftSchema, value);

export const isSlippageEstimate = (value: unknown): value is SlippageEstimate =>
  v.is(slippageEstimateSchema, value);

export const isExecutionConfig = (value: unknown): value is ExecutionConfig =>
  v.is(ExecutionConfigSchema, value);
