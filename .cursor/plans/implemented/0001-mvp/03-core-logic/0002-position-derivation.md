---
name: Position Derivation
overview: Implement position state derivation from account data with metrics calculation.
todos:
  - id: position-types
    content: Define position types and interfaces
    status: completed
  - id: derive-position
    content: Implement position derivation from account state
    status: completed
  - id: position-metrics
    content: Implement position metrics calculation (notional, P&L, margin)
    status: completed
  - id: reconciliation
    content: Implement position reconciliation logic
    status: completed
  - id: tests
    content: Add unit tests for position derivation
    status: completed
  - id: lifecycle-management
    content: Move plan to implemented/ directory after completion (update todos, check validation boxes, update roadmap link, move file, delete from active/)
    status: completed
isProject: false
---

> **Note**: This plan is part of Phase 3 (Core Logic) in [MVP Roadmap](../../active/0001-mvp/README.md).

# Position Derivation

## Overview

Implement position state derivation from account data. The position is not stored directly but derived from:
- Account positions from last REST fetch
- Recent fills since last fetch
- Reconciler corrections

Reference: [ADR-0001: Bot Architecture](../../../../../adrs/0001-bot-architecture.md)

## Tasks

### 1. Position Types

Create `src/domains/position/types.ts`:

```typescript
export interface DerivedPosition {
  open: boolean;
  side: "LONG" | "SHORT" | null;
  
  // Size and value
  spotQuantityBase: bigint;
  perpQuantityBase: bigint;
  notionalCents: bigint;
  
  // Entry tracking
  entryTime: Date | null;
  entryPriceCents: bigint | null;
  entryFundingRateBps: bigint | null;
  
  // Current metrics
  markPriceCents: bigint;
  unrealizedPnLCents: bigint;
  fundingAccruedCents: bigint;
  
  // Margin and risk
  marginUsedCents: bigint;
  marginBufferBps: bigint;
  liquidationPriceCents: bigint | null;
  liquidationDistanceBps: bigint;
  
  // Metadata
  lastUpdated: Date;
  source: "rest" | "derived" | "reconciled";
}

export interface AccountState {
  equityCents: bigint;
  marginUsedCents: bigint;
  availableMarginCents: bigint;
  positions: ExchangePosition[];
  balances: Balance[];
}
```

### 2. Position Derivation

Create `src/domains/position/derive.ts`:

```typescript
export const derivePosition = (
  accountState: AccountState,
  marketState: MarketState,
  pendingFills: Fill[],
): DerivedPosition => {
  // 1. Get exchange position
  const perpPosition = accountState.positions.find(
    (p) => p.symbol === marketState.perpSymbol
  );
  
  // 2. Get spot balance
  const spotBalance = accountState.balances.find(
    (b) => b.asset === marketState.baseAsset
  );
  
  // 3. Apply pending fills
  const adjustedPosition = applyPendingFills(perpPosition, pendingFills);
  
  // 4. Derive metrics (decimals comes from asset config, e.g. BTC=8, ETH=18, USDC=6)
  const { decimals } = marketState;
  const notionalCents = calculateNotional(adjustedPosition, marketState.markPriceCents, decimals);
  const unrealizedPnL = calculateUnrealizedPnL(adjustedPosition, marketState.markPriceCents, decimals);
  
  return {
    open: adjustedPosition !== null && adjustedPosition.sizeCents > 0n,
    // ... rest of derivation
  };
};
```

### 3. Position Metrics Calculation

```typescript
/** Compute 10^n as bigint for a given decimal count */
export const baseUnitScale = (decimals: number): bigint => 10n ** BigInt(decimals);

/** Basis points per unit (1 = 10000 bps) */
const BPS_PER_UNIT = 10000n;

export const calculateNotional = (
  position: ExchangePosition | null,
  markPriceCents: bigint,
  decimals: number,
): bigint => {
  if (!position) return 0n;
  return (position.sizeBase * markPriceCents) / baseUnitScale(decimals);
};

export const calculateUnrealizedPnL = (
  position: ExchangePosition | null,
  markPriceCents: bigint,
  decimals: number,
): bigint => {
  if (!position) return 0n;
  const scale = baseUnitScale(decimals);
  const entryValue = (position.sizeBase * position.entryPriceCents) / scale;
  const currentValue = (position.sizeBase * markPriceCents) / scale;
  return position.side === "LONG" 
    ? currentValue - entryValue 
    : entryValue - currentValue;
};

export const calculateMarginUtilization = (
  marginUsedCents: bigint,
  equityCents: bigint,
): bigint => {
  if (equityCents === 0n) return BPS_PER_UNIT; // 100%
  return (marginUsedCents * BPS_PER_UNIT) / equityCents;
};

export const calculateLiquidationDistance = (
  markPriceCents: bigint,
  liquidationPriceCents: bigint | null,
  side: "LONG" | "SHORT" | null,
): bigint => {
  if (!liquidationPriceCents || !side) return BPS_PER_UNIT; // 100% buffer
  
  return side === "SHORT"
    ? ((markPriceCents - liquidationPriceCents) * BPS_PER_UNIT) / markPriceCents
    : ((liquidationPriceCents - markPriceCents) * BPS_PER_UNIT) / markPriceCents;
};
```

### 4. Position Reconciliation

```typescript
export interface ReconciliationResult {
  consistent: boolean;
  inconsistencies: Inconsistency[];
  correctedPosition: DerivedPosition;
}

export interface Inconsistency {
  field: string;
  expected: bigint;
  actual: bigint;
  severity: "warning" | "critical";
}

export const reconcilePosition = (
  derivedPosition: DerivedPosition,
  exchangePosition: ExchangePosition | null,
  tolerance: { sizeBps: bigint; priceBps: bigint },
): ReconciliationResult => {
  const inconsistencies: Inconsistency[] = [];
  
  // Check size mismatch
  if (derivedPosition.perpQuantityBase !== (exchangePosition?.sizeBase ?? 0n)) {
    const diff = derivedPosition.perpQuantityBase - (exchangePosition?.sizeBase ?? 0n);
    const diffBps = (diff * BPS_PER_UNIT) / (derivedPosition.perpQuantityBase || 1n);
    
    if (diffBps > tolerance.sizeBps || diffBps < -tolerance.sizeBps) {
      inconsistencies.push({
        field: "perpQuantityBase",
        expected: exchangePosition?.sizeBase ?? 0n,
        actual: derivedPosition.perpQuantityBase,
        severity: diffBps > 100n ? "critical" : "warning",
      });
    }
  }
  
  return {
    consistent: inconsistencies.length === 0,
    inconsistencies,
    correctedPosition: exchangePosition 
      ? deriveFromExchange(exchangePosition) 
      : derivedPosition,
  };
};
```

## File Structure

```
src/domains/position/
├── types.ts              # Position type definitions
├── derive.ts             # Position derivation logic
├── derive.test.ts        # Derivation tests
├── metrics.ts            # Metric calculations
├── metrics.test.ts       # Metrics tests
├── reconcile.ts          # Reconciliation logic
├── reconcile.test.ts     # Reconciliation tests
└── index.ts              # Re-exports
```

## Dependencies

No new dependencies required.

## Validation

- [x] Position derived correctly from account state
- [x] Pending fills applied to position
- [x] Metrics calculated correctly (notional, P&L, margin)
- [x] Reconciliation detects inconsistencies
- [x] Liquidation distance calculated correctly
- [x] Unit tests pass

## References

- [MVP Roadmap](../README.md)
- [ADR-0001: Bot Architecture](../../../../../adrs/0001-bot-architecture.md) — State derivation
- [ADR-0012: State Machines](../../../../../adrs/0012-state-machines.md) — Position state
