# ADR 0004: Backend Framework — Hono

- **Status:** Accepted
- **Date:** 2026-02-04
- **Updated:** 2026-03-04
- **Owners:** -
- **Related:**
  - [ADR-0029: Infrastructure — Railway Deployment](0029-infrastructure-railway.md)
  - [ADR-0008: Monitoring & Observability](0008-monitoring-observability.md)

## Context

The trading bot requires HTTP endpoints for:
- **Health checks**: Infrastructure monitoring (Railway / platform health probes)
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

The Hono app runs alongside the worker: create a Hono instance, mount routes (e.g. `/health`, `/metrics`), and serve with `@hono/node-server` (or equivalent) on the configured port. See `server/` in source.

### Worker + HTTP Server Pattern

Start the worker and HTTP server together; on SIGTERM, shut down the worker and close the server. See entry point in source.

## Implementation

### Health Check Routes

Expose a `/health` route that returns 200 or 503 based on worker/health state. Response shape is implementation-defined. See [ADR-0008](0008-monitoring-observability.md) and `server/routes/health/` in source.

### Metrics Route (Prometheus)

Expose a `/metrics` route that returns Prometheus text format. See ADR-0008 and `server/routes/metrics/` in source.

### Future: OpenAPI Routes

For future external APIs (dashboard, control plane), use OpenAPIHono with `@hono/zod-openapi` and optional API reference (e.g. Scalar). See Hono OpenAPI docs and source when implemented.

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

Hono and `@hono/node-server` are required; OpenAPI and metrics libraries are optional. See `package.json` for current versions.

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
- [ADR-0029: Infrastructure — Railway Deployment](0029-infrastructure-railway.md) — Health check requirements
- [ADR-0008: Monitoring & Observability](0008-monitoring-observability.md) — Health checks and metrics
