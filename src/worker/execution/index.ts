/**
 * Execution engine module exports.
 *
 * Provides hedged position entry/exit with safety checks:
 * - Two-phase risk validation
 * - Slippage estimation and validation
 * - Order fill confirmation polling
 * - Partial fill handling
 * - Hedge drift detection and correction
 * - Execution circuit breaker
 *
 * @see {@link ../../../../adrs/0001-bot-architecture.md ADR-0001: Bot Architecture}
 */

// Types and config
export type {
  ExecutionConfig,
  ExecutionResult,
  HedgeDrift,
  SlippageEstimate,
} from "./types";

export {
  BPS_PER_UNIT,
  DEFAULT_EXECUTION_CONFIG,
  ExecutionConfigSchema,
  ExecutionError,
  OrderFillTimeoutError,
  SlippageExceededError,
} from "./types";

// Schemas and type guards
export {
  executionResultSchema,
  hedgeDriftSchema,
  isExecutionConfig,
  isHedgeDrift,
  isSlippageEstimate,
  slippageEstimateSchema,
} from "./types";

// Fill confirmation
export { confirmOrderFill, isTerminalOrderStatus } from "./fill-confirmation";

// Partial fills
export {
  calculateRemainingBase,
  completePartialFill,
  handlePartialFills,
  isPartiallyFilled,
} from "./partial-fills";

// Slippage
export {
  calculateAvailableDepthBase,
  calculateMidPriceQuote,
  estimateSlippage,
  validateExecution,
} from "./slippage";

// Drift
export {
  calculateHedgeDrift,
  calculateOrderNotionalQuote,
  correctDrift,
} from "./drift";

// Enter hedge
export { executeEnterHedge } from "./enter-hedge";
export type { EnterHedgeDeps, EnterHedgeExecutionParams } from "./enter-hedge";

// Exit hedge
export { executeExitHedge, verifyFlatPosition } from "./exit-hedge";
export type { ExitHedgeDeps, ExitHedgeExecutionParams } from "./exit-hedge";

// Circuit breaker
export {
  createExecutionCircuitBreaker,
  EXECUTION_CIRCUIT_BREAKER_CONFIG,
} from "./execution-circuit-breaker";
