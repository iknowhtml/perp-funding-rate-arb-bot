---
name: Slippage Modeling
overview: Implement comprehensive slippage estimation, tracking, and position sizing based on liquidity.
todos:
  - id: slippage-estimation
    content: Implement pre-trade slippage estimation from order book
    status: pending
  - id: slippage-tracking
    content: Implement post-trade slippage tracking and analysis
    status: pending
  - id: liquidity-sizing
    content: Implement position sizing based on order book liquidity
    status: pending
  - id: slippage-config
    content: Create slippage configuration with limits
    status: pending
  - id: tests
    content: Add unit tests for slippage modeling
    status: pending
  - id: lifecycle-management
    content: Move plan to implemented/ directory after completion (update todos, check validation boxes, update roadmap link, move file, delete from active/)
    status: pending
isProject: false
---

> **Note**: This plan is part of Phase 4 (Simulation) in [MVP Roadmap](../README.md).

# Slippage Modeling

## Overview

Implement comprehensive slippage modeling that:
1. Estimates slippage before placing orders (pre-trade)
2. Tracks realized slippage after execution (post-trade)
3. Enforces slippage limits per order
4. Adjusts position sizing based on available liquidity

Slippage can **destroy profitability** in funding rate arbitrage if not properly managed.

Reference: [ADR-0015: Execution Safety & Slippage](../../../../../adrs/0015-execution-safety-slippage.md)

## Tasks

### 1. Slippage Estimation

Create `src/lib/slippage/estimation.ts`:

```typescript
export interface OrderBookSnapshot {
  bids: Array<{ price: bigint; quantity: bigint }>; // Sorted descending
  asks: Array<{ price: bigint; quantity: bigint }>; // Sorted ascending
  timestamp: Date;
}

export interface SlippageEstimate {
  expectedPrice: bigint;
  slippageBps: bigint;
  canExecute: boolean;
  requiredDepth: bigint;
  availableDepth: bigint;
}

export const estimateSlippage = (
  orderBook: OrderBookSnapshot,
  side: "BUY" | "SELL",
  quantity: bigint,
  maxSlippageBps: bigint,
): SlippageEstimate => {
  const levels = side === "BUY" ? orderBook.asks : orderBook.bids;
  const midPrice = calculateMidPrice(orderBook);

  let cumulativeQuantity = 0n;
  let cumulativeValue = 0n;

  for (const level of levels) {
    const levelQuantity = level.quantity < quantity - cumulativeQuantity
      ? level.quantity
      : quantity - cumulativeQuantity;

    cumulativeQuantity += levelQuantity;
    cumulativeValue += levelQuantity * level.price;

    if (cumulativeQuantity >= quantity) {
      break;
    }
  }

  if (cumulativeQuantity < quantity) {
    // Insufficient liquidity
    return {
      expectedPrice: 0n,
      slippageBps: 10000n, // 100% slippage (cannot execute)
      canExecute: false,
      requiredDepth: quantity,
      availableDepth: cumulativeQuantity,
    };
  }

  const weightedAvgPrice = cumulativeValue / cumulativeQuantity;
  const slippageBps = side === "BUY"
    ? ((weightedAvgPrice - midPrice) * 10000n) / midPrice
    : ((midPrice - weightedAvgPrice) * 10000n) / midPrice;

  return {
    expectedPrice: weightedAvgPrice,
    slippageBps,
    canExecute: slippageBps <= maxSlippageBps,
    requiredDepth: quantity,
    availableDepth: cumulativeQuantity,
  };
};

export const calculateMidPrice = (orderBook: OrderBookSnapshot): bigint => {
  if (orderBook.bids.length === 0 || orderBook.asks.length === 0) {
    throw new Error("Order book has no bids or asks");
  }

  const bestBid = orderBook.bids[0].price;
  const bestAsk = orderBook.asks[0].price;
  return (bestBid + bestAsk) / 2n;
};
```

### 2. Slippage Tracking

Create `src/lib/slippage/tracking.ts`:

```typescript
export interface ExecutionAnalysis {
  orderId: string;
  expectedPrice: bigint;
  actualPrice: bigint;
  expectedSlippageBps: bigint;
  realizedSlippageBps: bigint;
  slippageDifferenceBps: bigint;
  orderBookSnapshot: OrderBookSnapshot;
  executionTime: Date;
}

export const analyzeExecution = (
  order: Order,
  fills: Fill[],
  orderBookSnapshot: OrderBookSnapshot,
  expectedPrice: bigint,
): ExecutionAnalysis => {
  const totalQuantity = fills.reduce((sum, f) => sum + f.quantity, 0n);
  const totalValue = fills.reduce((sum, f) => sum + f.quantity * f.price, 0n);
  const actualPrice = totalQuantity > 0n ? totalValue / totalQuantity : 0n;

  const midPrice = calculateMidPrice(orderBookSnapshot);
  const realizedSlippageBps = order.side === "BUY"
    ? ((actualPrice - midPrice) * 10000n) / midPrice
    : ((midPrice - actualPrice) * 10000n) / midPrice;

  const expectedSlippageBps = order.side === "BUY"
    ? ((expectedPrice - midPrice) * 10000n) / midPrice
    : ((midPrice - expectedPrice) * 10000n) / midPrice;

  return {
    orderId: order.id,
    expectedPrice,
    actualPrice,
    expectedSlippageBps,
    realizedSlippageBps,
    slippageDifferenceBps: realizedSlippageBps - expectedSlippageBps,
    orderBookSnapshot,
    executionTime: new Date(),
  };
};

export interface SlippageMetrics {
  totalOrders: number;
  averageExpectedSlippageBps: bigint;
  averageRealizedSlippageBps: bigint;
  averageDifferenceBps: bigint;
  maxSlippageBps: bigint;
  slippageWithinEstimate: number; // percentage
}

export const aggregateSlippageMetrics = (
  analyses: ExecutionAnalysis[],
): SlippageMetrics => {
  if (analyses.length === 0) {
    return {
      totalOrders: 0,
      averageExpectedSlippageBps: 0n,
      averageRealizedSlippageBps: 0n,
      averageDifferenceBps: 0n,
      maxSlippageBps: 0n,
      slippageWithinEstimate: 100,
    };
  }

  const avgExpected = analyses.reduce((sum, a) => sum + a.expectedSlippageBps, 0n) 
    / BigInt(analyses.length);
  const avgRealized = analyses.reduce((sum, a) => sum + a.realizedSlippageBps, 0n) 
    / BigInt(analyses.length);
  const avgDiff = analyses.reduce((sum, a) => sum + a.slippageDifferenceBps, 0n) 
    / BigInt(analyses.length);
  const maxSlippage = analyses.reduce(
    (max, a) => a.realizedSlippageBps > max ? a.realizedSlippageBps : max, 
    0n
  );

  const withinEstimate = analyses.filter(
    (a) => a.realizedSlippageBps <= a.expectedSlippageBps + 10n // 0.1% tolerance
  ).length;

  return {
    totalOrders: analyses.length,
    averageExpectedSlippageBps: avgExpected,
    averageRealizedSlippageBps: avgRealized,
    averageDifferenceBps: avgDiff,
    maxSlippageBps: maxSlippage,
    slippageWithinEstimate: (withinEstimate / analyses.length) * 100,
  };
};
```

### 3. Liquidity-Based Position Sizing

Create `src/lib/slippage/sizing.ts`:

```typescript
export const calculateOptimalPositionSize = (
  desiredSize: bigint,
  orderBook: OrderBookSnapshot,
  config: SlippageConfig,
): bigint => {
  // Get available depth for both sides (entry + exit)
  const entryDepth = estimateSlippage(
    orderBook, 
    "BUY", 
    desiredSize, 
    config.maxSlippageBps
  ).availableDepth;
  
  const exitDepth = estimateSlippage(
    orderBook, 
    "SELL", 
    desiredSize, 
    config.maxSlippageBps
  ).availableDepth;

  // Use minimum of entry/exit depth
  const minDepth = entryDepth < exitDepth ? entryDepth : exitDepth;

  // Ensure we have at least minLiquidityMultiplier x depth
  const maxSizeByLiquidity = minDepth / config.minLiquidityMultiplier;

  // Use minimum of desired size and liquidity-constrained size
  return desiredSize < maxSizeByLiquidity ? desiredSize : maxSizeByLiquidity;
};

export const validateOrderSize = (
  orderBook: OrderBookSnapshot,
  side: "BUY" | "SELL",
  quantity: bigint,
  volume24h: bigint,
  config: SlippageConfig,
): { valid: boolean; reason?: string } => {
  // Check slippage
  const slippageEstimate = estimateSlippage(
    orderBook, 
    side, 
    quantity, 
    config.maxSlippageBps
  );

  if (!slippageEstimate.canExecute) {
    return {
      valid: false,
      reason: `Slippage ${slippageEstimate.slippageBps}bps exceeds limit ${config.maxSlippageBps}bps`,
    };
  }

  // Check liquidity
  if (slippageEstimate.availableDepth < slippageEstimate.requiredDepth * config.minLiquidityMultiplier) {
    return {
      valid: false,
      reason: `Insufficient liquidity: need ${slippageEstimate.requiredDepth}, have ${slippageEstimate.availableDepth}`,
    };
  }

  // Check order size vs 24h volume
  if (volume24h > 0n) {
    const orderSizeBps = (quantity * 10000n) / volume24h;
    if (orderSizeBps > config.maxOrderSizeBps) {
      return {
        valid: false,
        reason: `Order size ${orderSizeBps}bps exceeds max ${config.maxOrderSizeBps}bps of 24h volume`,
      };
    }
  }

  return { valid: true };
};
```

### 4. Slippage Configuration

Create `src/lib/slippage/config.ts`:

```typescript
import * as v from "valibot";

export const SlippageConfigSchema = v.object({
  maxSlippageBps: v.pipe(v.bigint(), v.minValue(1n), v.maxValue(500n)), // Max 5%
  warningSlippageBps: v.pipe(v.bigint(), v.minValue(1n), v.maxValue(300n)), // Warning at 3%
  maxOrderSizeBps: v.pipe(v.bigint(), v.minValue(10n), v.maxValue(500n)), // Max 5% of 24h volume
  minLiquidityMultiplier: v.pipe(v.bigint(), v.minValue(1n), v.maxValue(10n)), // Min 1x to 10x depth
});

export type SlippageConfig = v.InferOutput<typeof SlippageConfigSchema>;

export const DEFAULT_SLIPPAGE_CONFIG: SlippageConfig = {
  maxSlippageBps: 50n, // 0.5%
  warningSlippageBps: 30n, // 0.3%
  maxOrderSizeBps: 100n, // 1% of 24h volume
  minLiquidityMultiplier: 2n, // 2x order book depth
};
```

## File Structure

```
src/lib/slippage/
├── types.ts              # Slippage types
├── config.ts             # Configuration schema
├── estimation.ts         # Pre-trade slippage estimation
├── estimation.test.ts
├── tracking.ts           # Post-trade slippage tracking
├── tracking.test.ts
├── sizing.ts             # Liquidity-based sizing
├── sizing.test.ts
└── index.ts              # Re-exports
```

## Dependencies

No new dependencies required.

## Validation

- [ ] Slippage estimated correctly from order book
- [ ] Insufficient liquidity detected
- [ ] Post-trade slippage tracked accurately
- [ ] Position sizing respects liquidity constraints
- [ ] Order size validation works correctly
- [ ] Unit tests pass

## References

- [MVP Roadmap](../README.md)
- [ADR-0015: Execution Safety & Slippage](../../../../../adrs/0015-execution-safety-slippage.md)
