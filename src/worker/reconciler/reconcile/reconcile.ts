/**
 * Reconciler: fetch truth from GMX (position state + liquidity balance) and correct state drift.
 *
 * @see {@link ../../../../adrs/0001-bot-architecture.md ADR-0001: Bot Architecture}
 * @see {@link ../../../../adrs/0019-on-chain-perps-pivot.md ADR-0019: On-Chain Perps Pivot}
 */

import type { GmxAdapter } from "@/adapters/gmx";
import type { Balance, Position } from "@/adapters/types";
import { derivePosition, reconcilePosition } from "@/domains/position";
import type { PositionConfig } from "@/domains/position";
import type { Logger } from "@/lib/logger";
import type { StateStore } from "@/worker/state";

import type { BalanceInconsistency, ReconcilerConfig, ReconcilerResult } from "../types";

/** Map GMX position state + liquidity balance to Balance[] and Position[] for reconciliation. */
const toBalancesAndPositions = (
  positionState: Awaited<ReturnType<GmxAdapter["getPositionState"]>>,
  liquidityBalance: Awaited<ReturnType<GmxAdapter["getLiquidityBalance"]>>,
  perpSymbol: string,
  _baseAsset: string,
): { balances: Balance[]; positions: Position[] } => {
  const balances: Balance[] = [];
  const positions: Position[] = [];

  if (liquidityBalance.balance > 0n) {
    balances.push({
      asset: `GM-${liquidityBalance.pool}`,
      availableBase: liquidityBalance.balance,
      heldBase: 0n,
      totalBase: liquidityBalance.balance,
    });
  }

  if (positionState?.perpPosition) {
    const { perpPosition } = positionState;
    positions.push({
      symbol: perpSymbol,
      side: "SHORT",
      sizeBase: perpPosition.sizeUsd,
      entryPriceQuote: perpPosition.entryPrice,
      markPriceQuote: perpPosition.entryPrice,
      liquidationPriceQuote: perpPosition.liquidationPrice,
      unrealizedPnlQuote: perpPosition.pnlUsd,
      leverageBps: 10000n,
      marginQuote: perpPosition.sizeUsd,
    });
  }

  return { balances, positions };
};

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
 * @param adapter - GMX adapter for chain/API reads
 * @param stateStore - In-memory state store to update
 * @param config - Reconciler configuration (must include gmxMarket and gmxPool)
 * @param logger - Logger instance
 * @returns Reconciliation result with consistency info and corrected position
 */
export const runReconcile = async (
  adapter: GmxAdapter,
  stateStore: StateStore,
  config: ReconcilerConfig,
  logger: Logger,
): Promise<ReconcilerResult> => {
  const positionConfig = toPositionConfig(config);
  const market = config.gmxMarket ?? "";
  const pool = config.gmxPool ?? "default";

  // 1. Fetch truth from GMX (position state + liquidity balance)
  const [positionState, liquidityBalance] = await Promise.all([
    adapter.getPositionState(market),
    adapter.getLiquidityBalance(pool),
  ]);
  const { balances, positions } = toBalancesAndPositions(
    positionState,
    liquidityBalance,
    config.perpSymbol,
    config.baseAsset,
  );
  const openOrders: Parameters<StateStore["updateOrders"]>[0] = [];

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
  const exchangeSpotBalance =
    balances.find((b) => b.asset === config.baseAsset) ??
    balances.find((b) => b.asset.startsWith("GM-")) ??
    null;

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
    const criticalPositions = positionInconsistencies.filter(
      ({ severity }) => severity === "critical",
    );
    const warningPositions = positionInconsistencies.filter(
      ({ severity }) => severity === "warning",
    );
    const criticalBalances = balanceInconsistencies.filter(
      ({ severity }) => severity === "critical",
    );
    const warningBalances = balanceInconsistencies.filter(({ severity }) => severity === "warning");

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
