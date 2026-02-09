/**
 * Strategy evaluation orchestrator.
 *
 * Combines risk assessment, funding rate trend analysis, and entry/exit signals
 * to generate trading intents.
 *
 * @see {@link ../../../adrs/0014-funding-rate-strategy.md ADR-0014: Funding Rate Prediction & Strategy}
 * @see {@link ../../../adrs/0013-risk-management.md ADR-0013: Risk Management Engine}
 */

import { calculateMaxPositionSizeQuote } from "@/domains/risk";
import type { RiskAssessment, RiskConfig } from "@/domains/risk";

import type { StrategyConfig } from "./config";
import { generateEntrySignal } from "./entry-signal";
import { generateExitSignal } from "./exit-signal";
import { analyzeFundingRateTrend } from "./trend-analysis";
import type { StrategyInput, TradingIntent } from "./types";

/**
 * Evaluate strategy and generate trading intent.
 *
 * Orchestrates:
 * 1. Risk check (must allow trading)
 * 2. Funding rate trend analysis
 * 3. Entry signal generation (if no position)
 * 4. Exit signal generation (if position open)
 *
 * Returns TradingIntent indicating action to take.
 */
export const evaluateStrategy = (
  input: StrategyInput,
  risk: RiskAssessment,
  riskConfig: RiskConfig,
  strategyConfig: StrategyConfig,
): TradingIntent => {
  // 1. Check risk first (ADR-0013)
  if (risk.action === "BLOCK") {
    return { type: "NOOP" };
  }

  // Risk EXIT: if no position, return NOOP; if position open, will exit below
  if (risk.action === "EXIT" && (!input.position || !input.position.open)) {
    return { type: "NOOP" };
  }

  // 2. Analyze funding rate trend
  const history = analyzeFundingRateTrend(input.fundingHistory, strategyConfig);

  // 3. Generate signals
  if (!input.position || !input.position.open) {
    // No position: check for entry
    const entrySignal = generateEntrySignal(input.fundingRate, history, strategyConfig);
    if (entrySignal && risk.action === "ALLOW") {
      // Calculate position size using risk-based sizing
      const maxPositionSizeQuote = calculateMaxPositionSizeQuote(
        input.equityQuote,
        input.marginUsedQuote,
        riskConfig,
      );

      return {
        type: "ENTER_HEDGE",
        params: {
          sizeQuote: maxPositionSizeQuote,
          expectedYieldBps: entrySignal.expectedYieldBps,
          confidence: entrySignal.confidence,
        },
      };
    }
    return { type: "NOOP" };
  }

  // 4. Position open: check for exit
  const exitSignal = generateExitSignal(input.position, input.fundingRate, history, strategyConfig);
  if (exitSignal || risk.action === "EXIT") {
    return {
      type: "EXIT_HEDGE",
      reason: exitSignal?.reason ?? "risk",
    };
  }

  return { type: "NOOP" };
};
