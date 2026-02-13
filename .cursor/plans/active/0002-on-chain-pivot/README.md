# GMX Pivot Roadmap

Regime-based GMX v2 funding rate arbitrage on Arbitrum (ETH/BTC). Feasibility-driven architecture.

**Supersedes**: [CEX Roadmap Phases 4-6](../../deprecated/0001-mvp/README.md)  
**Reference**: [ADR-0022: Regime-Based GMX v2 Funding Arb Bot](../../../../adrs/0022-regime-based-gmx-arb.md), [ADR-0021: P&L Accounting](../../../../adrs/0021-on-chain-pnl-accounting.md), [ADR-0019: On-Chain Perps Pivot](../../../../adrs/0019-on-chain-perps-pivot.md), [ADR-0020: Contract Interaction Patterns](../../../../adrs/0020-contract-interaction-patterns.md)

## Overview

This roadmap implements a regime-based GMX v2 arbitrage bot per ADR-0022. It uses a three-phase implementation model:

- **Phase 0 — Data + Simulator First**: Validate feasibility before committing capital. Collect funding/OI data, sample impact. Go/no-go: median impact < 3 bps, p90 < 8 bps.
- **Phase 1 — MVP Execution**: Enter/exit state machine, keeper monitoring, risk engine, accounting. Small capital.
- **Phase 2 — Profit Optimization**: Backtesting, monitoring, deployment, scaling, operational excellence.

### What Carries Over from CEX Roadmap

- **Foundation (Phases 1-3)**: Logging, config, database, scheduler, serial queue, HTTP server — unchanged.
- **Connectivity**: Rate limiting, circuit breaker, backoff patterns. WebSocket replaced by REST polling (ADR-0024).
- **Core Logic**: State machines, evaluation pipeline, risk engine structure, strategy engine structure — adapted for regime-based signals.

### What's New

- **Phase 0**: Data collector, impact sampler — feasibility validation.
- **Phase 1**: Chain infra, GMX adapter, regime detector, cost model, GM yield valuation, risk engine, enter/exit execution, reconciler, accounting.
- **Phase 2**: Simulation, deployment, production optimization.

---

## Phase 0: Data + Simulator First (Fast Go/No-Go)

**Goal**: Prove/disprove profitability quickly. No live trading. Success: median impact < 3 bps, p90 < 8 bps.

**Dependencies**: Foundation (Phases 1-3) complete. `viem` and `@gmx-io/sdk` installed.

### Plans

- [ ] **[0-01: Chain Infrastructure](../../implemented/0002-on-chain-pivot/00-feasibility/0001-chain-infrastructure.md)** — Viem client + GMX contract read helpers (reads only)
- [ ] **[0-02: Data Collector & Storage](../../implemented/0002-on-chain-pivot/00-feasibility/0002-data-collector.md)** — market_snapshot, execution_estimate; hourly funding, OI, borrow rates, gas
- [ ] **[0-03: Impact Sampler](../../implemented/0002-on-chain-pivot/00-feasibility/0003-impact-sampler.md)** — simulateExecuteOrder for $50k ETH/BTC; record impact bps distribution

### Validation

- [ ] market_snapshot and execution_estimate populated
- [ ] Impact sampler runs; median < 3 bps, p90 < 8 bps
- [ ] All code passes typecheck and biome

---

## Phase 1: MVP Execution (Small Capital)

**Goal**: Trades complete reliably. P&L attribution matches expectations. No unsafe failure modes.

**Dependencies**: Phase 0 success criteria met.

### Plans

- [ ] **[1-01: Transaction Lifecycle](./01-mvp-execution/0001-transaction-lifecycle.md)** — Build → simulate → send → confirm pipeline
- [ ] **[1-02: GMX Adapter Types + CEX Cleanup](./01-mvp-execution/0002-gmx-adapter-types.md)** — position_state, pnl_snapshot types; delete CEX adapters
- [ ] **[1-03: GMX Adapter — Reads](./01-mvp-execution/0003-gmx-adapter-reads.md)** — 4h MA funding, OI skew ratio
- [ ] **[1-04: GMX Adapter — Writes](./01-mvp-execution/0004-gmx-adapter-writes.md)** — simulate-before-submit pattern
- [ ] **[1-05: Keeper Monitoring](./01-mvp-execution/0005-keeper-monitoring.md)** — 60-120s timeout, cancel on timeout
- [ ] **[1-06: Regime Detector](./01-mvp-execution/0006-regime-detector.md)** — 4h MA entry/exit signals
- [ ] **[1-07: Cost Model](./01-mvp-execution/0007-cost-model.md)** — Gas, impact, drift; break-even gate
- [ ] **[1-08: GM Token Yield & Valuation](./01-mvp-execution/0008-gm-yield-valuation.md)** — Hybrid valuation per ADR-0021
- [ ] **[1-09: Risk Engine On-Chain](./01-mvp-execution/0009-risk-engine-on-chain.md)** — Max gas, impact (5/8 bps), oracle, keeper, circuit breakers
- [ ] **[1-10: Enter Hedge On-Chain](./01-mvp-execution/0010-enter-hedge-on-chain.md)** — Enter sequence with entry gate
- [ ] **[1-11: Exit Hedge On-Chain](./01-mvp-execution/0011-exit-hedge-on-chain.md)** — Exit sequence; regime flip or yield < costs
- [ ] **[1-12: Async Order Lifecycle](./01-mvp-execution/0012-async-order-lifecycle.md)** — State machine; cancel on timeout
- [ ] **[1-13: Reconciler](./01-mvp-execution/0013-reconciler.md)** — Position, GM balance, pending orders check
- [ ] **[1-14: Accounting & P&L Attribution](./01-mvp-execution/0014-accounting-pnl.md)** — ADR-0021 full implementation

### Validation

- [ ] Enter/exit sequences complete reliably
- [ ] P&L attribution (Perp, GM, gas, impact, drift) correct
- [ ] No stuck orders, nonce issues
- [ ] All code passes typecheck and biome

---

## Phase 2: Profit Optimization & Production

**Goal**: Backtesting, monitoring, deployment, scaling. Operational runbook in place.

**Dependencies**: Phase 1 complete.

### Simulation

| Plan | Status |
|------|--------|
| [2-01: GMX Paper Trading Adapter](./02-optimization/simulation/0001-paper-trading-adapter.md) | [ ] |
| [2-02: Historical Data Ingestion](./02-optimization/simulation/0002-historical-data-ingestion.md) | [ ] |
| [2-03: Backtesting Engine](./02-optimization/simulation/0003-backtesting-engine.md) | [ ] |
| [2-04: Backtesting CLI](./02-optimization/simulation/0004-backtesting-cli.md) | [ ] |

### Deployment

| Plan | Status |
|------|--------|
| [2-05: Monitoring & Alerting](./02-optimization/deployment/0005-monitoring-alerting.md) | [ ] |
| [2-06: Metrics Collection](./02-optimization/deployment/0006-metrics-collection.md) | [ ] |
| [2-07: Deployment](./02-optimization/deployment/0007-deployment.md) | [ ] |
| [2-08: Small Capital Deployment](./02-optimization/deployment/0008-small-capital-deployment.md) | [ ] |

### Production

| Plan | Status |
|------|--------|
| [2-09: Performance Optimization](./02-optimization/production/0009-performance-optimization.md) | [ ] |
| [2-10: Capital Scaling](./02-optimization/production/0010-capital-scaling.md) | [ ] |
| [2-11: Operational Excellence](./02-optimization/production/0011-operational-excellence.md) | [ ] |

### Validation

- [ ] Backtest on GMX historical data shows positive Sharpe
- [ ] Monitoring covers regime, GM drift, impact alerts
- [ ] Deployment works on Fly.io with Arbitrum RPC
- [ ] Operational runbook (ADR-0022) documented and followed
- [ ] Bot runs 24/7 with acceptable gas overhead

---

## Legacy Plan Mapping

Previous Phase A-E structure preserved in [`deprecated/0002-gmx-pivot-v1/`](../../deprecated/0002-gmx-pivot-v1/).

---

## Dependencies

| Library | Purpose |
|---------|---------|
| `viem` | Ethereum client (RPC, tx signing, ABI encoding) |
| `@gmx-io/sdk` | GMX v2 utilities (ABIs, types) — utility library, not tx manager (ADR-0020) |

## Architecture References

| ADR | Title | Relevance |
|-----|------|-----------|
| [ADR-0022](../../../../adrs/0022-regime-based-gmx-arb.md) | Regime-Based GMX v2 Funding Arb Bot | **Primary** — architecture, phases, config |
| [ADR-0021](../../../../adrs/0021-on-chain-pnl-accounting.md) | On-Chain Hedge Model & P&L Accounting | Accounting model, break-even, GM valuation |
| [ADR-0019](../../../../adrs/0019-on-chain-perps-pivot.md) | On-Chain Perps Pivot | Core decision, hedge model |
| [ADR-0020](../../../../adrs/0020-contract-interaction-patterns.md) | Contract Interaction Patterns | Hybrid SDK, read/write patterns |
| [ADR-0024](../../../../adrs/0024-data-plane-rest-polling.md) | Data Plane REST Polling | Polling cadence, REST vs RPC |
| [ADR-0025](../../../../adrs/0025-testnet-first-deployment.md) | Testnet-First Deployment | Phase 0/1/2 graduation |
| [ADR-0026](../../../../adrs/0026-on-chain-execution-safety.md) | On-Chain Execution Safety | Superseded by ADR-0022 |
| [ADR-0027](../../../../adrs/0027-wallet-security-model.md) | Wallet Security Model | Key storage, approvals |
| [ADR-0012](../../../../adrs/0012-state-machines.md) | State Machines | Order + hedge state machines |
| [ADR-0013](../../../../adrs/0013-risk-management.md) | Risk Management | Risk engine extensions |
| [ADR-0018](../../../../adrs/0018-serial-execution-queue.md) | Serial Execution Queue | Nonce conflicts |

## Environment Variables

```bash
# Chain
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
ARBITRUM_PRIVATE_KEY=0x...
ARBITRUM_CHAIN_ID=42161  # 421614 for testnet

# GMX
GMX_ORACLE_URL=https://arbitrum-api.gmxinfra.io
GMX_MARKET_ADDRESS=0x...  # ETH/USD, BTC/USD

# Regime (ADR-0022)
ENTRY_THRESHOLD_BPS_PER_HR=0.05
EXIT_THRESHOLD_BPS_PER_HR=0
MAX_ROUND_TRIP_IMPACT_BPS=8
TARGET_IMPACT_BPS=5
KEEPER_TIMEOUT_SEC=120

# Gas
MAX_GAS_PRICE_GWEI=1
GAS_CAP_USD=10
```

## Success Criteria

### Phase 0
- Median impact < 3 bps, p90 < 8 bps at $50k notional (ETH/BTC)

### Phase 1
- Trades complete reliably
- P&L attribution matches expectations
- No unsafe failure modes (stuck orders, nonce issues)

### Phase 2
- Backtest Sharpe > 1.0
- Small capital deployment matches expectations (±20%)
- Gas costs < 10% of funding yield
- Bot runs 24/7 with < 1% downtime
