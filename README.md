# Funding Rate Arbitrage Bot

A funding rate arbitrage bot that captures yield from perpetual futures funding rate differentials while maintaining delta-neutral exposure.

## Status

- **CEX foundation (Phases 1–3)** — Complete: infrastructure, adapters, core logic, evaluation loop. Reused by GMX pivot.
- **CEX Phases 4–6** — Superseded by GMX Pivot roadmap.
- **GMX Pivot Phase 0** — Complete: chain infra (viem), data collector, impact sampler.
- **GMX Pivot Phases 1–2** — Pending: MVP execution, optimization.

## How It Works

Perpetual futures contracts use **funding rates** to keep contract prices anchored to spot prices. When funding is positive, longs pay shorts. When negative, shorts pay longs.

This bot captures funding yield by:

1. **Shorting the perpetual** (receiving funding payments)
2. **Buying spot** (hedging directional risk)
3. **Maintaining delta neutrality** (earning yield regardless of price direction)

**Current direction:** GMX v2 on-chain perps on Arbitrum — regime-based entry/exit using 4h moving average funding rate, with GM token yield as part of the hedge model. CEX foundation (Coinbase) remains implemented for reference.

### Design Principles

- **Safety first** — Risk management takes priority over yield optimization
- **Reliability** — Handle exchange API failures, WebSocket disconnects, and edge cases gracefully
- **Determinism** — Given the same state, produce the same decisions
- **Observability** — Comprehensive logging and metrics for debugging and audit trails

## Architecture

The bot uses a single-process, event-driven architecture with in-memory state:

```
┌─────────────────────────────────────────────────────────┐
│                    IN-MEMORY STATE                       │
│  prices | funding | account | health | derived position │
│                    ✅ IMPLEMENTED                         │
└─────────────────────────────────────────────────────────┘
        ▲                    ▲                    │
        │                    │                    ▼
┌───────┴────────┐  ┌────────┴────────┐  ┌───────────────┐
│  DATA PLANE    │  │   RECONCILER    │  │ DECISION LOOP │
│  (WS + REST)   │  │   (REST poll)   │  │  (evaluate)   │
│  ✅ IMPLEMENTED │  │  ✅ IMPLEMENTED  │  │  ✅ IMPLEMENTED │
└────────────────┘  └─────────────────┘  └───────┬───────┘
                                                 │
                                                 ▼
                                    ┌────────────────────┐
                                    │  EXECUTION QUEUE   │
                                    │  (serial, 1 job)   │
                                    │  ✅ IMPLEMENTED     │
                                    └────────────────────┘
```

**Implemented components:**
- Data plane (WebSocket + REST) with health monitoring
- In-memory state store with position derivation
- Risk evaluation engine
- Strategy engine (entry/exit signal generation)
- State machines (hedge and order lifecycle)
- Execution engine (enter/exit hedge, fill confirmation, slippage validation)
- Reconciler (periodic reconciliation with exchange)
- Evaluation loop (health → risk → strategy → execution queue, 2s tick)
- Serial execution queue
- Startup sequence (initial reconciliation before evaluation)

**GMX data pipeline:** `lib/chain/` (Arbitrum RPC via viem), `adapters/gmx/` (market data reader), `worker/data-collector.ts` (market snapshots → DB), `worker/impact-sampler.ts` (execution estimates). Tables: `market_snapshot`, `execution_estimate`.

See [`adrs/`](adrs/) for detailed architecture decisions.

## Tech Stack

| Category | Technology | Purpose |
|----------|-----------|---------|
| **Runtime** | TypeScript 5.7, Node.js 22 | Type-safe JavaScript runtime |
| **Framework** | Hono 4.11 | Lightweight HTTP server |
| **Database** | PostgreSQL, Drizzle ORM 0.45 | Schema-first migrations, type-safe queries |
| **Validation** | Valibot 1.0 | Runtime schema validation |
| **Exchange SDK** | Coinbase Advanced Trade SDK | Official Coinbase integration |
| **Chain** | viem 2.45, @gmx-io/sdk 1.5 | Arbitrum RPC, GMX v2 contract ABIs |
| **Resilience** | Cockatiel 3.2, p-queue 9.1 | Circuit breaker, retry logic, serial execution |
| **Testing** | Vitest 2.1 | Unit and integration tests |
| **Linting** | Biome 1.9 | Fast linting and formatting |
| **WebSocket** | ws 8.19 | WebSocket client with reconnection |

## Quick Start

### Prerequisites

- macOS (setup script is macOS-specific)
- [Homebrew](https://brew.sh/) (will be installed if missing)
- Docker and Docker Compose

### Setup

Run the setup script to install all dependencies:

```bash
./scripts/setup.sh
```

This will:
1. Check for Docker installation
2. Install [fnm](https://github.com/Schniz/fnm) (Fast Node Manager)
3. Install Node.js 22
4. Enable [Corepack](https://nodejs.org/api/corepack.html) (manages pnpm version)
5. Install [Lefthook](https://github.com/evilmartians/lefthook) (Git hooks)
6. Install [Gitleaks](https://github.com/gitleaks/gitleaks) (secret scanning)
7. Install project dependencies via pnpm
8. Start PostgreSQL via Docker Compose
9. Set up Git hooks
10. Create `.env` from `.env.example`

### Configuration

Copy `.env.example` to `.env` and configure your settings:

```bash
cp .env.example .env
```

See [Configuration](#configuration) for environment variable categories.

### Database

The setup script starts PostgreSQL automatically. Database commands:

```bash
# Start Postgres
pnpm db:up

# Stop Postgres
pnpm db:down

# View Postgres logs
pnpm db:logs

# Generate migration from schema changes
pnpm db:generate

# Apply pending migrations
pnpm db:migrate

# Push schema directly (dev only)
pnpm db:push

# Open Drizzle Studio (database GUI)
pnpm db:studio
```

Tables: `orders`, `market_snapshot` (GMX market data), `execution_estimate` (GMX execution impact). Connection details in `.env.example` and `docker-compose.yml`.

## Configuration

All configuration is via environment variables. See `.env.example` for the complete template with descriptions and defaults.

Categories: **Database**, **Exchange** (Coinbase), **Arbitrum/GMX** (chain RPC, wallet, GMX oracle), **Trading Parameters**, **Risk Management**, **Operational Settings**.

## Development

```bash
# Start development server (with watch)
pnpm dev

# Run linting
pnpm lint

# Fix linting issues
pnpm lint:fix

# Format code
pnpm format

# Type check
pnpm typecheck

# Run tests (watch mode)
pnpm test

# Run tests once
pnpm test:run

# Run tests with coverage
pnpm test:coverage

# Build for production
pnpm build

# Run production build
pnpm start
```

The bot runs an HTTP server alongside the worker process for monitoring:

- **`GET /`** — API information
- **`GET /health`** — Health check endpoint (returns 200 when healthy, 503 when unhealthy)
- **`GET /metrics`** — Prometheus-formatted metrics endpoint

See [ADR-0004: Backend Framework — Hono](adrs/0004-backend-framework-hono.md) and [ADR-0008: Monitoring & Observability](adrs/0008-monitoring-observability.md) for details.

## Project Structure

```
src/
  adapters/     Exchange adapters (Coinbase, GMX, Paper) and shared types
  domains/      Domain logic (position, risk, strategy, state machines)
  lib/          Shared infra (config, db, env, logger, rate-limiter, chain)
  server/       HTTP server (Hono) — health, metrics
  worker/       Background processes (data plane, evaluator, execution,
                reconciler, WebSocket, GMX data collector)
```

## Architecture Decisions

See [`adrs/`](adrs/) for all 27 Architecture Decision Records. Key decisions include bot architecture, exchange adapters, state machines, risk management, and the on-chain GMX v2 pivot (ADRs 0019–0022).

## License

Private — All rights reserved
