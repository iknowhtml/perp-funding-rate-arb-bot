# ADR 0008: Monitoring & Observability

- **Status:** Accepted
- **Date:** 2026-02-04
- **Owners:** -
- **Related:**
  - [ADR-0001: Bot Architecture](0001-bot-architecture.md)
  - [ADR-0007: Infrastructure — Fly.io Deployment](0007-infrastructure-flyio.md)
  - [ADR-0004: Backend Framework — Hono](0004-backend-framework-hono.md)

## Context

A trading bot running 24/7 requires visibility into:
- **Health status**: Is the bot running? Are WebSocket connections alive? Is the database reachable?
- **Trading activity**: How many evaluations? Executions? Position value?
- **Errors**: API failures, reconciliation inconsistencies, execution anomalies
- **Performance**: Latency of exchange calls, evaluation cycle time

Without proper monitoring, failures go unnoticed until positions are at risk or money is lost.

## Decision

**Implement a multi-layered monitoring strategy:**
1. **Health checks** for infrastructure-level monitoring (Fly.io, restart on failure)
2. **Application metrics** for trading activity and performance
3. **Alerting** for critical events (Discord/Telegram)

## Health Checks

### Health Server Implementation

The bot exposes an HTTP health endpoint via Hono (see [ADR-0004: Backend Framework — Hono](0004-backend-framework-hono.md)):

```typescript
// src/server/routes/health.ts
import { Hono } from "hono";
import { z } from "zod";

const router = new Hono();

const HealthResponseSchema = z.object({
  healthy: z.boolean(),
  uptime: z.number(),
  lastEvaluation: z.string().nullable(),
  wsConnected: z.boolean(),
  dbConnected: z.boolean(),
  positionOpen: z.boolean(),
  lastReconciliation: z.string().nullable(),
});

type HealthResponse = z.infer<typeof HealthResponseSchema>;

router.get("/", async (c) => {
  const health = getHealthStatus(); // From worker state
  
  const response: HealthResponse = {
    healthy: health.healthy,
    uptime: process.uptime(),
    lastEvaluation: health.lastEvaluation?.toISOString() ?? null,
    wsConnected: health.wsConnected,
    dbConnected: health.dbConnected,
    positionOpen: health.positionOpen,
    lastReconciliation: health.lastReconciliation?.toISOString() ?? null,
  };
  
  const status = health.healthy ? 200 : 503;
  return c.json(response, status);
});

export { router as healthRouter };
```

### Health Status Calculation

```typescript
// src/worker/health-status.ts

export const calculateHealth = (state: BotState): HealthStatus => {
  const now = Date.now();
  const evaluationStale = state.lastEvaluation
    ? now - state.lastEvaluation.getTime() > 10_000 // 10s threshold
    : true;

  const reconciliationStale = state.lastReconciliation
    ? now - state.lastReconciliation.getTime() > 120_000 // 2min threshold
    : true;

  const healthy =
    state.wsConnected &&
    state.dbConnected &&
    !evaluationStale &&
    !reconciliationStale;

  return {
    healthy,
    uptime: process.uptime(),
    lastEvaluation: state.lastEvaluation?.toISOString() ?? null,
    wsConnected: state.wsConnected,
    dbConnected: state.dbConnected,
    positionOpen: state.position?.open ?? false,
    lastReconciliation: state.lastReconciliation?.toISOString() ?? null,
  };
};
```

### Infrastructure Health Checks

Fly.io uses the health endpoint to restart unhealthy containers:

```toml
# fly.toml
[checks]
  [checks.health]
    port = 8080
    type = "http"
    interval = "30s"
    timeout = "5s"
    grace_period = "10s"
    method = "GET"
    path = "/health"
```

**Health check behavior:**
- Returns `200 OK` when healthy (all systems operational)
- Returns `503 Service Unavailable` when unhealthy (stale data, disconnected)
- Fly.io restarts the container if health checks fail repeatedly

## Application Metrics

### Key Metrics to Track

```typescript
// src/lib/metrics/types.ts

export interface Metrics {
  // Trading activity
  evaluationTicks: Counter;        // Total evaluation cycles
  executionJobs: Counter;           // Jobs executed (enter/exit)
  executionJobsSuccess: Counter;    // Successful executions
  executionJobsFailed: Counter;     // Failed executions
  
  // Connectivity
  wsReconnects: Counter;           // WebSocket reconnection count
  wsMessagesReceived: Counter;     // WebSocket messages processed
  restApiCalls: Counter;           // REST API calls made
  restApiErrors: Counter;          // REST API errors
  
  // Reconciliation
  reconciliationRuns: Counter;     // Reconciliation cycles
  reconciliationInconsistencies: Counter; // Inconsistencies detected
  
  // Position tracking
  positionValue: Gauge;            // Current position notional (USD)
  positionPnL: Gauge;              // Current PnL (USD)
  fundingRateBps: Gauge;           // Current funding rate (basis points)
  
  // Performance
  evaluationLatency: Histogram;   // Evaluation cycle time (ms)
  executionLatency: Histogram;     // Execution job time (ms)
  exchangeApiLatency: Histogram;  // Exchange API call time (ms)
}
```

### Metrics Implementation

```typescript
// src/lib/metrics/metrics.ts

import type { Counter, Gauge, Histogram } from "prom-client";

export const createMetrics = () => {
  const evaluationTicks = new Counter({
    name: "bot_evaluation_ticks_total",
    help: "Total number of evaluation cycles",
  });

  const executionJobs = new Counter({
    name: "bot_execution_jobs_total",
    help: "Total number of execution jobs",
    labelNames: ["type", "status"], // type: 'ENTER' | 'EXIT', status: 'success' | 'failed'
  });

  const positionValue = new Gauge({
    name: "bot_position_value_usd",
    help: "Current position notional value in USD",
  });

  const evaluationLatency = new Histogram({
    name: "bot_evaluation_latency_ms",
    help: "Evaluation cycle latency in milliseconds",
    buckets: [10, 50, 100, 500, 1000, 5000],
  });

  return {
    evaluationTicks,
    executionJobs,
    positionValue,
    evaluationLatency,
    // ... other metrics
  };
};
```

### Metrics Endpoint

Expose metrics for Prometheus scraping via Hono:

```typescript
// src/server/routes/metrics.ts
import { Hono } from "hono";
import { register } from "prom-client";

const router = new Hono();

router.get("/", async (c) => {
  const metrics = await register.metrics();
  return c.text(metrics, 200, {
    "Content-Type": register.contentType,
  });
});

export { router as metricsRouter };
```

## Alerting Strategy

### Alert Levels

| Level | Trigger | Channel | Response Time |
|-------|---------|---------|---------------|
| **Critical** | Position at risk, execution failures, reconciliation failures | Discord + Telegram | Immediate |
| **Warning** | Stale data, API errors, high latency | Discord | Within 5 minutes |
| **Info** | Position opened/closed, reconciliation completed | Discord | Logged only |

### Critical Alerts

```typescript
// src/lib/alerts/types.ts

export type AlertLevel = "critical" | "warning" | "info";

export interface Alert {
  level: AlertLevel;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: Date;
}

// Critical alert examples
export const createCriticalAlerts = {
  executionFailure: (error: Error, context: ExecutionContext): Alert => ({
    level: "critical",
    title: "Execution Failure",
    message: `Failed to execute ${context.type}: ${error.message}`,
    data: { error: error.message, context },
    timestamp: new Date(),
  }),

  reconciliationFailure: (inconsistencies: Inconsistency[]): Alert => ({
    level: "critical",
    title: "Reconciliation Inconsistencies",
    message: `Found ${inconsistencies.length} inconsistencies`,
    data: { inconsistencies },
    timestamp: new Date(),
  }),

  positionAtRisk: (position: Position, risk: RiskAssessment): Alert => ({
    level: "critical",
    title: "Position at Risk",
    message: `Position ${position.notionalUsd} USD at risk: ${risk.reasons.join(", ")}`,
    data: { position, risk },
    timestamp: new Date(),
  }),

  staleData: (component: string, lastUpdate: Date): Alert => ({
    level: "critical",
    title: "Stale Data Detected",
    message: `${component} data is stale (last update: ${lastUpdate.toISOString()})`,
    data: { component, lastUpdate },
    timestamp: new Date(),
  }),
};
```

### Alert Channels

```typescript
// src/lib/alerts/discord.ts

export const sendDiscordAlert = async (alert: Alert, webhookUrl: string) => {
  const color = {
    critical: 0xff0000, // Red
    warning: 0xffaa00, // Orange
    info: 0x00aaff,    // Blue
  }[alert.level];

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [
        {
          title: alert.title,
          description: alert.message,
          color,
          fields: alert.data
            ? Object.entries(alert.data).map(([key, value]) => ({
                name: key,
                value: String(value),
                inline: true,
              }))
            : [],
          timestamp: alert.timestamp.toISOString(),
        },
      ],
    }),
  });
};
```

### Alert Integration

```typescript
// src/lib/alerts/alert-service.ts

export const createAlertService = (config: AlertConfig) => {
  const send = async (alert: Alert) => {
    // Always log
    console.error(`[${alert.level.toUpperCase()}] ${alert.title}: ${alert.message}`);

    // Send to Discord for all levels
    if (config.discordWebhookUrl) {
      await sendDiscordAlert(alert, config.discordWebhookUrl);
    }

    // Send to Telegram for critical only
    if (alert.level === "critical" && config.telegram) {
      await sendTelegramAlert(alert, config.telegram);
    }
  };

  return { send };
};
```

## Logging Strategy

### Structured Logging

Use structured logs for better observability:

```typescript
// src/lib/logger/logger.ts

export interface LogEntry {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export const createLogger = (config: LoggerConfig) => {
  const log = (level: LogEntry["level"], message: string, data?: Record<string, unknown>) => {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      data,
    };

    const output = JSON.stringify(entry);
    
    if (level === "error") {
      console.error(output);
    } else if (level === "warn") {
      console.warn(output);
    } else {
      console.log(output);
    }
  };

  return {
    debug: (message: string, data?: Record<string, unknown>) => log("debug", message, data),
    info: (message: string, data?: Record<string, unknown>) => log("info", message, data),
    warn: (message: string, data?: Record<string, unknown>) => log("warn", message, data),
    error: (message: string, data?: Record<string, unknown>) => log("error", message, data),
  };
};
```

### Log Levels

- **Debug**: Detailed execution flow (evaluation decisions, API calls)
- **Info**: Normal operations (position opened/closed, reconciliation completed)
- **Warn**: Recoverable issues (API retries, stale data warnings)
- **Error**: Failures (execution errors, reconciliation inconsistencies)

## Consequences

### Positive

1. **Early failure detection**: Health checks restart unhealthy containers automatically
2. **Trading visibility**: Metrics show evaluation/execution activity in real-time
3. **Alerting**: Critical issues trigger immediate notifications
4. **Debugging**: Structured logs and metrics enable post-mortem analysis
5. **Performance monitoring**: Latency metrics identify bottlenecks

### Negative

1. **Operational overhead**: Requires maintaining alert channels and monitoring dashboards
2. **Noise**: Too many alerts can cause alert fatigue (mitigate with proper thresholds)
3. **Cost**: External monitoring services (if used) add cost

### Risks

| Risk | Mitigation |
|------|------------|
| Alert fatigue | Use proper thresholds; only alert on actionable issues |
| Metrics overhead | Use sampling for high-frequency metrics |
| Log volume | Rotate logs; archive old logs to cold storage |
| Health check false positives | Tune thresholds; use grace periods |

## Future Considerations

1. **Dashboards**: Build Grafana dashboards for visual monitoring
2. **Distributed tracing**: Add OpenTelemetry for request tracing across services
3. **Anomaly detection**: ML-based anomaly detection for unusual trading patterns
4. **SLA monitoring**: Track uptime, execution success rate, reconciliation accuracy

## References

- [ADR-0001: Bot Architecture](0001-bot-architecture.md) — Worker loop and state management
- [ADR-0007: Infrastructure — Fly.io Deployment](0007-infrastructure-flyio.md) — Health check configuration
- [ADR-0004: Backend Framework — Hono](0004-backend-framework-hono.md) — HTTP server implementation
- [Prometheus Client Library](https://github.com/siimon/prom-client) — Node.js metrics library
