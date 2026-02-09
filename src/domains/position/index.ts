/**
 * Position derivation module exports.
 *
 * @see {@link ../../../adrs/0001-bot-architecture.md ADR-0001: Bot Architecture}
 */

// Types
export type {
  DerivedPosition,
  Inconsistency,
  PositionConfig,
  PositionSource,
  ReconciliationResult,
} from "./types";

// Type guards
export {
  isDerivedPosition,
  isInconsistency,
  isPositionConfig,
  isPositionSource,
  isReconciliationResult,
} from "./types";

// Schemas
export {
  derivedPositionSchema,
  inconsistencySchema,
  inconsistencySeveritySchema,
  positionConfigSchema,
  positionSourceSchema,
  reconciliationResultSchema,
} from "./types";

// Metrics
export {
  calculateBaseUnitScale,
  calculateLiquidationDistanceBps,
  calculateMarginUtilizationBps,
  calculateNotionalQuote,
  calculateUnrealizedPnlQuote,
} from "./metrics";

// Derivation
export { derivePosition } from "./derive";

// Reconciliation
export { reconcilePosition } from "./reconcile";
