/**
 * Evaluator module: health evaluation, main pipeline, and startup sequence.
 */

export { evaluate, type EvaluatorDeps } from "./evaluate";

export {
  evaluateHealthResponse,
  type HealthAction,
  type HealthResponse,
  type HealthSnapshot,
} from "./health";

export { runStartupSequence, type StartupDeps } from "./startup";
