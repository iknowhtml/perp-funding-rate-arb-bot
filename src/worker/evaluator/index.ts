/**
 * Evaluator module: health evaluation, main pipeline, and startup sequence.
 */

export type { EvaluatorDeps } from "./evaluate";
export type { HealthAction, HealthResponse, HealthSnapshot } from "./health";
export type { StartupDeps } from "./startup";

export { evaluate } from "./evaluate";
export { evaluateHealthResponse } from "./health";
export { runStartupSequence } from "./startup";
