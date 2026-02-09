/**
 * Strategy engine module exports.
 *
 * @see {@link ../../../adrs/0014-funding-rate-strategy.md ADR-0014: Funding Rate Prediction & Strategy}
 */

// Types
export type {
  EnterHedgeParams,
  EntrySignal,
  ExitReason,
  ExitSignal,
  FundingRateHistory,
  FundingRateRegime,
  FundingRateSnapshot,
  FundingRateSource,
  FundingRateTrend,
  SignalConfidence,
  StrategyInput,
  StrategyPosition,
  TradingIntent,
} from "./types";

// Type guards
export {
  isEnterHedgeParams,
  isEntrySignal,
  isExitReason,
  isExitSignal,
  isFundingRateHistory,
  isFundingRateRegime,
  isFundingRateSnapshot,
  isFundingRateSource,
  isFundingRateTrend,
  isSignalConfidence,
  isStrategyInput,
  isStrategyPosition,
  isTradingIntent,
} from "./types";

// Schemas
export {
  enterHedgeParamsSchema,
  entrySignalSchema,
  exitReasonSchema,
  exitSignalSchema,
  fundingRateHistorySchema,
  fundingRateRegimeSchema,
  fundingRateSnapshotSchema,
  fundingRateSourceSchema,
  fundingRateTrendSchema,
  signalConfidenceSchema,
  strategyInputSchema,
  strategyPositionSchema,
  tradingIntentSchema,
} from "./types";

// Config
export type { StrategyConfig } from "./config";
export { DEFAULT_STRATEGY_CONFIG, StrategyConfigSchema } from "./config";

// Trend analysis
export {
  analyzeFundingRateTrend,
  bigintSqrt,
  calculateSma,
  calculateStdDev,
} from "./trend-analysis";

// Entry signals
export { generateEntrySignal } from "./entry-signal";

// Exit signals
export {
  calculateRealizedYieldBps,
  generateExitSignal,
} from "./exit-signal";

// Strategy evaluation
export { evaluateStrategy } from "./evaluate";
