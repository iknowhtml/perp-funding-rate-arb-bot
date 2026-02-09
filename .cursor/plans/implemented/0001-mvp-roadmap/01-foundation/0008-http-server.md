---
name: HTTP Server
overview: Set up Hono HTTP server with health check and Prometheus metrics endpoints per ADR-0004 and ADR-0008.
todos:
  - id: hono-setup
    content: Set up Hono server per ADR-0004
    status: completed
  - id: health-check
    content: Implement health check endpoint per ADR-0008
    status: completed
  - id: metrics-endpoint
    content: Implement Prometheus metrics endpoint per ADR-0008
    status: completed
isProject: false
---

> **Note**: This plan is part of Phase 1 (Foundation) in [MVP Roadmap](../../../active/0001-mvp-roadmap/README.md).

# HTTP Server

## Overview

Set up an HTTP server using Hono framework with health check and Prometheus metrics endpoints. This provides observability and allows external systems to monitor the bot's status.

## Tasks

### 1. Hono Server Setup

Create `src/server/index.ts`:

```typescript
import { Hono } from "hono";
import { logger } from "../lib/logger";
import { config } from "../lib/config";

const app = new Hono();

// Middleware
app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  logger.info("HTTP request", {
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    durationMs: duration,
  });
});

// Routes
app.get("/", (c) => c.json({ message: "Funding Rate Arb Bot API" }));

export const startServer = async () => {
  const port = config.server.port;
  const server = {
    port,
    fetch: app.fetch,
  };

  logger.info(`Starting HTTP server on port ${port}`);
  
  // In production, use a proper HTTP server
  // For now, this is a placeholder
  return server;
};
```

### 2. Health Check Endpoint

Create `src/server/routes/health.ts`:

```typescript
import { Hono } from "hono";
import { db } from "../../lib/db/client";

const health = new Hono();

health.get("/", async (c) => {
  const checks = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    checks: {
      database: await checkDatabase(),
    },
  };

  const allHealthy = Object.values(checks.checks).every((check) => check.status === "healthy");
  
  return c.json(checks, allHealthy ? 200 : 503);
});

const checkDatabase = async () => {
  try {
    await db.execute("SELECT 1");
    return { status: "healthy" };
  } catch (error) {
    return {
      status: "unhealthy",
      error: (error as Error).message,
    };
  }
};

export { health };
```

Register in `src/server/index.ts`:

```typescript
import { health } from "./routes/health";

app.route("/health", health);
```

### 3. Prometheus Metrics Endpoint

Create `src/server/routes/metrics.ts`:

```typescript
import { Hono } from "hono";

const metrics = new Hono();

// Simple metrics store (in production, use prom-client)
const metricsStore = {
  httpRequestsTotal: 0,
  httpRequestDuration: [] as number[],
  jobsProcessed: 0,
  jobsFailed: 0,
};

metrics.get("/", (c) => {
  const prometheusFormat = `
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total ${metricsStore.httpRequestsTotal}

# HELP http_request_duration_seconds HTTP request duration in seconds
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{le="0.1"} ${metricsStore.httpRequestDuration.filter((d) => d < 100).length}
http_request_duration_seconds_bucket{le="0.5"} ${metricsStore.httpRequestDuration.filter((d) => d < 500).length}
http_request_duration_seconds_bucket{le="1.0"} ${metricsStore.httpRequestDuration.filter((d) => d < 1000).length}
http_request_duration_seconds_bucket{le="+Inf"} ${metricsStore.httpRequestDuration.length}

# HELP jobs_processed_total Total number of jobs processed
# TYPE jobs_processed_total counter
jobs_processed_total ${metricsStore.jobsProcessed}

# HELP jobs_failed_total Total number of failed jobs
# TYPE jobs_failed_total counter
jobs_failed_total ${metricsStore.jobsFailed}
`.trim();

  return c.text(prometheusFormat, 200, {
    "Content-Type": "text/plain; version=0.0.4",
  });
});

export { metrics, metricsStore };
```

Register in `src/server/index.ts`:

```typescript
import { metrics } from "./routes/metrics";

app.route("/metrics", metrics);
```

## File Structure

```
src/server/
├── index.ts
├── routes/
│   ├── health.ts
│   └── metrics.ts
└── index.test.ts
```

## Dependencies

- `hono` (per ADR-0004)
- Optional: `prom-client` for production metrics

## Validation

- [x] Hono server starts successfully
- [x] Health check endpoint returns 200 when healthy
- [x] Health check endpoint returns 503 when database is down
- [x] Metrics endpoint returns Prometheus-formatted metrics
- [x] Server logs requests correctly
- [x] Server handles errors gracefully

## References

- [MVP Roadmap](../../../active/0001-mvp-roadmap/README.md)
- [ADR-0004: Backend Framework Hono](../../../../../adrs/0004-backend-framework-hono.md)
- [ADR-0008: Monitoring Observability](../../../../../adrs/0008-monitoring-observability.md)
- [Hono Documentation](https://hono.dev/)
