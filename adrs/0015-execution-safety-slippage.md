# ADR 0015: Execution Safety & Slippage Modeling

- **Status:** Accepted
- **Date:** 2026-02-04
- **Updated:** 2026-03-04
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

Estimate expected slippage by analyzing order book depth. Types: `OrderBookSnapshot` (bids/asks with price and quantity, timestamp), `SlippageEstimate` (expectedPrice, slippageBps, canExecute, requiredDepth, availableDepth). Order types (OrderParams, OrderResult, Order, Fill) align with ADR-0010. Helpers: mid price from order book, sleep utility. Errors: `SlippageLimitExceededError` for limit violations. See source for current types and helpers.

### Order Book Depth Analysis

Walk order book levels (asks for BUY, bids for SELL), compute cumulative quantity and value until quantity is filled; if insufficient depth return canExecute false. Otherwise compute weighted average price and slippage in bps vs mid; return estimate with canExecute = (slippageBps <= maxSlippageBps). See source for `estimateSlippage`.

### Slippage Limits Configuration

Config: maxSlippageBps (hard limit), warningSlippageBps, maxOrderSizeBps (vs 24h volume), minLiquidityMultiplier. See source for `SlippageConfig`.

### Execution Strategies

#### Strategy 1: Market Order (Fast, Higher Slippage)

Use when slippage estimate &lt; warning threshold, time-sensitive, or small size. Validate canExecute then call adapter with type MARKET. See source.

#### Strategy 2: Limit Order (Slower, Lower Slippage)

Use when slippage &gt; warning or large size. Place limit at expectedPrice, timeInForce IOC. See source.

#### Strategy 3: TWAP (Time-Weighted Average Price)

Split quantity into chunks; for each chunk fetch order book, estimate slippage, execute market (or limit) with chunk size; sleep between chunks. See source for `executeTWAP`.

### Realized Slippage Tracking (Post-Trade)

Track actual vs expected: from order, fills, and order book snapshot compute actual price (volume-weighted), realized slippage bps vs mid, expected slippage bps; return ExecutionAnalysis (orderId, expected/actual price, slippage fields, snapshot, executionTime). See source for `analyzeExecution` and `ExecutionAnalysis`.

### Position Sizing Based on Liquidity

Compute entry and exit depth via estimateSlippage for both sides; cap size by min depth / minLiquidityMultiplier; return min(desiredSize, maxSizeByLiquidity). See source for `calculateOptimalPositionSize`.

### Execution Safety Checks

Before executing any order:

1. **Check slippage estimate** (must be &lt; max slippage)
2. **Check order book depth** (must have sufficient liquidity)
3. **Check order size** (must be &lt; max order size % of volume)
4. **Re-check risk** (ADR-0013: two-phase risk check)

Implementation: get order book, run estimateSlippage, validate canExecute and depth, optionally check order size vs 24h volume; return valid + slippageEstimate or reason. See source for `validateExecution`.

### Hedge Drift Detection and Correction

When perp and spot notional diverge after execution: define max drift (e.g. 50 bps). Compute HedgeDrift from filled quantities and average prices; set needsCorrection if driftBps &gt; threshold. correctDrift: place market order(s) to bring spot/perp notional in line. See source for `calculateHedgeDrift`, `correctDrift`, and `HedgeDrift`.

### Execution Circuit Breaker

Use cockatiel CircuitBreaker (ConsecutiveBreaker, halfOpenAfter). On state change to open, send alert. See source for `createExecutionCircuitBreaker` and usage.

### Integration with Execution Queue

Enter-hedge flow: check circuit breaker; get order book; compute optimal size; validate execution; execute perp then spot through circuit breaker with fill confirmation; handle partial fills (retry remaining quantity); compute and correct hedge drift; analyze execution and log metrics; alert on slippage anomaly. Partial fills completed via p-retry. See `src/worker/` and execution/slippage modules for current implementation.

## Consequences

### Positive

1. **Profitability Protection**: Prevents entering positions with excessive slippage
2. **Execution Quality**: Tracks realized vs expected slippage for optimization
3. **Liquidity Awareness**: Adjusts position sizing based on available depth
4. **Risk Reduction**: Validates execution safety before placing orders
5. **Fill Confirmation**: Explicit polling prevents assuming orders are filled
6. **Drift Correction**: Automatic correction prevents notional mismatch
7. **Circuit Breaker**: Prevents cascading failures during execution

### Negative

1. **Complexity**: Requires order book depth analysis and slippage estimation
2. **Latency**: Order book fetching and fill polling add latency to execution path
3. **False Positives**: May reject valid opportunities if order book snapshot is stale
4. **Overhead**: Circuit breaker and retry logic add complexity

### Risks

| Risk | Mitigation |
|------|------------|
| Stale order book data | Use WebSocket order book updates, validate timestamp |
| Order book manipulation | Use multiple exchanges for price discovery (future) |
| Slippage model incorrect | Backtest slippage estimates vs realized, tune model |
| Large order impact | Use TWAP for large orders, split into chunks |
| Fill confirmation timeout | Cancel order and retry, or abort with alert |
| Partial fills | Complete remaining quantity with retries |
| Hedge drift | Automatic correction with small market orders |
| Consecutive failures | Circuit breaker prevents runaway execution attempts |

## Dependencies

p-retry and p-timeout for fill confirmation and retries; cockatiel for circuit breaker. See repo `package.json`.

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
