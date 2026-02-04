# ADR 0007: Infrastructure — Fly.io Deployment

- **Status:** Accepted
- **Date:** 2026-02-04
- **Owners:** -
- **Related:**
  - [ADR-0001: Bot Architecture](0001-bot-architecture.md)
  - [ADR-0002: Hexagonal-Inspired Architecture](0002-hexagonal-inspired-architecture.md)
  - [ADR-0005: Database Strategy](0005-database-strategy.md)
  - [ADR-0008: Monitoring & Observability](0008-monitoring-observability.md)
  - [ADR-0004: Backend Framework — Hono](0004-backend-framework-hono.md)

## Context

The funding rate arbitrage bot is a **long-running worker** that:
- Maintains WebSocket connections to exchanges
- Executes periodic REST calls (funding rates, account state, reconciliation)
- Runs 24/7 without interruption
- Must handle restarts gracefully

For deployment, we evaluated three container platforms:
- **Railway**: Fast time-to-deploy, good DX, but less infrastructure control
- **Render**: Clear worker model, predictable restarts, simpler operations
- **Fly.io**: VM-like primitives, persistent volumes, managed Postgres, more control

### Requirements

| Requirement | Description |
|-------------|-------------|
| Always-on service | Not serverless/cron — continuous process |
| Reliable outbound networking | WebSocket + REST to exchange APIs |
| Secrets/env vars | Secure storage for API keys |
| Automatic restarts | Recover from crashes without intervention |
| Persistent storage | Orders, fills, decisions must survive restarts |

### Why Not Serverless/Cron

The bot is an **always-on reactor**, not a scheduled job:
- WebSocket connections require persistent processes
- 2-second evaluation ticks need continuous execution
- Position state must be monitored constantly
- Cron-style execution (start → work → exit) doesn't fit this model

## Decision

**Deploy on Fly.io Machines with Managed Postgres.**

### Why Fly.io

| Factor | Fly.io Advantage |
|--------|------------------|
| **Infrastructure control** | VM-like primitives without full Kubernetes complexity |
| **Persistent volumes** | Attach volumes for local state/logs if needed |
| **Managed Postgres** | Fully managed with backups and HA |
| **Always-on services** | First-class support for long-running workers |
| **Global edge** | Deploy close to exchange servers for lower latency |
| **Scaling path** | Grows from personal bot to multi-service system |

### Why Not Railway or Render

Both are viable, but Fly.io offers:
- More operational control for a trading system
- Better long-term scaling path
- Managed Postgres with HA and backups (critical for trading ledger)
- Fewer platform quirks for "runs forever" workloads

### Why Not Kubernetes

Kubernetes isn't "bad" — it's the **wrong default for a single trading bot**, especially early. For a personal bot, Kubernetes adds operational complexity without providing benefits.

#### 1. No Need for Horizontal Scaling

A funding arb bot is:
- A couple WebSocket connections
- Periodic REST calls
- One execution worker
- Some state

It's not a stateless web app you scale to 50 replicas. In fact, **multiple replicas are dangerous** unless you implement leader election and strict locking (or you'll double-trade).

#### 2. Operational Complexity Goes Way Up

With Kubernetes, you inherit:
- Cluster lifecycle (upgrades, nodes, networking, CNI)
- Secrets management (Secrets, External Secrets Operator)
- Ingress + TLS (if exposing dashboards)
- Persistent volumes (DB, logs) — PV/PVC management
- Pod evictions / rescheduling edge cases
- Debugging distributed issues

For a single bot, Docker + systemd (or Fly.io Machines) gives you 99% of the reliability with 10% of the effort.

#### 3. Stateful Workloads Are Extra Pain

If you use Postgres, Redis, or local state (SQLite, cache, reconciliation journals), you're now managing:
- StatefulSets
- PV/PVC management
- Backups/snapshots
- Anti-affinity rules
- Storage class quirks

Totally doable — just not free.

#### 4. Failure Modes Get Weirder

A bot needs predictable behavior. Kubernetes introduces:
- Sudden restarts due to probes
- OOM kills
- Node drains
- "Pod moved" events
- Clock drift between nodes

For trading, "it restarted at the wrong time" can cost money. You can engineer around this, but again: more complexity.

#### 5. Cost and Attention Tax

If you aren't already running Kubernetes daily, it's a tax:
- More time learning and maintaining
- More tooling (kubectl, Helm, operators)
- More monitoring (Prometheus, Grafana, alerting)

At $50K–$300K capital, your edge is better spent on:
- Risk controls
- Reconciliation
- Exchange adapter correctness
- Alerting
- Testing exit paths

#### When Kubernetes Does Make Sense

Consider Kubernetes if one of these is true:

✅ **You're turning this into a product (multi-tenant)**
- Many users
- Many bots
- Per-user isolation
- Autoscaling worker pools
- Centralized observability

✅ **You already have a cluster and SRE muscle**
- It's not "new work"
- You can treat it as standard deployment

✅ **You need strong isolation boundaries**
- Separate namespaces per strategy/customer
- Network policies
- Controlled egress
- Secret rotation pipelines

✅ **You're running multiple services**
- Scanners
- Execution workers
- Dashboards
- Alerting
- Data pipelines

At that point, Kubernetes can be a net win.

#### If You Still Want Kubernetes: The Safe Pattern

Single active trader, many passive components:
- Scanner deployments (can scale)
- Executor as **one replica only**
- Leader election or DB lock to enforce single-writer
- Postgres as managed service (don't run your own in-cluster unless you must)
- Use CronJob for periodic tasks
- Use NetworkPolicy + egress allowlist
- Use HPA only for stateless scanners

**Key: Never let Kubernetes autoscale the executor.**

## Architecture

### Deployment Topology

```
┌─────────────────────────────────────────────────────────────┐
│                        Fly.io                                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐       ┌────────────────────────────┐  │
│  │   Bot Worker     │       │   Managed Postgres         │  │
│  │   (Machine)      │──────▶│   (Primary + HA Replica)   │  │
│  │                  │       │                            │  │
│  │  - WebSocket     │       │  - Orders table            │  │
│  │  - REST polling  │       │  - Fills table             │  │
│  │  - Evaluation    │       │  - State snapshots         │  │
│  │  - Execution     │       │  - Audit log               │  │
│  └──────────────────┘       └────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
           │                              │
           ▼                              ▼
    Exchange APIs                   Alerting (Discord/Telegram)
    (Binance, Bybit)
```

### Key Components

| Component | Fly.io Feature | Purpose |
|-----------|----------------|---------|
| Bot Worker | Machine (always-on) | Runs the trading bot continuously |
| Database | Managed Postgres | Stores orders, fills, state, audit logs (see [ADR-0005](0005-database-strategy.md)) |
| Secrets | Fly Secrets | API keys, database credentials |
| Health Checks | HTTP/TCP checks | Restart on unresponsive process (see [ADR-0008](0008-monitoring-observability.md)) |

## Implementation Details

### Dockerfile

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

# Health check endpoint
EXPOSE 8080

CMD ["node", "dist/index.js"]
```

### fly.toml Configuration

```toml
app = "funding-rate-arb-bot"
primary_region = "sjc"  # Close to exchange servers

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"
  LOG_LEVEL = "info"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = false  # Never stop — always-on worker
  auto_start_machines = true
  min_machines_running = 1    # Always keep one running

  [http_service.concurrency]
    type = "connections"
    hard_limit = 25
    soft_limit = 20

[[vm]]
  memory = "512mb"
  cpu_kind = "shared"
  cpus = 1

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

### Required Environment Variables

Set via `fly secrets set`:

```bash
# Exchange credentials
fly secrets set BINANCE_API_KEY="..." BINANCE_API_SECRET="..."

# Database (auto-populated if using fly postgres attach)
fly secrets set DATABASE_URL="postgres://..."

# Alerting
fly secrets set DISCORD_WEBHOOK_URL="..."
fly secrets set TELEGRAM_BOT_TOKEN="..."
fly secrets set TELEGRAM_CHAT_ID="..."

# Bot configuration
fly secrets set MIN_SPREAD_BPS="30"
fly secrets set MAX_POSITION_USD="10000"
```

### Health Check Configuration

Fly.io uses the health endpoint (configured in `fly.toml`) to restart unhealthy containers. The health endpoint is implemented using Hono (see [ADR-0004: Backend Framework — Hono](0004-backend-framework-hono.md)) and detailed in [ADR-0008: Monitoring & Observability](0008-monitoring-observability.md).

### Database Setup

Fly.io Managed Postgres provides HA, backups, and automatic failover. See [ADR-0005: Database Strategy](0005-database-strategy.md) for schema and database design decisions.

## Restart Safety (Critical)

**The bot MUST be restart-safe.** Fly.io may restart the container for:
- Deployments
- Host maintenance
- Crash recovery
- Scaling events

### Startup Reconciliation Flow

```typescript
// src/worker/startup.ts

/**
 * Reconcile state on every startup.
 * Assumes container may have restarted at any time.
 *
 * @see {@link ../adrs/0007-infrastructure-flyio.md ADR-0007}
 */
export const startup = async (deps: Dependencies): Promise<void> => {
  const { exchange, stateRepo, alertService, logger } = deps;

  logger.info("Starting bot — reconciling state");

  // 1. Fetch truth from exchange (REST)
  const [balances, positions, openOrders, recentFills] = await Promise.all([
    exchange.getBalances(),
    exchange.getPositions(),
    exchange.getOpenOrders(),
    exchange.getRecentFills({ since: hoursAgo(24) }),
  ]);

  // 2. Load last known state from DB
  const lastSnapshot = await stateRepo.getLatestSnapshot();

  // 3. Derive current position state
  const currentPosition = derivePosition(positions, openOrders);

  // 4. Check for inconsistencies
  const inconsistencies = findInconsistencies(lastSnapshot, {
    balances,
    positions,
    openOrders,
    recentFills,
  });

  if (inconsistencies.length > 0) {
    logger.warn("State inconsistencies detected", { inconsistencies });
    await alertService.send({
      type: "STARTUP_INCONSISTENCY",
      data: inconsistencies,
    });
  }

  // 5. If position open and state uncertain → PAUSE
  if (currentPosition.open && inconsistencies.length > 0) {
    logger.warn("Position open with uncertain state — pausing entries");
    return startInPausedMode(deps, currentPosition);
  }

  // 6. Save reconciled state
  await stateRepo.saveSnapshot({
    balances,
    positions,
    openOrders,
    reconciledAt: new Date(),
  });

  // 7. Start normal operation
  logger.info("Reconciliation complete — starting normal operation");
  return startNormalMode(deps, currentPosition);
};
```

### Graceful Shutdown

Handle SIGTERM for clean shutdown:

```typescript
// src/worker/shutdown.ts

export const setupGracefulShutdown = (deps: Dependencies) => {
  const { executionQueue, wsClient, healthServer, logger } = deps;

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal} — initiating graceful shutdown`);

    // 1. Stop accepting new work
    executionQueue.pause();

    // 2. Wait for in-flight execution to complete (with timeout)
    await executionQueue.drain(30_000);

    // 3. Close WebSocket connections
    await wsClient.close();

    // 4. Close health server
    healthServer.close();

    // 5. Log final state
    logger.info("Graceful shutdown complete");
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};
```

## Deployment Commands

### Initial Setup

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Create app
fly apps create funding-rate-arb-bot

# Create Postgres cluster
fly postgres create --name funding-rate-arb-db --region sjc

# Attach database (auto-sets DATABASE_URL secret)
fly postgres attach funding-rate-arb-db --app funding-rate-arb-bot

# Set secrets
fly secrets set BINANCE_API_KEY="..." BINANCE_API_SECRET="..."

# Deploy
fly deploy
```

### Operations

```bash
# View logs
fly logs

# SSH into machine
fly ssh console

# Connect to Postgres
fly postgres connect -a funding-rate-arb-db

# Scale memory
fly scale memory 1024

# View status
fly status

# Restart (triggers reconciliation)
fly apps restart funding-rate-arb-bot
```

## Monitoring

Fly.io provides built-in infrastructure metrics:
- CPU/memory usage
- Network I/O
- Health check status
- Restart count

For application-level monitoring (metrics, alerting, logging), see [ADR-0008: Monitoring & Observability](0008-monitoring-observability.md).

## Consequences

### Positive

1. **Always-on support**: Fly.io Machines run continuously without cold starts
2. **Managed Postgres**: HA, backups, and failover handled by platform
3. **Restart safety**: Reconciliation flow handles any restart scenario
4. **Operational simplicity**: VM-like primitives without Kubernetes complexity — no cluster management, StatefulSets, PV/PVC, or pod eviction edge cases
5. **Single replica safety**: No risk of double-trading from multiple replicas (Kubernetes would require leader election)
6. **Predictable behavior**: Fewer failure modes than Kubernetes (no OOM kills, node drains, clock drift)
7. **Focus on trading logic**: Time spent on infrastructure is minimal, allowing focus on risk controls, reconciliation, and exchange adapter correctness
8. **Scaling path**: Can add more services (dashboard, API) on same platform without Kubernetes overhead

### Negative

1. **More operational overhead** than Railway/Render (more knobs to configure)
2. **Learning curve**: Fly.io concepts (Machines, Volumes, Postgres clusters)
3. **Cost**: Managed Postgres adds baseline cost (~$7/mo for HA)

### Risks

| Risk | Mitigation |
|------|------------|
| Container restart during position | Reconciliation on startup; pause if uncertain |
| Database connection lost | Retry with exponential backoff; alert on persistent failure |
| Exchange API outage | Circuit breakers; no new entries; alert |
| Fly.io region outage | Consider multi-region in future; manual failover for now |

## Future Considerations

1. **Multi-region deployment**: Deploy to region closest to exchange servers
2. **Replica for dashboard**: Add read replica for analytics/dashboard
3. **Volume backup**: Consider volume for local WAL caching
4. **Dedicated CPU**: Upgrade to dedicated CPU if latency-sensitive
5. **Kubernetes migration**: Consider migrating to Kubernetes only when:
   - Turning into a multi-tenant SaaS product
   - Running multiple bots/services (scanners, executors, dashboards)
   - Already have Kubernetes expertise and infrastructure
   - Need strong isolation boundaries (namespaces, network policies)

**Migration path**: Start with Docker Compose on a VPS or single cloud VM. Add health checks, auto-restart, alerts, and log shipping. Move to Kubernetes only when you have multiple bots/services, paying users, or a team.

## References

- [Fly.io Machines Documentation](https://fly.io/docs/machines/)
- [Fly.io Managed Postgres](https://fly.io/docs/postgres/)
- [Fly.io Health Checks](https://fly.io/docs/reference/configuration/#services-http_checks)
- [ADR-0001: Bot Architecture](0001-bot-architecture.md) — Worker loop and restart handling
- [ADR-0005: Database Strategy](0005-database-strategy.md) — Postgres schema and database decisions
- [ADR-0008: Monitoring & Observability](0008-monitoring-observability.md) — Health checks, metrics, and alerting
- [ADR-0004: Backend Framework — Hono](0004-backend-framework-hono.md) — HTTP server implementation
