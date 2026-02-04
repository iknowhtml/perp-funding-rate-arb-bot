# ADR 0015: Execution Safety & Slippage Modeling

- **Status:** Accepted
- **Date:** 2026-02-04
- **Owners:** -
- **Related:**
  - [ADR-0001: Bot Architecture](0001-bot-architecture.md)
  - [ADR-0012: State Machines](0012-state-machines.md)
  - [ADR-0010: Exchange Adapters](0010-exchange-adapters.md)
  - [ADR-0013: Risk Management Engine](0013-risk-management.md)

## Context

Slippage—the difference between expected and actual execution price—can **destroy profitability** in funding rate arbitrage:

- **Entry slippage** reduces initial spread
- **Exit slippage** reduces realized P&L
- **Large orders** (>$10K notional) can move the market
- **Low liquidity** periods (off-hours, low-volume pairs) increase slippage

Without proper slippage management:
- Profitable opportunities become unprofitable after execution
- Position sizing doesn't account for execution costs
- No visibility into execution quality for optimization

## Decision

**Implement comprehensive slippage modeling and execution safety** that:
1. Estimates slippage before placing orders (pre-trade)
2. Tracks realized slippage after execution (post-trade)
3. Enforces slippage limits per order
4. Adjusts position sizing based on available liquidity
5. Implements execution strategies (market vs limit orders)

### Slippage Estimation (Pre-Trade)

Estimate expected slippage by analyzing order book depth:

```typescript
export interface OrderBookSnapshot {
  bids: Array<{ price: bigint; quantity: bigint }>; // Sorted descending
  asks: Array<{ price: bigint; quantity: bigint }>; // Sorted ascending
  timestamp: Date;
}

export interface SlippageEstimate {
  expectedPrice: bigint;        // Weighted average execution price
  slippageBps: bigint;          // Slippage in basis points
  canExecute: boolean;           // Can execute within slippage limit
  requiredDepth: bigint;         // Order book depth needed
  availableDepth: bigint;        // Available order book depth
}
```

### Type Definitions

```typescript
// Order types (defined in ADR-0010: Exchange Adapters)
export interface OrderParams {
  symbol: string;
  side: "BUY" | "SELL";
  quantity: bigint;
  type?: "MARKET" | "LIMIT";
  price?: bigint;
  timeInForce?: "IOC" | "FOK" | "GTC";
}

export interface OrderResult {
  orderId: string;
  status: "PENDING" | "FILLED" | "PARTIALLY_FILLED" | "CANCELLED" | "REJECTED";
  filledQuantity: bigint;
  averagePrice: bigint;
}

export interface Order {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: bigint;
  status: string;
}

export interface Fill {
  id: string;
  orderId: string;
  quantity: bigint;
  price: bigint;
  timestamp: Date;
}
```

### Helper Functions

```typescript
// Calculate mid price from order book
export const calculateMidPrice = (orderBook: OrderBookSnapshot): bigint => {
  if (orderBook.bids.length === 0 || orderBook.asks.length === 0) {
    throw new Error("Order book has no bids or asks");
  }

  const bestBid = orderBook.bids[0].price;
  const bestAsk = orderBook.asks[0].price;
  return (bestBid + bestAsk) / 2n;
};

// Utility function for delays
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
```

### Error Types

```typescript
// Error for slippage limit violations
export class SlippageLimitExceededError extends Error {
  constructor(
    message: string,
    public readonly slippageBps: bigint,
    public readonly maxSlippageBps: bigint,
  ) {
    super(message);
    this.name = "SlippageLimitExceededError";
  }
}
```

### Order Book Depth Analysis

```typescript
export const estimateSlippage = (
  orderBook: OrderBookSnapshot,
  side: "BUY" | "SELL",
  quantity: bigint,
  maxSlippageBps: bigint, // Pass from config
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
```

### Slippage Limits Configuration

```typescript
export interface SlippageConfig {
  maxSlippageBps: bigint;           // Hard limit (default: 50 bps = 0.5%)
  warningSlippageBps: bigint;        // Warning threshold (default: 30 bps)
  maxOrderSizeBps: bigint;           // Max order size as % of 24h volume (default: 1%)
  minLiquidityMultiplier: bigint;   // Min order book depth multiplier (default: 2x)
}
```

### Execution Strategies

#### Strategy 1: Market Order (Fast, Higher Slippage)

Use market orders when:
- **Slippage estimate** < warning threshold
- **Time-sensitive** (funding rate changing soon)
- **Small size** (< 1% of 24h volume)

```typescript
const executeMarketOrder = async (
  adapter: ExchangeAdapter,
  params: OrderParams,
  slippageEstimate: SlippageEstimate,
  maxSlippageBps: bigint,
): Promise<OrderResult> => {
  if (!slippageEstimate.canExecute) {
    throw new SlippageLimitExceededError(
      `Slippage ${slippageEstimate.slippageBps}bps exceeds limit ${maxSlippageBps}bps`,
      slippageEstimate.slippageBps,
      maxSlippageBps,
    );
  }

  return adapter.placeOrder({
    ...params,
    type: "MARKET",
  });
};
```

#### Strategy 2: Limit Order (Slower, Lower Slippage)

Use limit orders when:
- **Slippage estimate** > warning threshold
- **Not time-sensitive** (can wait for better price)
- **Large size** (> 1% of 24h volume)

```typescript
const executeLimitOrder = async (
  adapter: ExchangeAdapter,
  params: OrderParams,
  slippageEstimate: SlippageEstimate,
  orderBook: OrderBookSnapshot,
): Promise<OrderResult> => {
  // Place limit order at estimated execution price
  const limitPrice = slippageEstimate.expectedPrice;
  
  return adapter.placeOrder({
    ...params,
    type: "LIMIT",
    price: limitPrice,
    timeInForce: "IOC", // Immediate or Cancel
  });
};
```

#### Strategy 3: TWAP (Time-Weighted Average Price)

For very large orders, split into smaller chunks:

```typescript
const executeTWAP = async (
  adapter: ExchangeAdapter,
  params: OrderParams,
  chunks: number = 5,
  intervalMs: number = 1000,
): Promise<OrderResult[]> => {
  const chunkSize = params.quantity / BigInt(chunks);
  const results: OrderResult[] = [];

  for (let i = 0; i < chunks; i++) {
    const orderBook = await adapter.getOrderBook(params.symbol);
    const slippageEstimate = estimateSlippage(orderBook, params.side, chunkSize, config.maxSlippageBps);

    if (!slippageEstimate.canExecute) {
      throw new SlippageLimitExceededError(
        `Chunk ${i + 1} exceeds slippage limit`,
        slippageEstimate.slippageBps,
        config.maxSlippageBps,
      );
    }

    const result = await executeMarketOrder(adapter, {
      ...params,
      quantity: chunkSize,
    }, slippageEstimate, config.maxSlippageBps);

    results.push(result);

    if (i < chunks - 1) {
      await sleep(intervalMs);
    }
  }

  return results;
};
```

### Realized Slippage Tracking (Post-Trade)

Track actual slippage vs estimated:

```typescript
export interface ExecutionAnalysis {
  orderId: string;
  expectedPrice: bigint;
  actualPrice: bigint;
  expectedSlippageBps: bigint;
  realizedSlippageBps: bigint;
  slippageDifferenceBps: bigint; // actual - expected
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
  const actualPrice = totalValue / totalQuantity;

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
```

### Position Sizing Based on Liquidity

Adjust position size based on available order book depth:

```typescript
export const calculateOptimalPositionSize = (
  desiredSize: bigint,
  orderBook: OrderBookSnapshot,
  config: SlippageConfig,
): bigint => {
  // Get available depth for both sides (entry + exit)
  const entryDepth = estimateSlippage(orderBook, "BUY", desiredSize, config.maxSlippageBps).availableDepth;
  const exitDepth = estimateSlippage(orderBook, "SELL", desiredSize, config.maxSlippageBps).availableDepth;

  // Use minimum of entry/exit depth
  const minDepth = entryDepth < exitDepth ? entryDepth : exitDepth;

  // Ensure we have at least minLiquidityMultiplier x depth
  const maxSizeByLiquidity = minDepth / config.minLiquidityMultiplier;

  // Use minimum of desired size and liquidity-constrained size
  return desiredSize < maxSizeByLiquidity ? desiredSize : maxSizeByLiquidity;
};
```

### Execution Safety Checks

Before executing any order:

1. **Check slippage estimate** (must be < max slippage)
2. **Check order book depth** (must have sufficient liquidity)
3. **Check order size** (must be < max order size % of volume)
4. **Re-check risk** (ADR-0013: two-phase risk check)

```typescript
export const validateExecution = async (
  adapter: ExchangeAdapter,
  params: OrderParams,
  config: SlippageConfig,
): Promise<{ valid: boolean; reason?: string; slippageEstimate?: SlippageEstimate }> => {
  // 1. Get order book
  const orderBook = await adapter.getOrderBook(params.symbol);

  // 2. Estimate slippage
  const slippageEstimate = estimateSlippage(orderBook, params.side, params.quantity, config.maxSlippageBps);

  // 3. Check slippage limit
  if (!slippageEstimate.canExecute) {
    return {
      valid: false,
      reason: `Slippage ${slippageEstimate.slippageBps}bps exceeds limit ${config.maxSlippageBps}bps`,
      slippageEstimate,
    };
  }
  
  // 4. Check liquidity
  if (slippageEstimate.availableDepth < slippageEstimate.requiredDepth * config.minLiquidityMultiplier) {
    return {
      valid: false,
      reason: `Insufficient liquidity: need ${slippageEstimate.requiredDepth}, have ${slippageEstimate.availableDepth}`,
      slippageEstimate,
    };
  }
  
  // 5. Check order size vs volume (if available)
  const volume24h = await adapter.get24hVolume(params.symbol);
  if (volume24h > 0n) {
    const orderSizeBps = (params.quantity * 10000n) / volume24h;
    if (orderSizeBps > config.maxOrderSizeBps) {
      return {
        valid: false,
        reason: `Order size ${orderSizeBps}bps exceeds max ${config.maxOrderSizeBps}bps of 24h volume`,
        slippageEstimate,
      };
    }
  }
  
  return { valid: true, slippageEstimate };
};
```

### Integration with Execution Queue

```typescript
// src/worker/execution.ts

const executeEnterHedge = async (sizeCents: bigint) => {
  // 1. Get order book
  const orderBook = await exchange.getOrderBook(symbol);
  
  // 2. Calculate optimal size based on liquidity
  const optimalSize = calculateOptimalPositionSize(sizeCents, orderBook, slippageConfig);
  
  // 3. Validate execution
  const validation = await validateExecution(
    exchange,
    { symbol, side: "BUY", quantity: optimalSize },
    slippageConfig,
  );
  
  if (!validation.valid) {
    await alertService.send({
      type: "EXECUTION_BLOCKED",
      reason: validation.reason,
    });
    return { aborted: true, reason: validation.reason };
  }
  
  // 4. Execute with slippage estimate
  const perpOrder = await executeMarketOrder(
    exchange,
    { symbol, side: "SELL", quantity: optimalSize },
    validation.slippageEstimate!,
    slippageConfig.maxSlippageBps,
  );

  const spotOrder = await executeMarketOrder(
    exchange,
    { symbol, side: "BUY", quantity: optimalSize },
    validation.slippageEstimate!,
    slippageConfig.maxSlippageBps,
  );
  
  // 5. Analyze execution
  const perpAnalysis = await analyzeExecution(perpOrder, perpFills, orderBook, validation.slippageEstimate!.expectedPrice);
  const spotAnalysis = await analyzeExecution(spotOrder, spotFills, orderBook, validation.slippageEstimate!.expectedPrice);
  
  // 6. Log slippage metrics
  metrics.executionSlippageBps.observe(Number(perpAnalysis.realizedSlippageBps));
  metrics.executionSlippageBps.observe(Number(spotAnalysis.realizedSlippageBps));
  
  // 7. Alert if slippage exceeded estimate significantly
  if (perpAnalysis.slippageDifferenceBps > 20n || spotAnalysis.slippageDifferenceBps > 20n) {
    await alertService.send({
      type: "SLIPPAGE_ANOMALY",
      data: { perpAnalysis, spotAnalysis },
    });
  }
};
```

## Consequences

### Positive

1. **Profitability Protection**: Prevents entering positions with excessive slippage
2. **Execution Quality**: Tracks realized vs expected slippage for optimization
3. **Liquidity Awareness**: Adjusts position sizing based on available depth
4. **Risk Reduction**: Validates execution safety before placing orders

### Negative

1. **Complexity**: Requires order book depth analysis and slippage estimation
2. **Latency**: Order book fetching adds latency to execution path
3. **False Positives**: May reject valid opportunities if order book snapshot is stale

### Risks

| Risk | Mitigation |
|------|------------|
| Stale order book data | Use WebSocket order book updates, validate timestamp |
| Order book manipulation | Use multiple exchanges for price discovery (future) |
| Slippage model incorrect | Backtest slippage estimates vs realized, tune model |
| Large order impact | Use TWAP for large orders, split into chunks |

## Future Considerations

1. **Machine Learning**: Train ML model to predict slippage based on historical data
2. **Cross-Exchange**: Compare order books across exchanges for better execution
3. **Dark Pools**: Use exchange internalization for large orders (if available)
4. **Slippage Attribution**: Track which factors contribute most to slippage (size, time, volatility)

## References

- [ADR-0001: Bot Architecture](0001-bot-architecture.md) — Execution queue
- [ADR-0012: State Machines](0012-state-machines.md) — Order lifecycle
- [ADR-0010: Exchange Adapters](0010-exchange-adapters.md) — Order book APIs
- [ADR-0013: Risk Management Engine](0013-risk-management.md) — Two-phase risk check
