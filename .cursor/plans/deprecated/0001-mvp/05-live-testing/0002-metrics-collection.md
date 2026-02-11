---
name: Metrics Collection
overview: Implement comprehensive Prometheus metrics for trading, performance, and system health.
todos:
  - id: metric-types
    content: Define trading, performance, and system metrics
    status: pending
  - id: prometheus-metrics
    content: Implement Prometheus metric collection
    status: pending
  - id: trading-metrics
    content: Add metrics for evaluations, executions, P&L
    status: pending
  - id: performance-metrics
    content: Add metrics for latency, error rates
    status: pending
  - id: risk-metrics
    content: Add metrics for position size, margin utilization
    status: pending
  - id: tests
    content: Add unit tests for metrics
    status: pending
  - id: lifecycle-management
    content: Move plan to implemented/ directory after completion (update todos, check validation boxes, update roadmap link, move file, delete from active/)
    status: pending
isProject: false
---

> **Note**: This plan is part of Phase 5 (Live Testing) in [MVP Roadmap](../README.md).

# Metrics Collection

## Overview

Implement comprehensive Prometheus metrics for:
- Trading activity (evaluations, executions, trades)
- Performance (P&L, Sharpe, drawdown)
- System health (latency, error rates)
- Risk (position size, margin utilization, liquidation distance)

Reference: [ADR-0008: Monitoring & Observability](../../../../../adrs/0008-monitoring-observability.md)

## Tasks

### 1. Metric Types

Create `src/lib/metrics/types.ts`:

```typescript
export interface TradingMetrics {
  // Evaluation loop
  evaluationsTotal: Counter;
  evaluationDurationMs: Histogram;
  evaluationsSkipped: Counter; // Skipped due to busy queue
  
  // Executions
  executionsTotal: Counter;
  executionDurationMs: Histogram;
  executionsSuccess: Counter;
  executionsFailed: Counter;
  executionsAborted: Counter;
  
  // Trades
  tradesEnteredTotal: Counter;
  tradesExitedTotal: Counter;
  tradePnLCents: Histogram;
  tradeHoldTimeHours: Histogram;
  tradeFundingReceivedCents: Counter;
  tradeSlippageCostCents: Counter;
}

export interface PerformanceMetrics {
  // P&L tracking
  totalPnLCents: Gauge;
  dailyPnLCents: Gauge;
  unrealizedPnLCents: Gauge;
  
  // Returns
  totalReturnBps: Gauge;
  dailyReturnBps: Gauge;
  
  // Risk-adjusted
  sharpeRatio: Gauge;
  maxDrawdownBps: Gauge;
  currentDrawdownBps: Gauge;
  
  // Win/loss
  winRate: Gauge;
  profitFactor: Gauge;
}

export interface SystemMetrics {
  // Latency
  restLatencyMs: Histogram;
  wsLatencyMs: Histogram;
  dbLatencyMs: Histogram;
  
  // Errors
  restErrorsTotal: Counter;
  wsReconnectsTotal: Counter;
  reconciliationInconsistencies: Counter;
  
  // Health
  wsConnected: Gauge;
  restHealthy: Gauge;
  lastReconcileTimestamp: Gauge;
}

export interface RiskMetrics {
  // Position
  positionSizeCents: Gauge;
  positionNotionalCents: Gauge;
  
  // Leverage and margin
  leverageBps: Gauge;
  marginUsedCents: Gauge;
  marginUtilizationBps: Gauge;
  
  // Liquidation
  liquidationDistanceBps: Gauge;
  liquidationPriceCents: Gauge;
  
  // Limits
  riskLevel: Gauge; // 0=SAFE, 1=CAUTION, 2=WARNING, 3=DANGER, 4=BLOCKED
}
```

### 2. Prometheus Metrics Implementation

Create `src/lib/metrics/prometheus.ts`:

```typescript
import { Counter, Gauge, Histogram, Registry } from "prom-client";

export const createMetrics = (registry: Registry) => {
  // Trading Metrics
  const evaluationsTotal = new Counter({
    name: "bot_evaluations_total",
    help: "Total number of evaluation ticks",
    registers: [registry],
  });

  const evaluationDurationMs = new Histogram({
    name: "bot_evaluation_duration_ms",
    help: "Duration of evaluation tick in milliseconds",
    buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
    registers: [registry],
  });

  const executionsTotal = new Counter({
    name: "bot_executions_total",
    help: "Total number of executions",
    labelNames: ["type", "result"], // type: enter/exit, result: success/failed/aborted
    registers: [registry],
  });

  const executionDurationMs = new Histogram({
    name: "bot_execution_duration_ms",
    help: "Duration of execution in milliseconds",
    labelNames: ["type"],
    buckets: [100, 250, 500, 1000, 2500, 5000, 10000],
    registers: [registry],
  });

  // Performance Metrics
  const totalPnLCents = new Gauge({
    name: "bot_total_pnl_cents",
    help: "Total P&L in cents",
    registers: [registry],
  });

  const dailyPnLCents = new Gauge({
    name: "bot_daily_pnl_cents",
    help: "Daily P&L in cents",
    registers: [registry],
  });

  const totalReturnBps = new Gauge({
    name: "bot_total_return_bps",
    help: "Total return in basis points",
    registers: [registry],
  });

  const sharpeRatio = new Gauge({
    name: "bot_sharpe_ratio",
    help: "Current Sharpe ratio",
    registers: [registry],
  });

  const maxDrawdownBps = new Gauge({
    name: "bot_max_drawdown_bps",
    help: "Maximum drawdown in basis points",
    registers: [registry],
  });

  const currentDrawdownBps = new Gauge({
    name: "bot_current_drawdown_bps",
    help: "Current drawdown from peak in basis points",
    registers: [registry],
  });

  // System Metrics
  const restLatencyMs = new Histogram({
    name: "bot_rest_latency_ms",
    help: "REST API latency in milliseconds",
    labelNames: ["endpoint"],
    buckets: [10, 25, 50, 100, 250, 500, 1000, 2500],
    registers: [registry],
  });

  const wsConnected = new Gauge({
    name: "bot_ws_connected",
    help: "WebSocket connection status (1=connected, 0=disconnected)",
    labelNames: ["stream"],
    registers: [registry],
  });

  const restHealthy = new Gauge({
    name: "bot_rest_healthy",
    help: "REST API health status (1=healthy, 0=unhealthy)",
    registers: [registry],
  });

  const restErrorsTotal = new Counter({
    name: "bot_rest_errors_total",
    help: "Total REST API errors",
    labelNames: ["endpoint", "error_type"],
    registers: [registry],
  });

  // Risk Metrics
  const positionSizeCents = new Gauge({
    name: "bot_position_size_cents",
    help: "Current position size in cents",
    registers: [registry],
  });

  const leverageBps = new Gauge({
    name: "bot_leverage_bps",
    help: "Current leverage in basis points",
    registers: [registry],
  });

  const marginUtilizationBps = new Gauge({
    name: "bot_margin_utilization_bps",
    help: "Margin utilization in basis points",
    registers: [registry],
  });

  const liquidationDistanceBps = new Gauge({
    name: "bot_liquidation_distance_bps",
    help: "Distance to liquidation price in basis points",
    registers: [registry],
  });

  const riskLevel = new Gauge({
    name: "bot_risk_level",
    help: "Current risk level (0=SAFE, 1=CAUTION, 2=WARNING, 3=DANGER, 4=BLOCKED)",
    registers: [registry],
  });

  // Market Data Metrics
  const fundingRateBps = new Gauge({
    name: "bot_funding_rate_bps",
    help: "Current funding rate in basis points",
    labelNames: ["symbol"],
    registers: [registry],
  });

  const spotPriceCents = new Gauge({
    name: "bot_spot_price_cents",
    help: "Current spot price in cents",
    labelNames: ["symbol"],
    registers: [registry],
  });

  const perpPriceCents = new Gauge({
    name: "bot_perp_price_cents",
    help: "Current perpetual price in cents",
    labelNames: ["symbol"],
    registers: [registry],
  });

  return {
    trading: {
      evaluationsTotal,
      evaluationDurationMs,
      executionsTotal,
      executionDurationMs,
    },
    performance: {
      totalPnLCents,
      dailyPnLCents,
      totalReturnBps,
      sharpeRatio,
      maxDrawdownBps,
      currentDrawdownBps,
    },
    system: {
      restLatencyMs,
      wsConnected,
      restHealthy,
      restErrorsTotal,
    },
    risk: {
      positionSizeCents,
      leverageBps,
      marginUtilizationBps,
      liquidationDistanceBps,
      riskLevel,
    },
    market: {
      fundingRateBps,
      spotPriceCents,
      perpPriceCents,
    },
  };
};
```

### 3. Metrics Service

Create `src/lib/metrics/service.ts`:

```typescript
export interface MetricsService {
  // Trading
  recordEvaluation(durationMs: number): void;
  recordEvaluationSkipped(): void;
  recordExecution(type: "enter" | "exit", result: "success" | "failed" | "aborted", durationMs: number): void;
  recordTrade(trade: { pnlCents: bigint; holdTimeHours: number; fundingCents: bigint; slippageCents: bigint }): void;

  // Performance
  updatePerformance(metrics: PerformanceSnapshot): void;

  // System
  recordRestLatency(endpoint: string, durationMs: number): void;
  recordRestError(endpoint: string, errorType: string): void;
  setWsConnected(stream: string, connected: boolean): void;
  setRestHealthy(healthy: boolean): void;

  // Risk
  updateRiskMetrics(risk: RiskSnapshot): void;

  // Market
  updateMarketData(market: MarketSnapshot): void;
}

export interface PerformanceSnapshot {
  totalPnLCents: bigint;
  dailyPnLCents: bigint;
  totalReturnBps: bigint;
  sharpeRatio: number;
  maxDrawdownBps: bigint;
  currentDrawdownBps: bigint;
}

export interface RiskSnapshot {
  positionSizeCents: bigint;
  leverageBps: bigint;
  marginUtilizationBps: bigint;
  liquidationDistanceBps: bigint;
  riskLevel: "SAFE" | "CAUTION" | "WARNING" | "DANGER" | "BLOCKED";
}

export interface MarketSnapshot {
  symbol: string;
  fundingRateBps: bigint;
  spotPriceCents: bigint;
  perpPriceCents: bigint;
}

export const createMetricsService = (metrics: ReturnType<typeof createMetrics>): MetricsService => {
  const riskLevelMap: Record<string, number> = {
    SAFE: 0,
    CAUTION: 1,
    WARNING: 2,
    DANGER: 3,
    BLOCKED: 4,
  };

  return {
    recordEvaluation: (durationMs) => {
      metrics.trading.evaluationsTotal.inc();
      metrics.trading.evaluationDurationMs.observe(durationMs);
    },

    recordEvaluationSkipped: () => {
      metrics.trading.evaluationsTotal.inc();
    },

    recordExecution: (type, result, durationMs) => {
      metrics.trading.executionsTotal.inc({ type, result });
      metrics.trading.executionDurationMs.observe({ type }, durationMs);
    },

    recordTrade: (trade) => {
      // Record trade metrics
    },

    updatePerformance: (snapshot) => {
      metrics.performance.totalPnLCents.set(Number(snapshot.totalPnLCents));
      metrics.performance.dailyPnLCents.set(Number(snapshot.dailyPnLCents));
      metrics.performance.totalReturnBps.set(Number(snapshot.totalReturnBps));
      metrics.performance.sharpeRatio.set(snapshot.sharpeRatio);
      metrics.performance.maxDrawdownBps.set(Number(snapshot.maxDrawdownBps));
      metrics.performance.currentDrawdownBps.set(Number(snapshot.currentDrawdownBps));
    },

    recordRestLatency: (endpoint, durationMs) => {
      metrics.system.restLatencyMs.observe({ endpoint }, durationMs);
    },

    recordRestError: (endpoint, errorType) => {
      metrics.system.restErrorsTotal.inc({ endpoint, error_type: errorType });
    },

    setWsConnected: (stream, connected) => {
      metrics.system.wsConnected.set({ stream }, connected ? 1 : 0);
    },

    setRestHealthy: (healthy) => {
      metrics.system.restHealthy.set(healthy ? 1 : 0);
    },

    updateRiskMetrics: (risk) => {
      metrics.risk.positionSizeCents.set(Number(risk.positionSizeCents));
      metrics.risk.leverageBps.set(Number(risk.leverageBps));
      metrics.risk.marginUtilizationBps.set(Number(risk.marginUtilizationBps));
      metrics.risk.liquidationDistanceBps.set(Number(risk.liquidationDistanceBps));
      metrics.risk.riskLevel.set(riskLevelMap[risk.riskLevel] ?? 0);
    },

    updateMarketData: (market) => {
      metrics.market.fundingRateBps.set({ symbol: market.symbol }, Number(market.fundingRateBps));
      metrics.market.spotPriceCents.set({ symbol: market.symbol }, Number(market.spotPriceCents));
      metrics.market.perpPriceCents.set({ symbol: market.symbol }, Number(market.perpPriceCents));
    },
  };
};
```

## File Structure

```
src/lib/metrics/
├── types.ts              # Metric type definitions
├── prometheus.ts         # Prometheus metric creation
├── prometheus.test.ts
├── service.ts            # Metrics service
├── service.test.ts
└── index.ts              # Re-exports
```

## Dependencies

- `prom-client` (already installed)

## Validation

- [ ] All trading metrics recorded
- [ ] Performance metrics updated correctly
- [ ] System health metrics accurate
- [ ] Risk metrics track current state
- [ ] Metrics endpoint returns valid Prometheus format
- [ ] Unit tests pass

## References

- [MVP Roadmap](../README.md)
- [ADR-0008: Monitoring & Observability](../../../../../adrs/0008-monitoring-observability.md)
