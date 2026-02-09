/**
 * Reconciler: fetch truth from exchange REST API and correct state drift.
 *
 * The reconciler is a stateless function called on a timer (default 60s).
 * Scheduling is handled by the caller (evaluation loop / scheduler).
 *
 * @see {@link ../../../adrs/0001-bot-architecture.md ADR-0001: Bot Architecture}
 */

import type { Balance, ExchangeAdapter } from "@/adapters/types";
import { derivePosition, reconcilePosition } from "@/domains/position";
import type { PositionConfig } from "@/domains/position";
import type { Logger } from "@/lib/logger/logger";
import type { StateStore } from "@/worker/state";

import type { BalanceInconsistency, ReconcilerConfig, ReconcilerResult } from "./types";

/**
 * Basis points per unit (1 = 10000 bps).
 */
const BPS_PER_UNIT = 10000n;

/**
 * Critical balance drift threshold in bps (5%).
 */
const CRITICAL_BALANCE_BPS = 500n;

/**
 * Extract PositionConfig from ReconcilerConfig.
 */
const toPositionConfig = (config: ReconcilerConfig): PositionConfig => ({
  perpSymbol: config.perpSymbol,
  baseAsset: config.baseAsset,
  quoteAsset: config.quoteAsset,
  baseDecimals: config.baseDecimals,
});

/**
 * Absolute value for bigint.
 */
const absBigint = (n: bigint): bigint => (n < 0n ? -n : n);

/**
 * Detect balance drift between in-memory state and exchange truth.
 *
 * Compares totalBase for each balance in the exchange truth against
 * the pre-update in-memory state. Reports inconsistencies exceeding
 * the tolerance threshold.
 */
const detectBalanceInconsistencies = (
  stateBalances: Map<string, Balance>,
  exchangeBalances: Balance[],
  toleranceBps: bigint,
): BalanceInconsistency[] => {
  const inconsistencies: BalanceInconsistency[] = [];

  for (const truthBalance of exchangeBalances) {
    const stateBalance = stateBalances.get(truthBalance.asset);
    if (!stateBalance) continue;

    // Compare totalBase
    const diff = absBigint(stateBalance.totalBase - truthBalance.totalBase);
    if (diff === 0n) continue;

    const denominator = truthBalance.totalBase > 0n ? truthBalance.totalBase : 1n;
    const diffBps = (diff * BPS_PER_UNIT) / denominator;

    if (diffBps > toleranceBps) {
      inconsistencies.push({
        asset: truthBalance.asset,
        field: "totalBase",
        expected: truthBalance.totalBase,
        actual: stateBalance.totalBase,
        diffBps,
        severity: diffBps > CRITICAL_BALANCE_BPS ? "critical" : "warning",
      });
    }
  }

  return inconsistencies;
};

/**
 * Run a single reconciliation cycle.
 *
 * 1. Fetches balances, positions, and open orders from exchange REST API
 * 2. Snapshots current state and derives a position for comparison
 * 3. Updates state store with authoritative REST data
 * 4. Runs domain-level reconciliation to detect inconsistencies
 * 5. Logs results (warn for critical, info for warnings, debug for consistent)
 *
 * @param adapter - Exchange adapter for REST API calls
 * @param stateStore - In-memory state store to update
 * @param config - Reconciler configuration
 * @param logger - Logger instance
 * @returns Reconciliation result with consistency info and corrected position
 */
export const runReconcile = async (
  adapter: ExchangeAdapter,
  stateStore: StateStore,
  config: ReconcilerConfig,
  logger: Logger,
): Promise<ReconcilerResult> => {
  const positionConfig = toPositionConfig(config);

  // 1. Fetch truth from exchange REST API (parallel)
  const [balances, positions, openOrders] = await Promise.all([
    adapter.getBalances(),
    adapter.getPositions(),
    adapter.getOpenOrders(),
  ]);

  // 2. Snapshot pre-update state and derive position for comparison
  const preState = stateStore.getState();
  const perpPosition = preState.positions.get(config.perpSymbol) ?? null;
  const spotBalance = preState.balances.get(config.baseAsset) ?? null;
  const markPriceQuote = preState.ticker?.lastPriceQuote ?? 0n;

  const derivedPosition = derivePosition(
    perpPosition,
    spotBalance,
    markPriceQuote,
    [],
    positionConfig,
  );

  // 3. Update state store (REST is authoritative)
  stateStore.updateBalances(balances);
  stateStore.updatePositions(positions);
  stateStore.updateOrders(openOrders);

  // 4. Run domain-level position reconciliation
  const exchangePosition = positions.find((p) => p.symbol === config.perpSymbol) ?? null;
  const exchangeSpotBalance = balances.find((b) => b.asset === config.baseAsset) ?? null;

  const result = reconcilePosition(
    derivedPosition,
    exchangePosition,
    exchangeSpotBalance,
    markPriceQuote,
    {
      sizeBps: config.toleranceSizeBps,
      priceBps: config.tolerancePriceBps,
    },
    positionConfig,
  );

  // 5. Detect balance drift
  const balanceInconsistencies = detectBalanceInconsistencies(
    preState.balances,
    balances,
    config.toleranceBalanceBps,
  );

  const positionInconsistencies = result.inconsistencies;
  const consistent = positionInconsistencies.length === 0 && balanceInconsistencies.length === 0;

  // 6. Log results
  if (consistent) {
    logger.debug("Reconciliation complete: consistent");
  } else {
    const criticalPositions = positionInconsistencies.filter((i) => i.severity === "critical");
    const warningPositions = positionInconsistencies.filter((i) => i.severity === "warning");
    const criticalBalances = balanceInconsistencies.filter((i) => i.severity === "critical");
    const warningBalances = balanceInconsistencies.filter((i) => i.severity === "warning");

    if (criticalPositions.length > 0 || criticalBalances.length > 0) {
      logger.warn("Reconciliation found critical inconsistencies", {
        criticalPositions,
        warningPositions,
        criticalBalances,
        warningBalances,
      });
    } else {
      logger.info("Reconciliation found minor inconsistencies", {
        warningPositions,
        warningBalances,
      });
    }
  }

  return {
    consistent,
    positionInconsistencies,
    balanceInconsistencies,
    correctedPosition: result.correctedPosition,
    timestamp: new Date(),
  };
};
