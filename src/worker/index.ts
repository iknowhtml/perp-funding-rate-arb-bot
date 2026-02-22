/**
 * Worker module exports.
 */

export type {
  EvaluatorDeps,
  HealthAction,
  HealthResponse,
  HealthSnapshot,
  StartupDeps,
} from "./evaluator";
export type { DataPlane, DataPlaneConfig } from "./data-plane";
export type {
  EnterHedgeDeps,
  EnterHedgeExecutionParams,
  ExecutionConfig,
  ExecutionResult,
  ExitHedgeDeps,
  ExitHedgeExecutionParams,
  HedgeDrift,
  SlippageEstimate,
} from "./execution";
export type { FreshnessConfig } from "./freshness";
export type { BalanceInconsistency, ReconcilerConfig, ReconcilerResult } from "./reconciler";
export type { StartWorkerConfig, WorkerHandle } from "./start-worker";
export type { BotState, StateStore } from "./state";

export { evaluate, runStartupSequence } from "./evaluator";
export { createDataPlane } from "./data-plane";
export {
  createExecutionCircuitBreaker,
  DEFAULT_EXECUTION_CONFIG,
  EXECUTION_CIRCUIT_BREAKER_CONFIG,
  ExecutionError,
  executeEnterHedge,
  executeExitHedge,
  OrderFillTimeoutError,
  SlippageExceededError,
} from "./execution";
export { DEFAULT_FRESHNESS_CONFIG, FreshnessConfigSchema, isStateFresh } from "./freshness";
export { DEFAULT_RECONCILER_CONFIG, ReconcilerConfigSchema, runReconcile } from "./reconciler";
export { startWorker } from "./start-worker";
export { createStateStore } from "./state";
