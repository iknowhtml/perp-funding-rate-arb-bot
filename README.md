# Funding Rate Arbitrage Bot

A funding rate arbitrage bot that captures yield from perpetual futures funding rate differentials while maintaining delta-neutral exposure.

## Status

**Phase 3: Core Logic** — 17/27 plans implemented

- ✅ **Phase 1: Foundation** (8/8 complete) — Infrastructure, database, logging, scheduler, queue, HTTP server
- ✅ **Phase 2: Connectivity** (6/6 complete) — Exchange adapters, rate limiting, WebSocket management, data plane
- 🚧 **Phase 3: Core Logic** (3/7 complete) — State machines, position derivation, risk engine implemented; strategy engine, execution engine, reconciler, evaluation loop pending
- ⏳ **Phase 4: Simulation** (0/5) — Paper trading adapter exists; backtesting framework pending
- ⏳ **Phase 5: Live Testing** (0/4) — Not started
- ⏳ **Phase 6: Production** (0/3) — Not started

## How It Works

Perpetual futures contracts use **funding rates** to keep contract prices anchored to spot prices. When funding is positive, longs pay shorts. When negative, shorts pay longs.

This bot captures funding yield by:

1. **Shorting the perpetual** (receiving funding payments)
2. **Buying spot** (hedging directional risk)
3. **Maintaining delta neutrality** (earning yield regardless of price direction)

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
│  ✅ IMPLEMENTED │  │  🚧 PARTIAL     │  │  ⏳ PENDING    │
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
- State machines (hedge and order lifecycle)
- Serial execution queue

**Pending components:**
- Strategy engine (entry/exit signal generation)
- Execution engine (order placement logic)
- Evaluation loop (main decision pipeline)
- Full reconciler integration

See [`adrs/`](adrs/) for detailed architecture decisions.

## Tech Stack

| Category | Technology | Purpose |
|----------|-----------|---------|
| **Runtime** | TypeScript 5.7, Node.js 22 | Type-safe JavaScript runtime |
| **Framework** | Hono 4.11 | Lightweight HTTP server |
| **Database** | PostgreSQL, Drizzle ORM 0.45 | Schema-first migrations, type-safe queries |
| **Validation** | Valibot 1.0 | Runtime schema validation |
| **Exchange SDK** | Coinbase Advanced Trade SDK | Official Coinbase integration |
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

See [Configuration](#configuration) for all available environment variables.

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

**Database connection:**
- Host: `localhost`
- Port: `5433`
- User: `postgres`
- Password: `postgres`
- Database: `funding_rate_arb`

## Configuration

All configuration is via environment variables. See `.env.example` for the complete template.

### Database

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Yes | - |

### Exchange

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `EXCHANGE_API_KEY` | Generic exchange API key | No | - |
| `EXCHANGE_API_SECRET` | Generic exchange API secret | No | - |
| `COINBASE_API_KEY` | Coinbase CDP API key | No | - |
| `COINBASE_API_SECRET` | Coinbase CDP API secret | No | - |
| `TRADING_PAIR` | Trading pair (e.g., BTC-USDT) | No | `BTC-USDT` |

### Trading Parameters

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `MIN_FUNDING_RATE_BPS` | Minimum funding rate threshold (basis points, e.g., 10 = 0.10%) | No | `10` |
| `MAX_POSITION_SIZE_USD` | Maximum position size in USD | No | `10000` |
| `MAX_LEVERAGE_BPS` | Maximum leverage (basis points, e.g., 30000 = 3x) | No | `30000` |
| `MAX_SLIPPAGE_BPS` | Maximum slippage tolerance (basis points, e.g., 50 = 0.50%) | No | `50` |

### Risk Management

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `STOP_LOSS_PERCENT` | Stop loss percentage (e.g., 5 = 5%) | No | `5` |
| `TAKE_PROFIT_PERCENT` | Take profit percentage (e.g., 10 = 10%) | No | `10` |

### Operational

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `PORT` | HTTP server port | No | `3000` |
| `NODE_ENV` | Node environment (development, production, test) | Yes | - |
| `DRY_RUN` | Dry run mode (true = no real trades) | No | `true` |
| `LOG_LEVEL` | Log level (debug, info, warn, error) | No | `debug` |
| `EVAL_TICK_MS` | Evaluation tick interval in milliseconds | No | `2000` |
| `FUNDING_REFRESH_MS` | Funding rate refresh interval in milliseconds | No | `30000` |
| `ACCOUNT_REFRESH_MS` | Account refresh interval in milliseconds | No | `30000` |

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
├── index.ts                    # Application entry point
├── adapters/                   # Exchange adapter implementations
│   ├── types.ts               # ExchangeAdapter interface and domain types
│   ├── errors.ts              # ExchangeError class and error codes
│   ├── config.ts              # Adapter configuration
│   ├── factory.ts             # Factory for creating exchange adapters
│   ├── coinbase/              # Coinbase Advanced Trade adapter
│   │   ├── adapter.ts         # SDK wrapper with rate limiting
│   │   ├── normalizers.ts     # SDK → domain type converters
│   │   ├── schemas.ts         # Valibot schemas for API responses
│   │   └── rate-limits.ts     # Coinbase-specific rate limits
│   └── paper/                 # Paper trading adapter (for testing)
│       └── adapter.ts
├── domains/                    # Domain logic
│   ├── position/              # Position derivation and metrics
│   │   ├── derive.ts          # Derive position from orders/fills
│   │   ├── metrics.ts         # Position metrics (PnL, delta, etc.)
│   │   └── reconcile.ts       # Position reconciliation
│   ├── risk/                  # Risk evaluation engine
│   │   ├── evaluate.ts        # Risk evaluation logic
│   │   ├── position-sizing.ts  # Position sizing calculations
│   │   └── emergency.ts       # Emergency exit logic
│   └── state/                 # State machines
│       ├── hedge-state.ts     # Hedge state machine
│       ├── order-state.ts     # Order state machine
│       └── persistence.ts     # State persistence
├── lib/
│   ├── config.ts              # Application configuration
│   ├── env/                   # Environment variable validation
│   │   ├── env.ts             # Valibot schema and parsing
│   │   └── schema.ts          # Environment schema definition
│   ├── logger/                # Structured logging
│   │   └── logger.ts          # JSON/pretty logging with levels
│   ├── db/                    # Database layer (Drizzle ORM)
│   │   ├── schema.ts          # Table definitions
│   │   ├── client.ts          # Database connection
│   │   ├── ports/             # Repository interfaces
│   │   └── adapters/          # Repository implementations
│   └── rate-limiter/          # Rate limiting infrastructure
│       ├── token-bucket.ts    # Token bucket implementation
│       ├── circuit-breaker.ts # Circuit breaker (cockatiel wrapper)
│       ├── backoff.ts         # Exponential backoff with jitter
│       ├── request-policy.ts  # Unified rate limit + retry wrapper
│       └── exchanges.ts       # Exchange-specific configurations
├── server/                    # HTTP server (Hono)
│   ├── index.ts               # Server setup and middleware
│   └── routes/
│       ├── health.ts          # Health check endpoint
│       └── metrics.ts         # Prometheus metrics endpoint
└── worker/                    # Background worker processes
    ├── scheduler.ts           # Interval-based task scheduler
    ├── queue.ts               # Serial execution queue (p-queue)
    ├── data-plane.ts          # Data plane (WebSocket + REST)
    ├── state.ts               # In-memory state store
    ├── freshness.ts           # State freshness checks
    ├── start-worker.ts        # Worker startup
    └── websocket/             # WebSocket management
        ├── websocket.ts       # Connection manager with reconnection
        ├── message-queue.ts   # Bounded inbound message queue
        ├── message-parser.ts  # Validation and de-duplication
        └── health-monitor.ts  # Per-stream health monitoring
```

## Architecture Decisions

<details>
<summary>View all 18 Architecture Decision Records (ADRs)</summary>

| ADR | Title | Status |
|-----|-------|--------|
| [0001](adrs/0001-bot-architecture.md) | Bot Architecture | Accepted |
| [0002](adrs/0002-hexagonal-inspired-architecture.md) | Hexagonal-Inspired Architecture | Accepted |
| [0003](adrs/0003-validation-strategy.md) | Validation Strategy | Accepted |
| [0004](adrs/0004-backend-framework-hono.md) | Backend Framework — Hono | Accepted |
| [0005](adrs/0005-database-strategy.md) | Database Strategy | Accepted |
| [0006](adrs/0006-drizzle-orm.md) | Drizzle ORM | Accepted |
| [0007](adrs/0007-infrastructure-flyio.md) | Infrastructure — Fly.io | Accepted |
| [0008](adrs/0008-monitoring-observability.md) | Monitoring & Observability | Accepted |
| [0009](adrs/0009-dev-tooling.md) | Development Tooling | Accepted |
| [0010](adrs/0010-exchange-adapters.md) | Exchange Adapters | Accepted |
| [0011](adrs/0011-exchange-rate-limiting.md) | Exchange Rate Limiting | Accepted |
| [0012](adrs/0012-state-machines.md) | State Machines | Accepted |
| [0013](adrs/0013-risk-management.md) | Risk Management Engine | Accepted |
| [0014](adrs/0014-funding-rate-strategy.md) | Funding Rate Prediction & Strategy | Accepted |
| [0015](adrs/0015-execution-safety-slippage.md) | Execution Safety & Slippage Modeling | Accepted |
| [0016](adrs/0016-backtesting-simulation.md) | Backtesting & Simulation Framework | Accepted |
| [0017](adrs/0017-task-scheduler.md) | Task Scheduler Implementation | Accepted |
| [0018](adrs/0018-serial-execution-queue.md) | Serial Execution Queue | Accepted |

</details>

## License

Private — All rights reserved
