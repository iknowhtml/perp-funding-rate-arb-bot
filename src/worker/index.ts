/**
 * Worker module exports.
 */

export {
  createDataPlane,
  type DataPlane,
  type DataPlaneConfig,
} from "./data-plane";

export {
  // Execution engine
  createExecutionCircuitBreaker,
  DEFAULT_EXECUTION_CONFIG,
  EXECUTION_CIRCUIT_BREAKER_CONFIG,
  ExecutionError,
  executeEnterHedge,
  executeExitHedge,
  OrderFillTimeoutError,
  SlippageExceededError,
  type EnterHedgeDeps,
  type EnterHedgeExecutionParams,
  type ExecutionConfig,
  type ExecutionResult,
  type ExitHedgeDeps,
  type ExitHedgeExecutionParams,
  type HedgeDrift,
  type SlippageEstimate,
} from "./execution";

export {
  DEFAULT_FRESHNESS_CONFIG,
  FreshnessConfigSchema,
  isStateFresh,
  type FreshnessConfig,
} from "./freshness";

export {
  DEFAULT_RECONCILER_CONFIG,
  ReconcilerConfigSchema,
  runReconcile,
  type BalanceInconsistency,
  type ReconcilerConfig,
  type ReconcilerResult,
} from "./reconciler";

export {
  startWorker,
  type StartWorkerConfig,
  type WorkerHandle,
} from "./start-worker";

export {
  createStateStore,
  type BotState,
  type StateStore,
} from "./state";
