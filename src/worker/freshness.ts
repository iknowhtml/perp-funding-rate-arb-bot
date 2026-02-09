/**
 * State freshness configuration and staleness detection.
 *
 * @see {@link ../../adrs/0001-bot-architecture.md ADR-0001: Bot Architecture}
 */

import * as v from "valibot";

import type { BotState } from "./state";

/**
 * Configuration for state freshness thresholds.
 * Each data source has its own staleness threshold based on update cadence.
 *
 * - tickerStaleMs: WebSocket ticker updates (continuous)
 * - fundingStaleMs: REST funding rate polls (30s interval per ADR-0001)
 * - accountStaleMs: REST account polls (30s interval per ADR-0001)
 */
export const FreshnessConfigSchema = v.object({
  tickerStaleMs: v.pipe(v.number(), v.minValue(1000), v.maxValue(60000)),
  fundingStaleMs: v.pipe(v.number(), v.minValue(1000), v.maxValue(300000)),
  accountStaleMs: v.pipe(v.number(), v.minValue(1000), v.maxValue(300000)),
});

export type FreshnessConfig = v.InferOutput<typeof FreshnessConfigSchema>;

/**
 * Default freshness thresholds derived from polling cadences.
 * See ADR-0001: Bot Architecture for update intervals.
 */
export const DEFAULT_FRESHNESS_CONFIG: FreshnessConfig = {
  tickerStaleMs: 5_000, // 5s - WebSocket should be very fresh
  fundingStaleMs: 60_000, // 60s - 30s REST poll + buffer
  accountStaleMs: 45_000, // 45s - 30s REST poll + buffer
};

/**
 * Check if state is fresh based on per-source staleness thresholds.
 * Each data source is checked independently with its own threshold.
 */
export const isStateFresh = (state: BotState, config: FreshnessConfig): boolean => {
  const now = Date.now();

  const tickerFresh = state.lastTickerUpdate
    ? now - state.lastTickerUpdate.getTime() < config.tickerStaleMs
    : false;

  const fundingFresh = state.lastFundingUpdate
    ? now - state.lastFundingUpdate.getTime() < config.fundingStaleMs
    : false;

  const accountFresh = state.lastAccountUpdate
    ? now - state.lastAccountUpdate.getTime() < config.accountStaleMs
    : false;

  return tickerFresh && fundingFresh && accountFresh && state.wsConnected;
};
