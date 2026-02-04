# Funding Rate Arbitrage Bot

A funding rate arbitrage bot that captures yield from perpetual futures funding rate differentials while maintaining delta-neutral exposure.

## Purpose

Perpetual futures contracts on crypto exchanges use **funding rates** to keep the contract price anchored to the spot price. When funding is positive, longs pay shorts. When negative, shorts pay longs.

This bot exploits high positive funding rates by:
1. **Shorting the perpetual** (receiving funding payments)
2. **Buying spot** (hedging directional risk)

The result is a **delta-neutral position** that earns yield from funding payments regardless of price direction.

## Goals

### Primary
- **Capture funding yield** — Systematically enter positions when funding rates exceed a threshold
- **Maintain delta neutrality** — Hedge spot exposure to eliminate directional risk
- **Preserve capital** — Risk management takes priority over yield optimization

### Operational
- **Reliability** — Handle exchange API failures, WebSocket disconnects, and edge cases gracefully
- **Safety** — Prevent double-trading, enforce position limits, and exit on uncertainty
- **Observability** — Comprehensive logging for debugging and audit trails
- **Determinism** — Given the same state, produce the same decisions

### Non-Goals (MVP)
- Multi-exchange arbitrage (single exchange for now)
- Sub-second execution (2s evaluation tick is sufficient)
- Complex position management (single position at a time)

## Implementation Status

### Phase 1: Foundation ✅ Complete

| Feature | Description | Status |
|---------|-------------|--------|
| Local Dev Setup | Docker Compose for PostgreSQL | ✅ Done |
| Environment Config | Valibot-based environment validation | ✅ Done |
| Logging | Structured logging with JSON output for production | ✅ Done |
| Database Setup | Drizzle ORM with schema-first migrations | ✅ Done |
| Scheduler | Interval-based task scheduling with retry logic | ✅ Done |
| Serial Queue | Single-job execution queue using p-queue | ✅ Done |
| HTTP Server | Hono server with health check and Prometheus metrics | ✅ Done |

### Phase 2: Connectivity 🚧 In Progress

| Feature | Description | Status |
|---------|-------------|--------|
| Exchange Adapter Interface | Core `ExchangeAdapter` interface and domain types | ✅ Done |
| Rate Limiting | Token bucket, circuit breaker, exponential backoff | ✅ Done |
| Coinbase Adapter | Official SDK integration with rate limiting | ✅ Done |
| WebSocket Management | Production-grade WS with reconnection and health monitoring | ✅ Done |
| Data Plane | Real-time data streaming infrastructure | 🔜 Next |
| Adapter Factory | Factory for creating exchange adapters | 🔜 Next |

## Architecture

See `adrs/` for detailed architecture decisions:

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
| [0013](adrs/0013-risk-management.md) | Risk Management Engine | Planned |
| [0014](adrs/0014-funding-rate-strategy.md) | Funding Rate Prediction & Strategy | Planned |
| [0015](adrs/0015-execution-safety-slippage.md) | Execution Safety & Slippage Modeling | Planned |
| [0016](adrs/0016-backtesting-simulation.md) | Backtesting & Simulation Framework | Planned |
| [0017](adrs/0017-task-scheduler.md) | Task Scheduler Implementation | Accepted |
| [0018](adrs/0018-serial-execution-queue.md) | Serial Execution Queue | Accepted |

### High-Level Design

```
┌─────────────────────────────────────────────────────────┐
│                    IN-MEMORY STATE                       │
│  prices | funding | account | health | derived position │
└─────────────────────────────────────────────────────────┘
        ▲                    ▲                    │
        │                    │                    ▼
┌───────┴────────┐  ┌────────┴────────┐  ┌───────────────┐
│  DATA PLANE    │  │   RECONCILER    │  │ DECISION LOOP │
│  (WS + REST)   │  │   (REST poll)   │  │  (evaluate)   │
└────────────────┘  └─────────────────┘  └───────┬───────┘
                                                 │
                                                 ▼
                                    ┌────────────────────┐
                                    │  EXECUTION QUEUE   │
                                    │  (serial, 1 job)   │
                                    └────────────────────┘
```

## Project Structure

```
src/
├── index.ts                    # Application entry point
├── adapters/                   # Exchange adapter implementations
│   ├── types.ts               # ExchangeAdapter interface and domain types
│   ├── errors.ts              # ExchangeError class and error codes
│   ├── coinbase/              # Coinbase Advanced Trade adapter
│   │   ├── adapter.ts         # SDK wrapper with rate limiting
│   │   ├── normalizers.ts     # SDK → domain type converters
│   │   ├── schemas.ts         # Valibot schemas for API responses
│   │   └── rate-limits.ts     # Coinbase-specific rate limits
│   ├── binance/               # Binance adapter (placeholder)
│   └── bybit/                 # Bybit adapter (placeholder)
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
    └── websocket/             # WebSocket management
        ├── websocket.ts       # Connection manager with reconnection
        ├── message-queue.ts   # Bounded inbound message queue
        ├── message-parser.ts  # Validation and de-duplication
        └── health-monitor.ts  # Per-stream health monitoring
```

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

### Manual Setup

If you prefer manual setup or are on Linux:

```bash
# Install fnm
curl -fsSL https://fnm.vercel.app/install | bash

# Add to shell (restart terminal after)
echo 'eval "$(fnm env --use-on-cd)"' >> ~/.zshrc

# Install Node.js
fnm install 22
fnm use 22

# Enable Corepack
corepack enable

# Install dependencies
pnpm install

# Install git hooks
pnpm lefthook install

# Start Postgres
docker compose up -d postgres

# Run migrations
pnpm db:migrate
```

### Configuration

Copy `.env.example` to `.env` and configure your settings:

```bash
cp .env.example .env
```

See [Environment Variables](#environment-variables) for details.

## Local Development

### Prerequisites

- Docker and Docker Compose
- Node.js (see `.node-version`)
- pnpm

### Setup

1. Clone the repository
2. Run `./scripts/setup.sh` (starts Postgres automatically)
3. Copy `.env.example` to `.env` and fill in values
4. Run `pnpm install`
5. Run `pnpm db:migrate` to set up the database

### Database Commands

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

### Database Access

- Host: `localhost`
- Port: `5433`
- User: `postgres`
- Password: `postgres`
- Database: `funding_rate_arb`

### HTTP Server Endpoints

The bot runs an HTTP server alongside the worker process for monitoring and observability:

- **`GET /`** — API information
- **`GET /health`** — Health check endpoint (returns 200 when healthy, 503 when unhealthy)
- **`GET /metrics`** — Prometheus-formatted metrics endpoint

The server runs on the port specified by the `PORT` environment variable (default: `3000`).

See [ADR-0004: Backend Framework — Hono](adrs/0004-backend-framework-hono.md) and [ADR-0008: Monitoring & Observability](adrs/0008-monitoring-observability.md) for details.

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

## Key Features

### Exchange Adapter Interface

A unified `ExchangeAdapter` interface abstracts exchange-specific implementations:

```typescript
interface ExchangeAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  
  getBalance(asset: string): Promise<Balance>;
  getBalances(): Promise<Balance[]>;
  
  createOrder(params: CreateOrderParams): Promise<Order>;
  cancelOrder(orderId: string): Promise<void>;
  getOrder(orderId: string): Promise<Order | null>;
  
  getPosition(symbol: string): Promise<Position | null>;
  getFundingRate(symbol: string): Promise<FundingRate>;
  getTicker(symbol: string): Promise<Ticker>;
  
  subscribeTicker(symbol: string, callback: TickerCallback): void;
  unsubscribeTicker(symbol: string): void;
}
```

All financial amounts use `bigint` with unit suffixes (`rateBps`, `priceQuote`, `quantityBase`) per `CODE_GUIDELINES.md`.

### Rate Limiting

Robust outbound request controls prevent 429s and protect execution reliability:

- **Token Bucket**: Per-exchange request rate limiting with weighted endpoints
- **Circuit Breaker**: Cockatiel-backed breaker with HALF_OPEN recovery
- **Exponential Backoff**: Jittered retries with `Retry-After` header support
- **Request Policy**: Unified wrapper combining all protections

### WebSocket Management

Production-grade WebSocket handling with:

- **Single-flight connect**: Prevents reconnection races
- **Close-code policies**: Different handling for auth failures vs rate limits
- **Generation IDs**: Detects stale events after reconnection
- **Bounded message queue**: Backpressure control prevents OOM
- **Per-stream health monitoring**: Domain-aware staleness detection

### Structured Logging

JSON-formatted logs in production, pretty-printed in development:

```typescript
logger.info("Order executed", {
  orderId: "abc123",
  symbol: "BTC-PERP",
  side: "SELL",
  quantity: "0.5",
});
```

## Plan Management

This project uses a structured plan management system to track implementation progress. Plans are organized by roadmap and phase.

### Plan Structure

Plans are stored in `.cursor/plans/` with three states:

- **`active/`** — Plans currently being implemented
- **`drafts/`** — Plans created but not yet started
- **`implemented/`** — Completed plans (preserved for historical reference)

### Creating a New Plan

**Always use the template** at `.cursor/plans/PLAN_TEMPLATE.md` when creating a new plan. The template includes:

- Standard plan structure with frontmatter
- **Lifecycle management todo** (`id: lifecycle-management`) that must be completed when finishing the plan
- Proper validation checklist format
- Reference links structure

### Plan Lifecycle

Every plan includes a `lifecycle-management` todo that must be completed when the plan is finished. This ensures:

1. All implementation todos are marked `completed`
2. All validation boxes are checked `[x]`
3. Roadmap link is updated
4. Plan is moved from `active/` to `implemented/`
5. Plan is deleted from `active/` (file must only exist in `implemented/`)

See `.cursor/rules/plan-lifecycle.mdc` for detailed workflow instructions.

### Plan Naming Convention

Plans follow the pattern: `<roadmap-id>/<phase-id>/<plan-id>.md`

Example: `0001-mvp-roadmap/01-foundation/0008-http-server.md`

For more details, see `.cursor/plans/README.md`.

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Yes | - |
| `NODE_ENV` | Node environment (development, production, test) | Yes | - |
| `PORT` | HTTP server port | No | `3000` |
| `LOG_LEVEL` | Log level (debug, info, warn, error) | No | `info` |
| `COINBASE_API_KEY` | Coinbase CDP API key | No | - |
| `COINBASE_API_SECRET` | Coinbase CDP API secret | No | - |

See `.env.example` for all available options.

## Status

🚧 **In Development** — Phase 2: Connectivity (4/6 plans complete)

## License

Private — All rights reserved
