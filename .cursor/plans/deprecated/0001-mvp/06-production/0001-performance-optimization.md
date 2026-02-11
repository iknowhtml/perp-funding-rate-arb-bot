---
name: Performance Optimization
overview: Profile and optimize evaluation loop latency, database queries, and WebSocket processing.
todos:
  - id: profiling
    content: Profile evaluation loop and identify bottlenecks
    status: pending
  - id: evaluation-optimization
    content: Optimize evaluation loop latency
    status: pending
  - id: db-optimization
    content: Optimize database queries and add indexes
    status: pending
  - id: ws-optimization
    content: Optimize WebSocket message processing
    status: pending
  - id: memory-optimization
    content: Optimize memory usage for long-running process
    status: pending
  - id: tests
    content: Add performance benchmarks
    status: pending
  - id: lifecycle-management
    content: Move plan to implemented/ directory after completion (update todos, check validation boxes, update roadmap link, move file, delete from active/)
    status: pending
isProject: false
---

> **Note**: This plan is part of Phase 6 (Production) in [MVP Roadmap](../README.md).

# Performance Optimization

## Overview

Profile and optimize the bot for production-scale operation:
- Evaluation loop latency
- Database query performance
- WebSocket message processing
- Memory usage for 24/7 operation

## Tasks

### 1. Profiling

#### Evaluation Loop Profiling

```typescript
// Add timing instrumentation
const profileEvaluation = async (state: BotState): Promise<EvaluationProfile> => {
  const profile: EvaluationProfile = {
    totalMs: 0,
    healthCheckMs: 0,
    riskEvaluationMs: 0,
    strategyEvaluationMs: 0,
    intentGenerationMs: 0,
  };

  const start = process.hrtime.bigint();

  // Health check
  const healthStart = process.hrtime.bigint();
  const healthResponse = evaluateHealthResponse(state);
  profile.healthCheckMs = Number(process.hrtime.bigint() - healthStart) / 1_000_000;

  // Risk evaluation
  const riskStart = process.hrtime.bigint();
  const risk = evaluateRisk(state, riskConfig);
  profile.riskEvaluationMs = Number(process.hrtime.bigint() - riskStart) / 1_000_000;

  // Strategy evaluation
  const strategyStart = process.hrtime.bigint();
  const intent = evaluateStrategy(marketState, risk, strategyConfig);
  profile.strategyEvaluationMs = Number(process.hrtime.bigint() - strategyStart) / 1_000_000;

  profile.totalMs = Number(process.hrtime.bigint() - start) / 1_000_000;

  return profile;
};
```

#### Memory Profiling

```bash
# Enable heap snapshots
node --expose-gc --inspect dist/index.js

# Take heap snapshot after 1 hour
# Analyze with Chrome DevTools
```

#### Targets

| Component | Target Latency | P99 Target |
|-----------|---------------|------------|
| Evaluation loop | < 50ms | < 100ms |
| Health check | < 1ms | < 5ms |
| Risk evaluation | < 5ms | < 10ms |
| Strategy evaluation | < 10ms | < 20ms |
| DB queries | < 10ms | < 50ms |
| WS message processing | < 1ms | < 5ms |

### 2. Evaluation Loop Optimization

#### Current Bottlenecks

Common bottlenecks to check:
- Funding rate trend calculation (array operations)
- BigInt operations
- JSON serialization
- Logging overhead

#### Optimizations

```typescript
// 1. Cache trend analysis results
const trendCache = new LRUCache<string, FundingRateHistory>({
  max: 10,
  ttl: 5000, // 5 second cache
});

const analyzeFundingRateTrendCached = (
  snapshots: FundingRateSnapshot[],
  window: number,
): FundingRateHistory => {
  const cacheKey = `${snapshots.length}-${window}`;
  const cached = trendCache.get(cacheKey);
  if (cached) return cached;

  const result = analyzeFundingRateTrend(snapshots, window);
  trendCache.set(cacheKey, result);
  return result;
};

// 2. Pre-compute bigint conversions
const riskConfigBigInt = {
  maxPositionSizeCents: BigInt(riskConfig.maxPositionSizeUsd) * 100n,
  maxLeverageBps: BigInt(riskConfig.maxLeverageBps),
  // ... pre-compute all values
};

// 3. Reduce logging in hot path
const evaluateWithMinimalLogging = (state: BotState): TradingIntent => {
  // Only log on state change, not every tick
  const intent = evaluateStrategy(state, risk, config);
  if (intent.type !== "NOOP") {
    logger.info("Intent generated", { intent });
  }
  return intent;
};
```

### 3. Database Optimization

#### Query Analysis

```sql
-- Analyze slow queries
EXPLAIN ANALYZE SELECT * FROM historical_funding_rates
WHERE exchange = 'coinbase' AND symbol = 'BTC-USD'
AND snapshot_at BETWEEN '2025-01-01' AND '2025-06-30'
ORDER BY snapshot_at;
```

#### Index Optimization

```sql
-- Add covering indexes for common queries
CREATE INDEX idx_funding_rates_covering
ON historical_funding_rates(exchange, symbol, snapshot_at DESC)
INCLUDE (funding_rate_bps, predicted_rate_bps, mark_price_quote);

-- Partial index for recent data
CREATE INDEX idx_funding_rates_recent
ON historical_funding_rates(exchange, symbol, snapshot_at DESC)
WHERE snapshot_at > NOW() - INTERVAL '30 days';

-- Add index for state transitions audit
CREATE INDEX idx_state_transitions_entity
ON state_transitions(entity_type, entity_id, timestamp DESC);
```

#### Connection Pooling

```typescript
// Optimize connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10, // Max connections
  min: 2, // Min connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
```

### 4. WebSocket Optimization

#### Message Processing

```typescript
// 1. Process messages synchronously in hot path
ws.on("message", (raw: Buffer) => {
  // Fast path: parse JSON synchronously
  const msg = JSON.parse(raw.toString());

  // Skip validation for known message types
  if (msg.type === "ticker") {
    updateTickerFast(msg);
    return;
  }

  // Full validation for unknown types
  const validated = v.parse(MessageSchema, msg);
  processMessage(validated);
});

// 2. Fast ticker update (no validation)
const updateTickerFast = (msg: TickerMessage): void => {
  state.ticker = {
    bidPriceQuote: BigInt(Math.round(parseFloat(msg.best_bid) * 100)),
    askPriceQuote: BigInt(Math.round(parseFloat(msg.best_ask) * 100)),
    timestamp: new Date(),
  };
};

// 3. Use pre-allocated buffers for frequent messages
const messageBuffer = Buffer.allocUnsafe(4096);
```

### 5. Memory Optimization

#### Prevent Memory Leaks

```typescript
// 1. Limit history size
const MAX_FUNDING_HISTORY = 48; // 48 snapshots = 16 hours at 20min intervals

const addFundingSnapshot = (snapshot: FundingRateSnapshot): void => {
  state.fundingHistory.push(snapshot);
  if (state.fundingHistory.length > MAX_FUNDING_HISTORY) {
    state.fundingHistory.shift(); // Remove oldest
  }
};

// 2. Clear completed orders
const pruneCompletedOrders = (): void => {
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  for (const [orderId, order] of state.orders) {
    if (order.status === "FILLED" && order.updatedAt.getTime() < oneDayAgo) {
      state.orders.delete(orderId);
    }
  }
};

// 3. Schedule periodic cleanup
setInterval(pruneCompletedOrders, 60 * 60 * 1000); // Every hour
```

#### Monitor Memory Usage

```typescript
// Log memory usage periodically
setInterval(() => {
  const usage = process.memoryUsage();
  metrics.system.heapUsedMb.set(usage.heapUsed / 1024 / 1024);
  metrics.system.heapTotalMb.set(usage.heapTotal / 1024 / 1024);
  metrics.system.rssUsedMb.set(usage.rss / 1024 / 1024);

  if (usage.heapUsed > 400 * 1024 * 1024) { // > 400MB
    logger.warn("High memory usage", {
      heapUsedMb: usage.heapUsed / 1024 / 1024,
    });
  }
}, 60000); // Every minute
```

### 6. Performance Benchmarks

Create `src/benchmarks/evaluation.bench.ts`:

```typescript
import { bench, describe } from "vitest";

describe("Evaluation Loop Performance", () => {
  bench("health evaluation", () => {
    evaluateHealthResponse(mockState);
  });

  bench("risk evaluation", () => {
    evaluateRisk(mockState, riskConfig);
  });

  bench("strategy evaluation", () => {
    evaluateStrategy(mockMarketState, mockRisk, strategyConfig);
  });

  bench("full evaluation cycle", async () => {
    await evaluate(mockState, executionQueue, riskConfig, strategyConfig, logger);
  });
});
```

## File Structure

```
src/benchmarks/
├── evaluation.bench.ts   # Evaluation loop benchmarks
├── database.bench.ts     # Database query benchmarks
├── websocket.bench.ts    # WS processing benchmarks
└── setup.ts              # Benchmark setup utilities
```

## Dependencies

- `vitest` (already installed, has benchmark support)

## Validation

- [ ] Evaluation loop < 50ms (P99 < 100ms)
- [ ] Health check < 1ms
- [ ] DB queries < 10ms (P99 < 50ms)
- [ ] WS message processing < 1ms
- [ ] Memory stable over 24 hours (no leaks)
- [ ] Benchmarks pass targets

## References

- [MVP Roadmap](../README.md)
- [ADR-0001: Bot Architecture](../../../../../adrs/0001-bot-architecture.md)
