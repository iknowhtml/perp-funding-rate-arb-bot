/**
 * Position reconciliation logic.
 *
 * Compares derived position against authoritative exchange position to detect inconsistencies.
 *
 * @see {@link ../../../adrs/0001-bot-architecture.md ADR-0001: Bot Architecture}
 */

import type { Balance, Position } from "@/adapters/types";

import { derivePosition } from "./derive";
import type { DerivedPosition, Inconsistency, PositionConfig, ReconciliationResult } from "./types";

/**
 * Basis points per unit (1 = 10000 bps).
 */
const BPS_PER_UNIT = 10000n;

/**
 * Derive position from exchange data only (for reconciliation correction).
 *
 * Creates a derived position using exchange position as the source of truth.
 *
 * @param exchange - Exchange position, or null if flat
 * @param spotBalance - Spot balance, or null
 * @param markPriceQuote - Current mark price
 * @param config - Position configuration
 * @returns Derived position with source "reconciled"
 */
const deriveFromExchange = (
  exchange: Position | null,
  spotBalance: Balance | null,
  markPriceQuote: bigint,
  config: PositionConfig,
): DerivedPosition => {
  const derived = derivePosition(exchange, spotBalance, markPriceQuote, [], config);
  return {
    ...derived,
    source: "reconciled",
  };
};

/**
 * Reconcile derived position against exchange position.
 *
 * Compares the derived position (which may include pending fills) against
 * the authoritative exchange position to detect inconsistencies.
 *
 * Exchange position wins on conflicts (per ADR-0001: REST > WS > derived).
 *
 * @param derivedPosition - Derived position to reconcile
 * @param exchangePosition - Authoritative exchange position, or null if flat
 * @param spotBalance - Spot balance for base asset, or null
 * @param markPriceQuote - Current mark price
 * @param tolerance - Tolerance thresholds for inconsistencies (in basis points)
 * @param config - Position configuration
 * @returns Reconciliation result with consistency flag, inconsistencies, and corrected position
 */
export const reconcilePosition = (
  derivedPosition: DerivedPosition,
  exchangePosition: Position | null,
  spotBalance: Balance | null,
  markPriceQuote: bigint,
  tolerance: { sizeBps: bigint; priceBps: bigint },
  config: PositionConfig,
): ReconciliationResult => {
  const inconsistencies: Inconsistency[] = [];

  // Check if derived thinks position is open but exchange says flat
  if (derivedPosition.open && !exchangePosition) {
    inconsistencies.push({
      field: "open",
      expected: 0n,
      actual: derivedPosition.perpQuantityBase,
      severity: "critical",
    });
  }

  // Check if exchange says position is open but derived thinks flat
  if (!derivedPosition.open && exchangePosition) {
    inconsistencies.push({
      field: "open",
      expected: exchangePosition.sizeBase,
      actual: 0n,
      severity: "critical",
    });
  }

  // Check size mismatch
  if (exchangePosition && derivedPosition.open) {
    const derivedSize = derivedPosition.perpQuantityBase;
    const exchangeSize = exchangePosition.sizeBase;
    const sizeDiff =
      derivedSize > exchangeSize ? derivedSize - exchangeSize : exchangeSize - derivedSize;

    if (sizeDiff > 0n) {
      const sizeDiffBps = derivedSize > 0n ? (sizeDiff * BPS_PER_UNIT) / derivedSize : BPS_PER_UNIT;

      if (sizeDiffBps > tolerance.sizeBps) {
        inconsistencies.push({
          field: "perpQuantityBase",
          expected: exchangeSize,
          actual: derivedSize,
          severity: "critical",
        });
      } else {
        // Within tolerance but still a mismatch - report as warning
        inconsistencies.push({
          field: "perpQuantityBase",
          expected: exchangeSize,
          actual: derivedSize,
          severity: "warning",
        });
      }
    }

    // Check side mismatch
    if (derivedPosition.side !== exchangePosition.side) {
      inconsistencies.push({
        field: "side",
        expected: exchangePosition.side === "LONG" ? 1n : -1n,
        actual: derivedPosition.side === "LONG" ? 1n : derivedPosition.side === "SHORT" ? -1n : 0n,
        severity: "critical",
      });
    }
  }

  // Exchange position wins on conflicts (REST is authoritative)
  const correctedPosition = deriveFromExchange(
    exchangePosition,
    spotBalance,
    markPriceQuote,
    config,
  );

  return {
    consistent: inconsistencies.length === 0,
    inconsistencies,
    correctedPosition,
  };
};
