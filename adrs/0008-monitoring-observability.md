# ADR 0008: Monitoring & Observability

- **Status:** Accepted
- **Date:** 2026-02-04
- **Updated:** 2026-03-04
- **Owners:** -
- **Related:**
  - [ADR-0001: Bot Architecture](0001-bot-architecture.md)
  - [ADR-0029: Infrastructure — Railway Deployment](0029-infrastructure-railway.md)
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
1. **Health checks** for infrastructure-level monitoring
2. **Application metrics** for trading activity and performance
3. **Alerting** for critical events (Discord/Telegram)

## Health Checks

### Health Server Implementation

The bot exposes an HTTP health endpoint (e.g. via Hono; see [ADR-0004](0004-backend-framework-hono.md)). Return **200** when critical dependencies are healthy, **503** when unhealthy. Response shape and which checks run (e.g. database, data plane freshness) are implementation-defined. Health is derived from worker/evaluator state; unhealthy when dependencies are down or data is stale beyond thresholds. See `server/routes/health/` and worker health logic in source.

### Infrastructure Health Checks

Platforms (e.g. Railway, Fly.io) can call the health endpoint to restart unhealthy containers. Configure HTTP check: port (e.g. 8080), path `/health`, interval/timeout/grace period as needed.

**Health check behavior:**
- Returns `200 OK` when healthy (all systems operational)
- Returns `503 Service Unavailable` when unhealthy (stale data, disconnected)
- Platform restarts the container if health checks fail repeatedly (when configured)

## Application Metrics

### Key Metrics to Track

Track **trading activity** (evaluation cycles, execution jobs, success/failure), **connectivity** (data plane health, API/RPC calls and errors), **reconciliation** (runs, inconsistencies), **position** (notional, PnL, funding rate), and **performance** (evaluation latency, execution latency, API latency). Implementations may use a metrics library (e.g. prom-client) or a minimal Prometheus-format endpoint. See `server/routes/metrics/` and `package.json` for the current approach.

### Metrics Endpoint

Expose a `/metrics` endpoint that returns Prometheus text format. See server routes in source.

## Alerting Strategy

### Alert Levels

| Level | Trigger | Channel | Response Time |
|-------|---------|---------|---------------|
| **Critical** | Position at risk, execution failures, reconciliation failures | Discord + Telegram | Immediate |
| **Warning** | Stale data, API errors, high latency | Discord | Within 5 minutes |
| **Info** | Position opened/closed, reconciliation completed | Discord | Logged only |

### Critical Alerts

Critical events (e.g. execution failure, reconciliation inconsistencies, position at risk, stale data) should trigger alerts. Use levels (critical / warning / info) and route accordingly (e.g. Discord for all, Telegram for critical only). Payload shape and channel integration are implementation-defined. See source when alerting is implemented.

### Alert Channels

Deliver alerts via Discord webhooks and/or Telegram. Format (title, message, optional data, timestamp) and routing logic are implementation-defined.

## Logging Strategy

### Structured Logging

Use structured logging (level, message, timestamp, optional data) for observability. See `lib/logger/` for the current logger API.

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

## Dependencies

Metrics may use a library (e.g. prom-client) or a minimal custom Prometheus-format exporter. See `package.json` for current dependencies.

## References

- [ADR-0001: Bot Architecture](0001-bot-architecture.md) — Worker loop and state management
- [ADR-0029: Infrastructure — Railway Deployment](0029-infrastructure-railway.md) — Health check configuration
- [ADR-0004: Backend Framework — Hono](0004-backend-framework-hono.md) — HTTP server implementation
- [Prometheus Client Library](https://github.com/siimon/prom-client) — Node.js metrics library
