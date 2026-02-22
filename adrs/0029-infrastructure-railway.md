# ADR 0029: Infrastructure — Railway Deployment

- **Status:** Accepted
- **Date:** 2026-02-22
- **Owners:** -
- **Related:**
  - [ADR-0001: Bot Architecture](0001-bot-architecture.md)
  - [ADR-0002: Hexagonal-Inspired Architecture](0002-hexagonal-inspired-architecture.md)
  - [ADR-0005: Database Strategy](0005-database-strategy.md)
  - [ADR-0008: Monitoring & Observability](0008-monitoring-observability.md)
  - [ADR-0004: Backend Framework — Hono](0004-backend-framework-hono.md)
  - [ADR-0007: Infrastructure — Fly.io Deployment](0007-infrastructure-flyio.md) (Superseded by this ADR)

## Context

The funding rate arbitrage bot is a **long-running worker** that:
- Maintains WebSocket connections to exchanges
- Executes periodic REST calls (funding rates, account state, reconciliation)
- Runs 24/7 without interruption
- Must handle restarts gracefully

For deployment, we evaluated container platforms including Railway, Render, and Fly.io. We previously chose Fly.io ([ADR-0007](0007-infrastructure-flyio.md)). Fly.io no longer offers a free tier, so we switched to Railway.

### Requirements

| Requirement | Description |
|-------------|-------------|
| Always-on service | Not serverless/cron — continuous process |
| Reliable outbound networking | WebSocket + REST to exchange APIs |
| Secrets/env vars | Secure storage for API keys |
| Automatic restarts | Recover from crashes without intervention |
| Persistent storage | Orders, fills, decisions must survive restarts (Postgres) |

### Why Not Serverless/Cron

The bot is an **always-on reactor**, not a scheduled job:
- WebSocket connections require persistent processes
- 2-second evaluation ticks need continuous execution
- Position state must be monitored constantly
- Cron-style execution (start → work → exit) doesn't fit this model

## Decision

**Deploy on Railway with Railway Postgres.**

### Why Railway

| Factor | Railway Advantage |
|--------|-------------------|
| **Fast time-to-deploy** | Git push or CLI deploy; minimal config |
| **Managed Postgres** | One-click Postgres; `DATABASE_URL` auto-injected |
| **Always-on services** | Services run continuously; no cold starts for workers |
| **Secrets & env** | Dashboard and CLI; reference vars across services |
| **DX** | Simple mental model: services, env, logs |
| **Pricing** | Usage-based; no upfront commitment; suitable for personal/small bots |

### Why Not Fly.io (Current)

- Fly.io no longer has a free tier; paid from day one. That was the only reason for switching; configuration complexity was not a factor.

### Why Not Kubernetes

Kubernetes is the **wrong default for a single trading bot**. See [ADR-0007: Infrastructure — Fly.io](0007-infrastructure-flyio.md) for the full "Why Not Kubernetes" rationale (complexity, single-replica safety, stateful workload pain, failure modes, cost). The same reasoning applies when deploying on Railway.

## Architecture

### Deployment Topology

```
┌─────────────────────────────────────────────────────────────┐
│                        Railway                                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐       ┌────────────────────────────┐  │
│  │   Bot Worker     │       │   Postgres (Railway)        │  │
│  │   (Service)      │──────▶│   DATABASE_URL              │  │
│  │                  │       │   - Orders, Fills, State    │  │
│  │  - WebSocket     │       │   - Audit log               │  │
│  │  - REST polling  │       │                             │  │
│  │  - Evaluation    │       │                             │  │
│  │  - Execution     │       │                             │  │
│  └──────────────────┘       └────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
           │                              │
           ▼                              ▼
    Exchange APIs                   Alerting (Discord/Telegram)
```

### Key Components

| Component | Railway Feature | Purpose |
|-----------|-----------------|---------|
| Bot Worker | Service (always-on) | Runs the trading bot continuously |
| Database | Railway Postgres | Stores orders, fills, state, audit logs (see [ADR-0005](0005-database-strategy.md)) |
| Secrets | Railway Variables | API keys, database URL (or reference `${{Postgres.DATABASE_URL}}`) |
| Health | HTTP health endpoint | Optional; platform restarts on crash; see [ADR-0008](0008-monitoring-observability.md) |

## Implementation Details

### Dockerfile

Same as before — multi-stage Node 22 Alpine build:

```dockerfile
FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

EXPOSE 8080

CMD ["node", "dist/index.js"]
```

Railway can build from this Dockerfile or use Nixpacks with `package.json`; specify root directory and start command in the dashboard or `railway.json` if needed.

**postinstall:** The `postinstall` script runs `lefthook install` only when the build is inside a git repository. Railway (and many CI environments) build without a `.git` directory, so `lefthook install` is skipped and the install succeeds. Local clones run `lefthook install` as usual.

### Required Environment Variables

Set in Railway dashboard (or via CLI) for the bot service:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Postgres connection string (auto-set if Postgres is linked) |
| `BINANCE_API_KEY` / `BINANCE_API_SECRET` | Exchange credentials (or Coinbase/GMX as applicable) |
| `DISCORD_WEBHOOK_URL` / `TELEGRAM_*` | Alerting |
| `MIN_SPREAD_BPS`, `MAX_POSITION_USD` | Bot config |

Link the Postgres service to the bot service so `DATABASE_URL` is provided automatically.

### Health Check

The app exposes a `/health` endpoint (Hono; see [ADR-0004](0004-backend-framework-hono.md) and [ADR-0008](0008-monitoring-observability.md)). Railway does not require a health check for restarts; it restarts on process exit. Exposing `/health` is still recommended for monitoring and optional Railway health checks if configured.

### Database Setup

- In Railway: create a **Postgres** service from the template.
- Link it to the bot service so `DATABASE_URL` is available.
- Schema and migrations: see [ADR-0005: Database Strategy](0005-database-strategy.md).

## Restart Safety (Critical)

**The bot MUST be restart-safe.** Railway may restart the service for:
- Deployments
- Crashes / OOM
- Platform maintenance

Startup reconciliation and graceful shutdown (SIGTERM) are unchanged from [ADR-0007](0007-infrastructure-flyio.md): reconcile state on every startup, pause if position is open and state is uncertain, and drain in-flight work on shutdown.

## Deployment Commands

### Initial Setup

1. Create a Railway project (dashboard or `railway init`).
2. Add **Postgres** from the template; note it exposes `DATABASE_URL`.
3. Add a **Service** for the bot: connect repo or use `railway up` with the Dockerfile.
4. Link Postgres to the bot service (so `DATABASE_URL` is set).
5. Set other variables (API keys, alerting, bot config) in the service Variables tab or via CLI:

```bash
railway variables set BINANCE_API_KEY="..." BINANCE_API_SECRET="..."
railway variables set DISCORD_WEBHOOK_URL="..."
```

### Operations

```bash
# Deploy (from repo or local build)
railway up

# Logs
railway logs

# Shell (if enabled)
railway run bash
```

Postgres: use Railway’s Postgres connection details (host, port, user, password) or the provided proxy for `psql`/migrations.

## Consequences

### Positive

1. **Simple operations**: No `fly.toml` or region config; dashboard and CLI are straightforward.
2. **Managed Postgres**: One-click Postgres with `DATABASE_URL` and linking.
3. **Always-on**: Services run continuously; no cold starts for the worker.
4. **Restart safety**: Same reconciliation and graceful shutdown as before.
5. **Single replica**: One bot service; no double-trading from multiple replicas.
6. **Focus on trading logic**: Less time on infra, more on risk and reconciliation.

### Negative

1. **Less infra control** than Fly.io (e.g. no VM-like tuning, no multi-region in config).
2. **Vendor lock-in**: Railway-specific variables and linking; migration to another platform would require reconfig.

### Risks

| Risk | Mitigation |
|------|------------|
| Restart during position | Reconciliation on startup; pause if uncertain |
| Database connection lost | Retry with backoff; alert on persistent failure |
| Exchange API outage | Circuit breakers; no new entries; alert |
| Railway outage | Monitor status page; consider backup region or migration path later |

## References

- [Railway Docs — Build & Deploy](https://docs.railway.com/build-deploy)
- [Railway Postgres](https://docs.railway.com/databases/postgresql)
- [ADR-0007: Infrastructure — Fly.io](0007-infrastructure-flyio.md) — Superseded by this ADR; retains "Why Not Kubernetes" and restart-safety rationale
- [ADR-0005: Database Strategy](0005-database-strategy.md)
- [ADR-0008: Monitoring & Observability](0008-monitoring-observability.md)
- [ADR-0004: Backend Framework — Hono](0004-backend-framework-hono.md)
