# Implementation Roadmap

This roadmap outlines the phased development approach for building the funding rate arbitrage bot from empty shell to production-ready system.

## Overview

The implementation is divided into **6 phases**, each building on the previous phase and validated before proceeding:

1. **Foundation** — Core infrastructure (logging, config, database, scheduler) ✅ COMPLETE
2. **Connectivity** — Exchange adapter, rate limiting, WebSocket connections 🚧 IN PROGRESS
3. **Core Logic** — State machines, strategy engine, risk engine
4. **Simulation** — Paper trading adapter, backtesting framework
5. **Live Testing** — Small capital deployment, monitoring, validation
6. **Production** — Full scale deployment, optimization, scaling

---

## Phase 1: Foundation ✅ COMPLETE

**Goal**: Build the core infrastructure that all other components depend on.

**Status**: All 8 implementation plans completed and moved to `implemented/01-foundation/`.

### Tasks

- [x] **Local Development Setup** — [Plan](../../implemented/0001-mvp-roadmap/01-foundation/0001-local-dev-setup.md)
  - [x] Created `docker-compose.yml` for local Postgres
  - [x] Updated `scripts/setup.sh` to check for Docker
  - [x] Documented local dev workflow in README

- [x] **ADR-0006: Drizzle ORM** — [Plan](../../implemented/0001-mvp-roadmap/01-foundation/0002-drizzle-orm-adr.md)
  - [x] Documented Drizzle as database query layer (`adrs/0006-drizzle-orm.md`)
  - [x] Explained schema-first approach
  - [x] Documented migration workflow

- [x] **Environment Configuration** — [Plan](../../implemented/0001-mvp-roadmap/01-foundation/0003-environment-config.md)
  - [x] Valibot schema for environment variables (`src/lib/env/schema.ts`)
  - [x] Environment variable validation at startup (`src/lib/env/env.ts`)
  - [x] Configuration loading and validation
  - [x] Added DATABASE_URL to `.env.example`

- [x] **Logging** — [Plan](../../implemented/0001-mvp-roadmap/01-foundation/0004-logging.md)
  - [x] Structured logging with levels (`src/lib/logger/logger.ts`)
  - [x] JSON output format for production
  - [x] Context-aware child loggers

- [x] **Database Setup** — [Plan](../../implemented/0001-mvp-roadmap/01-foundation/0005-database-setup.md)
  - [x] Created `drizzle.config.ts` configuration
  - [x] Created `src/lib/db/schema.ts` with table definitions
  - [x] Created `src/lib/db/client.ts` with connection factory
  - [x] Generated initial migration (`drizzle/0000_burly_norrin_radd.sql`)
  - [x] Added `db:*` npm scripts (generate, migrate, push, studio)
  - [x] Repository interfaces (ports) (`src/lib/db/ports/`)

- [x] **Scheduler** — [Plan](../../implemented/0001-mvp-roadmap/01-foundation/0006-scheduler.md)
  - [x] Interval-based task scheduling (`src/worker/scheduler.ts`)
  - [x] Task cancellation and cleanup
  - [x] Error handling with configurable retry logic
  - [x] ADR-0017: Task Scheduler (`adrs/0017-task-scheduler.md`)

- [x] **Serial Execution Queue** — [Plan](../../implemented/0001-mvp-roadmap/01-foundation/0007-serial-execution-queue.md)
  - [x] Single-job-at-a-time queue (`src/worker/queue.ts`)
  - [x] Job status tracking (pending, running, completed, failed)
  - [x] Job cancellation support
  - [x] ADR-0018: Serial Execution Queue (`adrs/0018-serial-execution-queue.md`)

- [x] **HTTP Server** — [Plan](../../implemented/0001-mvp-roadmap/01-foundation/0008-http-server.md)
  - [x] Hono server setup (`src/server/index.ts`)
  - [x] Health check endpoint (`src/server/routes/health.ts`)
  - [x] Metrics endpoint (`src/server/routes/metrics.ts`)

### Dependencies Installed

```bash
# Production
drizzle-orm, postgres, hono, @hono/node-server, valibot

# Development
drizzle-kit, vitest, tsx, typescript, @biomejs/biome
```

### Validation ✅

- [x] Docker Compose starts Postgres successfully (`pnpm db:up`)
- [x] All components have unit tests
- [x] Database migrations run successfully (`pnpm db:migrate`)
- [x] Drizzle Studio works (`pnpm db:studio`)
- [x] Health check endpoint returns 200 OK
- [x] Logs are structured and readable (JSON format)
- [x] Configuration validation catches invalid values

---

## Phase 2: Connectivity 🚧 IN PROGRESS

**Goal**: Connect to exchange APIs and implement rate limiting.

**Status**: 4 of 6 implementation plans completed. Active plans in `active/0001-mvp-roadmap/02-connectivity/`.

### Completed Tasks

- [x] **MCP Server Setup** (`.cursor/mcp.json`)
  - [x] Added Coinbase MCP server for documentation access
  - [x] Configured URL: `https://docs.cdp.coinbase.com/mcp`

- [x] **Exchange Adapter Interface** — [Plan](../../implemented/0001-mvp-roadmap/02-connectivity/0001-exchange-adapter-interface.md)
  - [x] Defined `ExchangeAdapter` interface (`src/adapters/types.ts`)
  - [x] Defined shared types (Order, Fill, Position, Balance, Ticker, FundingRate)
  - [x] Defined error types (`ExchangeError` class in `src/adapters/errors.ts`)
  - [x] Valibot schemas and type guards for all types

- [x] **Rate Limiting** — [Plan](../../implemented/0001-mvp-roadmap/02-connectivity/0002-rate-limiting.md)
  - [x] Token bucket implementation (`src/lib/rate-limiter/token-bucket.ts`)
  - [x] Exchange-specific rate limits (`src/adapters/*/rate-limits.ts`)
  - [x] Circuit breaker pattern (`src/lib/rate-limiter/circuit-breaker.ts`)
  - [x] Exponential backoff (`src/lib/rate-limiter/backoff.ts`)
  - [x] Request policy composition (`src/lib/rate-limiter/request-policy.ts`)

- [x] **Coinbase Advanced Trade Adapter** — [Plan](../../implemented/0001-mvp-roadmap/02-connectivity/0003-coinbase-adapter.md)
  - [x] Uses `@coinbase-sample/advanced-trade-sdk-ts` official SDK
  - [x] Adapter implementation (`src/adapters/coinbase/adapter.ts`)
  - [x] Normalizers for domain type mapping (`src/adapters/coinbase/normalizers.ts`)
  - [x] Valibot schemas for validation (`src/adapters/coinbase/schemas.ts`)
  - [x] Rate limit configuration (`src/adapters/coinbase/rate-limits.ts`)
  - [x] Unit tests (`src/adapters/coinbase/adapter.test.ts`, `normalizers.test.ts`)

- [x] **WebSocket Management** — [Plan](../../implemented/0001-mvp-roadmap/02-connectivity/0004-websocket-management.md)
  - [x] Connection management (`src/worker/websocket/websocket.ts`)
  - [x] Message parsing and validation (`src/worker/websocket/message-parser.ts`)
  - [x] Connection health monitoring (`src/worker/websocket/health-monitor.ts`)
  - [x] Message queueing (`src/worker/websocket/message-queue.ts`)
  - [x] Automatic reconnection with exponential backoff

### In Progress Tasks

- [ ] **Data Plane** — [Plan](../../implemented/0001-mvp-roadmap/02-connectivity/0005-data-plane.md)
  - [ ] WebSocket message handlers (ticker, mark price)
  - [ ] REST polling (funding rate, account state)
  - [ ] State updates (in-memory state store)

- [ ] **Adapter Factory** — [Plan](../../implemented/0001-mvp-roadmap/02-connectivity/0006-adapter-factory.md)
  - [ ] `createExchangeAdapter(exchange, config)` factory function
  - [ ] Exchange type: `"coinbase" | "binance" | "bybit" | "paper"`
  - [ ] Configuration validation with Valibot

### Future Tasks (Not Started)

- [ ] **Binance Adapter** (`src/adapters/binance/`)
  - Rate limits configured (`src/adapters/binance/rate-limits.ts`)
  - Full adapter implementation not yet started
  - [ ] REST API client (authentication, signing)
  - [ ] WebSocket client (ticker, mark price)
  - [ ] Valibot schemas for API responses
  - [ ] Response normalization
  - [ ] Error handling and retries

### Dependencies Installed

```bash
# Production
@coinbase-sample/advanced-trade-sdk-ts, cockatiel, ws, lru-cache, p-queue

# Development
@types/ws
```

### Validation

- [x] Rate limiting prevents 429 errors (token bucket + circuit breaker)
- [x] WebSocket reconnects automatically on disconnect
- [ ] Can connect to Coinbase Advanced Trade API (sandbox)
- [ ] Can connect to Binance API (testnet or paper trading)
- [ ] All API responses validated with Valibot

---

## Phase 3: Core Logic

**Goal**: Implement the trading strategy, risk management, and execution logic.

**Status**: 0 of 7 implementation plans completed. Active plans in `active/0001-mvp-roadmap/03-core-logic/`.

### Tasks

- [ ] **State Machines** — [Active Plan](./03-core-logic/0001-state-machines.md)
  - [ ] Order state machine (CREATED → SUBMITTED → FILLED) (ADR-0012)
  - [ ] Hedge state machine (IDLE → ENTERING → ACTIVE → EXITING) (ADR-0012)
  - [ ] State transition validation
  - [ ] State persistence for audit trail

- [ ] **Position Derivation** — [Active Plan](./03-core-logic/0002-position-derivation.md)
  - [ ] Derive position state from account data
  - [ ] Calculate position metrics (notional, P&L, margin)
  - [ ] Position reconciliation logic

- [ ] **Risk Engine** — [Active Plan](./03-core-logic/0003-risk-engine.md)
  - [ ] Risk assessment function (ADR-0013)
  - [ ] Hard limits enforcement (position size, leverage, drawdown)
  - [ ] Soft limits (warnings)
  - [ ] Liquidation distance calculation
  - [ ] Emergency exit logic

- [ ] **Strategy Engine** — [Active Plan](./03-core-logic/0004-strategy-engine.md)
  - [ ] Funding rate trend analysis (ADR-0014)
  - [ ] Entry signal generation
  - [ ] Exit signal generation
  - [ ] Position sizing logic

- [ ] **Execution Engine** — [Active Plan](./03-core-logic/0005-execution-engine.md)
  - [ ] Enter hedge execution (perp short + spot buy)
  - [ ] Exit hedge execution (spot sell + perp buy)
  - [ ] Order placement and fill tracking
  - [ ] Execution validation (slippage, risk re-check)

- [ ] **Reconciler** — [Active Plan](./03-core-logic/0006-reconciler.md)
  - [ ] Periodic reconciliation with exchange (ADR-0001)
  - [ ] Inconsistency detection
  - [ ] State correction logic

- [ ] **Evaluation Loop** — [Active Plan](./03-core-logic/0007-evaluation-loop.md)
  - [ ] 2-second evaluation tick (ADR-0001)
  - [ ] Risk assessment → Strategy evaluation → Execution
  - [ ] State health checks (stale data detection)

### Validation

- [ ] State machines enforce valid transitions only
- [ ] Risk engine blocks unsafe trades
- [ ] Strategy generates correct entry/exit signals
- [ ] Execution queue prevents concurrent trades
- [ ] Reconciler detects and corrects state drift

---

## Phase 4: Simulation

**Goal**: Validate the bot with paper trading and backtesting before risking real capital.

**Status**: 0 of 5 implementation plans completed. Active plans in `active/0001-mvp-roadmap/04-simulation/`.

### Tasks

- [ ] **Paper Trading Adapter** — [Active Plan](./04-simulation/0001-paper-trading-adapter.md)
  - [ ] Implement `ExchangeAdapter` interface (ADR-0010)
  - [ ] Simulate order fills with configurable slippage
  - [ ] Simulate partial fills
  - [ ] Simulate API errors and latency
  - [ ] Track paper trading state (balances, positions)

- [ ] **Slippage Modeling** — [Active Plan](./04-simulation/0002-slippage-modeling.md)
  - [ ] Order book depth analysis (ADR-0015)
  - [ ] Pre-trade slippage estimation
  - [ ] Post-trade slippage tracking
  - [ ] Slippage limit enforcement

- [ ] **Historical Data Ingestion** — [Active Plan](./04-simulation/0003-historical-data-ingestion.md)
  - [ ] Funding rate data collection (from exchange API)
  - [ ] Price data collection
  - [ ] Order book snapshot collection (optional)
  - [ ] Data storage in Postgres (ADR-0016)

- [ ] **Backtesting Engine** — [Active Plan](./04-simulation/0004-backtesting-engine.md)
  - [ ] Event-driven backtester (ADR-0016)
  - [ ] Historical data loading
  - [ ] Performance metrics calculation (Sharpe, drawdown, win rate)
  - [ ] Results export (CSV, JSON)

- [ ] **Backtesting CLI** — [Active Plan](./04-simulation/0005-backtesting-cli.md)
  - [ ] Command-line interface for running backtests
  - [ ] Parameter optimization support
  - [ ] Results visualization (optional)

### Validation

- [ ] Paper trading adapter simulates realistic market conditions
- [ ] Backtesting engine produces consistent results
- [ ] Strategy shows positive Sharpe ratio (> 1.0) in backtests
- [ ] Max drawdown within acceptable limits (< 10%)
- [ ] Slippage estimates match realized slippage (±20%)

---

## Phase 5: Live Testing

**Goal**: Deploy with small capital to validate live performance matches backtests.

**Status**: 0 of 4 implementation plans completed. Active plans in `active/0001-mvp-roadmap/05-live-testing/`.

### Tasks

- [ ] **Monitoring & Alerting** — [Active Plan](./05-live-testing/0001-monitoring-alerting.md)
  - [ ] Discord webhook integration (ADR-0008)
  - [ ] Telegram bot integration (optional)
  - [ ] Alert levels (critical, warning, info)
  - [ ] Alert routing (critical → Discord + Telegram)

- [ ] **Metrics Collection** — [Active Plan](./05-live-testing/0002-metrics-collection.md)
  - [ ] Prometheus metrics (ADR-0008)
  - [ ] Trading metrics (evaluations, executions, P&L)
  - [ ] Performance metrics (latency, error rates)
  - [ ] Risk metrics (position size, margin utilization)

- [ ] **Deployment** — [Active Plan](./05-live-testing/0003-deployment.md)
  - [ ] Dockerfile (ADR-0007)
  - [ ] Fly.io configuration (`fly.toml`) (ADR-0007)
  - [ ] Environment variable setup
  - [ ] Database migration on startup

- [ ] **Small Capital Deployment** — [Active Plan](./05-live-testing/0004-small-capital-deployment.md)
  - [ ] Deploy with $1,000-$5,000 capital
  - [ ] Monitor for 1-2 weeks
  - [ ] Compare live performance vs backtests
  - [ ] Tune parameters based on live data

### Validation

- [ ] Bot runs 24/7 without crashes
- [ ] Live performance matches backtest expectations
- [ ] Risk limits prevent over-leverage
- [ ] Alerts notify on critical events
- [ ] Metrics dashboard shows accurate data

---

## Phase 6: Production

**Goal**: Scale to full capital deployment and optimize performance.

**Status**: 0 of 3 implementation plans completed. Active plans in `active/0001-mvp-roadmap/06-production/`.

### Tasks

- [ ] **Performance Optimization** — [Active Plan](./06-production/0001-performance-optimization.md)
  - [ ] Profile evaluation loop latency
  - [ ] Optimize database queries
  - [ ] Reduce WebSocket message processing overhead
  - [ ] Optimize order book depth analysis

- [ ] **Scaling Capital** — [Active Plan](./06-production/0002-scaling-capital.md)
  - [ ] Gradually increase position size
  - [ ] Monitor slippage impact at larger sizes
  - [ ] Adjust position sizing based on liquidity
  - [ ] Scale to target capital ($50K-$300K)

- [ ] **Operational Excellence** — [Active Plan](./06-production/0003-operational-excellence.md)
  - [ ] Runbook documentation
  - [ ] Incident response procedures
  - [ ] Performance monitoring dashboards
  - [ ] Regular performance reviews

- [ ] **Future Enhancements** (Optional - No plans yet)
  - [ ] Additional exchange adapters (Bybit, OKX)
  - [ ] Cross-exchange arbitrage
  - [ ] Machine learning for parameter optimization
  - [ ] Advanced risk management (portfolio-level)

### Validation

- [ ] Bot handles target capital without issues
- [ ] Performance metrics meet targets (Sharpe > 1.5, max drawdown < 10%)
- [ ] Operational procedures documented
- [ ] Team can maintain and operate the bot

---

## Success Criteria

### Phase 1-3 (Development)
- ✅ All components have unit tests (>80% coverage)
- ✅ All ADRs implemented
- ✅ Code passes linting and type checking
- ✅ Documentation complete

### Phase 4 (Simulation)
- ✅ Backtest shows positive Sharpe ratio (> 1.0)
- ✅ Max drawdown < 10%
- ✅ Win rate > 50%
- ✅ Paper trading runs without errors for 1 week

### Phase 5 (Live Testing)
- ✅ Bot runs 24/7 for 2 weeks without crashes
- ✅ Live performance matches backtest expectations (±20%)
- ✅ No risk limit violations
- ✅ All critical alerts working

### Phase 6 (Production)
- ✅ Bot handles target capital ($50K-$300K)
- ✅ Sharpe ratio > 1.5
- ✅ Max drawdown < 10%
- ✅ Operational procedures documented

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| **Strategy unprofitable** | Extensive backtesting before live deployment |
| **Execution bugs** | Paper trading validation, small capital testing |
| **Exchange API changes** | Version API calls, monitor for schema changes |
| **Risk limits insufficient** | Start conservative, tighten based on performance |
| **Slippage higher than expected** | Monitor realized slippage, adjust position sizing |

---

## Next Steps

1. **Complete Phase 2**: Finish Data Plane and Adapter Factory plans
2. **Validate Coinbase connectivity** with sandbox API
3. **Start Phase 3**: Begin state machines and risk engine
4. **Don't skip simulation**: Paper trading and backtesting are critical
5. **Start small**: Deploy with minimal capital first, scale gradually

---

## References

### ADRs

| ADR | Title | Status |
|-----|-------|--------|
| [ADR-0001](../../../../../adrs/0001-bot-architecture.md) | Bot Architecture | Accepted |
| [ADR-0002](../../../../../adrs/0002-hexagonal-inspired-architecture.md) | Hexagonal-Inspired Architecture | Accepted |
| [ADR-0003](../../../../../adrs/0003-validation-strategy.md) | Validation Strategy (Valibot) | Accepted |
| [ADR-0004](../../../../../adrs/0004-backend-framework-hono.md) | Backend Framework (Hono) | Accepted |
| [ADR-0005](../../../../../adrs/0005-database-strategy.md) | Database Strategy | Accepted |
| [ADR-0006](../../../../../adrs/0006-drizzle-orm.md) | Drizzle ORM | Accepted |
| [ADR-0007](../../../../../adrs/0007-infrastructure-flyio.md) | Infrastructure (Fly.io) | Accepted |
| [ADR-0008](../../../../../adrs/0008-monitoring-observability.md) | Monitoring & Observability | Accepted |
| [ADR-0009](../../../../../adrs/0009-dev-tooling.md) | Dev Tooling | Accepted |
| [ADR-0010](../../../../../adrs/0010-exchange-adapters.md) | Exchange Adapters | Accepted |
| [ADR-0011](../../../../../adrs/0011-exchange-rate-limiting.md) | Exchange Rate Limiting | Accepted |
| [ADR-0012](../../../../../adrs/0012-state-machines.md) | State Machines | Accepted |
| [ADR-0013](../../../../../adrs/0013-risk-management.md) | Risk Management Engine | Accepted |
| [ADR-0014](../../../../../adrs/0014-funding-rate-strategy.md) | Funding Rate Strategy | Accepted |
| [ADR-0015](../../../../../adrs/0015-execution-safety-slippage.md) | Execution Safety & Slippage | Accepted |
| [ADR-0016](../../../../../adrs/0016-backtesting-simulation.md) | Backtesting & Simulation | Accepted |
| [ADR-0017](../../../../../adrs/0017-task-scheduler.md) | Task Scheduler | Accepted |
| [ADR-0018](../../../../../adrs/0018-serial-execution-queue.md) | Serial Execution Queue | Accepted |

### External Documentation
- [Drizzle ORM](https://orm.drizzle.team/)
- [Drizzle Kit (Migrations)](https://orm.drizzle.team/kit-docs/overview)
- [Coinbase Advanced Trade API](https://docs.cdp.coinbase.com/advanced-trade/docs/welcome)
- [Coinbase Advanced Trade SDK](https://github.com/coinbase-samples/advanced-trade-sdk-ts)
