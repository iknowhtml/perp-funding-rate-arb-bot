# ADR 0004: Backend Framework — Hono

- **Status:** Accepted
- **Date:** 2026-02-04
- **Owners:** -
- **Related:**
  - [ADR-0007: Infrastructure — Fly.io Deployment](0007-infrastructure-flyio.md)
  - [ADR-0008: Monitoring & Observability](0008-monitoring-observability.md)

## Context

The trading bot requires HTTP endpoints for:
- **Health checks**: Infrastructure monitoring (Fly.io health probes)
- **Metrics**: Prometheus scraping endpoint (`/metrics`)
- **Future API**: Dashboard/control plane endpoints (when building SaaS)

The bot is a **long-running worker**, not a web application. We need a lightweight HTTP framework that:
- Runs alongside the worker process
- Has minimal overhead
- Supports OpenAPI documentation (for future external APIs)
- Integrates well with Node.js ecosystem

## Decision

**Use Hono as the HTTP framework for API endpoints.**

### Why Hono

| Factor | Hono Advantage |
|--------|---------------|
| **Performance** | Fast, lightweight, edge-optimized |
| **Type Safety** | Full TypeScript inference, Hono RPC client support |
| **OpenAPI** | Built-in OpenAPI support via `@hono/zod-openapi` |
| **Minimal Dependencies** | Small bundle size, fast cold starts |
| **Ecosystem** | Works with standard Node.js HTTP servers |
| **Developer Experience** | Simple API, good documentation |

### Why Not Express/Fastify

- **Express**: More mature but heavier, less type-safe
- **Fastify**: Good performance but more opinionated, larger API surface
- **Hono**: Best balance of simplicity, performance, and type safety for our use case

### Why Not Standalone HTTP Server

While Node.js `http` module is sufficient for simple endpoints, Hono provides:
- Route organization and middleware support
- OpenAPI documentation (useful for future external APIs)
- Type-safe request/response handling
- Better developer experience for future API expansion

## Architecture

### HTTP Server Integration

The Hono app runs alongside the worker process:

```typescript
// src/server/index.ts
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { healthRouter } from "./routes/health";
import { metricsRouter } from "./routes/metrics";

const app = new Hono();

// Mount routes
app.route("/health", healthRouter);
app.route("/metrics", metricsRouter);

// Start server
const port = Number(process.env.PORT ?? 8080);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`HTTP server listening on port ${info.port}`);
});
```

### Worker + HTTP Server Pattern

```typescript
// src/index.ts
import { startWorker } from "./worker";
import { startHttpServer } from "./server";

const main = async () => {
  // Start worker (trading logic)
  const worker = await startWorker();
  
  // Start HTTP server (health/metrics)
  const server = startHttpServer();
  
  // Graceful shutdown
  process.on("SIGTERM", async () => {
    await worker.shutdown();
    await server.close();
    process.exit(0);
  });
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

## Implementation

### Health Check Routes

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

### Metrics Route (Prometheus)

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

### Future: OpenAPI Routes

For future external APIs (dashboard, control plane), use OpenAPIHono:

```typescript
// src/server/routes/api/v1/-app.ts
import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { healthRouter } from "../health";

const app = new OpenAPIHono().basePath("/api/v1");

app.route("/health", healthRouter);

// OpenAPI documentation
app.doc("/openapi.json", {
  info: {
    title: "Funding Rate Arb Bot API",
    version: "1.0.0",
  },
  openapi: "3.1.0",
});

app.get(
  "/docs",
  Scalar({
    url: "/api/v1/openapi.json",
    theme: "kepler",
  }),
);

export type AppType = typeof app;
export { app };
```

## File Structure

```
src/
├── index.ts                    # Entry point (starts worker + HTTP server)
├── worker/                     # Trading bot worker
│   ├── index.ts
│   ├── scheduler.ts
│   └── ...
├── server/                     # HTTP API server
│   ├── index.ts                # HTTP server setup
│   └── routes/
│       ├── health.ts           # Health check endpoint
│       ├── metrics.ts          # Prometheus metrics
│       └── api/                # Future: OpenAPI routes
│           └── v1/
│               ├── -app.ts     # OpenAPIHono app
│               └── routes/
│                   └── ...
└── ...
```

## Dependencies

```json
{
  "dependencies": {
    "hono": "^4.11.4",
    "@hono/node-server": "^1.12.0",
    "@hono/zod-openapi": "^0.19.10",
    "@scalar/hono-api-reference": "^0.9.34",
    "prom-client": "^15.1.0",
    "zod": "^3.24.1"
  }
}
```

## Consequences

### Positive

1. **Lightweight**: Minimal overhead on worker process
2. **Type-safe**: Full TypeScript inference, Hono RPC client support
3. **Future-proof**: Easy to add OpenAPI routes when building dashboard/API
4. **Standard HTTP**: Works with any HTTP client, monitoring tools
5. **Performance**: Fast, edge-optimized framework

### Negative

1. **Additional dependency**: One more package to maintain
2. **Learning curve**: Team needs to learn Hono patterns (minimal)

### Risks

| Risk | Mitigation |
|------|------------|
| HTTP server crashes worker | Run in try-catch, log errors, don't block worker |
| Port conflicts | Use environment variable for port, default to 8080 |
| Memory overhead | Monitor memory usage; Hono is lightweight |

## Future Considerations

1. **OpenAPI Documentation**: When building external API, use `@hono/zod-openapi` for full OpenAPI support
2. **Authentication**: Add JWT/auth middleware for protected endpoints
3. **Rate Limiting**: Add rate limiting middleware for public endpoints
4. **CORS**: Configure CORS for dashboard/control plane access

## References

- [Hono Documentation](https://hono.dev/)
- [Hono OpenAPI Guide](https://hono.dev/guides/openapi)
- [ADR-0007: Infrastructure — Fly.io Deployment](0007-infrastructure-flyio.md) — Health check requirements
- [ADR-0008: Monitoring & Observability](0008-monitoring-observability.md) — Health checks and metrics
