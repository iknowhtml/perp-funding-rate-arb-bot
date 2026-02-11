---
name: Data Collector & Storage
overview: Store hourly market snapshots (funding, OI, borrow rates, gas) and execution estimates. DB schema per ADR-0022 appendix.
todos:
  - id: db-schema
    content: Add market_snapshot and execution_estimate tables to Drizzle schema (ADR-0022 appendix)
    status: pending
  - id: collector-service
    content: Create data collector service — poll GMX REST + RPC at configured cadence (funding/OI 30-60s, gas 10s)
    status: pending
  - id: market-snapshot
    content: Persist market_snapshot rows — ts, market, market_name, price, long/short_funding_rate, OI long/short, borrow rates, oi_skew_ratio
    status: pending
  - id: gas-price
    content: Poll eth_gasPrice every 10s, store in snapshot or separate table
    status: pending
  - id: scheduler-integration
    content: Integrate collector with task scheduler (ADR-0017)
    status: pending
  - id: tests
    content: Add unit tests for collector, schema validation
    status: pending
  - id: code-review
    content: Run code-reviewer subagent
    status: pending
  - id: lifecycle-management
    content: "Move plan to implemented/"
    status: pending
isProject: false
---

> **Phase 0-02** in [GMX Pivot Roadmap](../../README.md). Reference: [ADR-0022](../../../../../adrs/0022-regime-based-gmx-arb.md), [ADR-0024](../../../../../adrs/0024-data-plane-rest-polling.md)

# Data Collector & Storage

## Overview

Implement the Data Plane collector that persists normalized snapshots to the database. Per ADR-0022 Data Plane:

- **Sources:** GMX REST markets/info, Chain RPC (positions, balances, gas), eth_gasPrice
- **Cadence:** Funding/OI 30–60s, positions/balances 30s, gas 10s
- **Output:** Normalized snapshots persisted to DB

For Phase 0 feasibility mode, the collector runs hourly (or at the above cadence) to build a history for regime analysis and go/no-go decision.

## Schema (ADR-0022 Appendix)

### market_snapshot

- ts
- market (address)
- market_name
- price
- long_funding_rate (bps/hr or APR — store units explicitly)
- short_funding_rate
- long_open_interest_usd
- short_open_interest_usd
- borrow_rate_long
- borrow_rate_short
- oi_skew_ratio

### execution_estimate (populated by Impact Sampler plan)

- ts
- market
- size_usd
- simulated_impact_bps
- estimated_gas_usd
- acceptable_price

## Tasks

1. **DB schema**: Add `market_snapshot` and `execution_estimate` tables via Drizzle migrations.
2. **Collector service**: Poll GMX REST `/markets/info` for funding, OI, borrow rates. Poll RPC for gas price. Normalize and insert.
3. **Scheduler**: Use existing task scheduler (ADR-0017) to run collector at configured intervals.

## Validation

- [ ] market_snapshot rows inserted at correct cadence
- [ ] Data matches GMX REST / RPC sources
- [ ] Gas price stored (10s cadence)
- [ ] Collector handles REST/RPC failures gracefully

## References

- [ADR-0022: Regime-Based GMX v2 Funding Arb Bot](../../../../../adrs/0022-regime-based-gmx-arb.md) — Data Plane, Appendix schema
- [ADR-0024: Data Plane REST Polling](../../../../../adrs/0024-data-plane-rest-polling.md)
- [GMX v2 REST API](https://docs.gmx.io/docs/api/rest-v2)
