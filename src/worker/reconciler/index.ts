/**
 * Reconciler module exports.
 *
 * @see {@link ../../../adrs/0001-bot-architecture.md ADR-0001: Bot Architecture}
 */

// Types
export type { BalanceInconsistency, ReconcilerConfig, ReconcilerResult } from "./types";

// Schemas
export {
  ReconcilerConfigSchema,
  balanceInconsistencySchema,
  reconcilerResultSchema,
} from "./types";

// Config
export { DEFAULT_RECONCILER_CONFIG } from "./types";

// Type guards
export { isReconcilerConfig, isReconcilerResult } from "./types";

// Functions
export { runReconcile } from "./reconcile";
