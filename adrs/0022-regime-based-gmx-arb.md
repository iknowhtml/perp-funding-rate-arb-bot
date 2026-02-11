# ADR 0022: Regime-Based GMX v2 Funding Arb Bot (ETH/BTC) — Feasibility-Driven Architecture

- **Status:** Proposed (ready to implement)
- **Date:** 2026-02-11
- **Owners:** -
- **Related:**
  - [ADR-0019: On-Chain Perps Pivot](0019-on-chain-perps-pivot.md)
  - [ADR-0013: Risk Management Engine](0013-risk-management.md)
  - [ADR-0015: Execution Safety & Slippage](0015-execution-safety-slippage.md)
  - [ADR-0021: On-Chain Hedge Model & P&L Accounting](0021-on-chain-pnl-accounting.md)

---

## Context

We evaluated historical GMX v2 funding data (hourly long/short funding rates by market) and found:

- Funding regimes persist (multi-day stretches where long_funding_rate > 0, i.e., shorts receive funding).
- ETH and BTC show the cleanest persistence and are best suited for an MVP.
- At $50k notional, gas is not the bottleneck; price impact + GM leg drift/IL are the primary profitability risks.
- Therefore, the bot must be regime-based (enter only when conditions are strong, exit on regime deterioration) and must measure/estimate impact before committing.

This ADR defines the architecture and decisions needed to build a feasibility-first GMX arb bot that can be upgraded into production.

---

## Goals

1. Capture funding regimes on GMX v2 (Arbitrum) by shorting perps when longs are paying.
2. Use GM tokens as the hedge leg to remain roughly delta-neutral while earning LP-side fees.
3. For MVP, make a go/no-go profitability call quickly by:
   - logging real execution costs (impact + gas),
   - monitoring regime persistence,
   - computing net P&L attribution.

---

## Non-Goals

- Multi-protocol support (e.g., Drift) in MVP.
- Perfect IL modeling in MVP (we track/proxy it and treat it as a risk metric + exit input).
- High-frequency trading. This is not latency arbitrage; it's regime capture.

---

## Decision Summary

We will build a regime-based GMX v2 arb bot that:

1. **Trades ETH/USD and BTC/USD markets only** for MVP.
2. **Uses a two-leg hedge:**
   - Short perp sized to match the GM token's underlying delta exposure (approximate in MVP; refine later).
   - Long GM tokens as the hedge leg + LP fee earner.
3. **Uses a two-phase decision pipeline:**
   - Feasibility mode (impact measurement + regime logging, small capital).
   - Execution mode (enter/exit with strict risk gates).
4. **Measures performance in USD** with component attribution:
   - Funding P&L (perp leg)
   - Borrow/LP fees P&L (GM leg, realized + accrual estimate)
   - Gas
   - Price impact
   - GM token value drift (IL proxy; risk + optional P&L line item)
5. **Enforces a hard profitability constraint for $50k notional:**
   - Max tolerable round-trip impact: 5–8 bps (configurable)
   - Enters only if expected regime duration and expected funding cover costs with buffer.

---

## Architecture

### High-Level Components

#### 1) Data Plane (Polling)

- **Sources:**
  - GMX REST markets/info (funding/borrow/OI, market state)
  - Chain RPC + Reader/DataStore (positions, balances, oracle health)
  - RPC eth_gasPrice (gas)
- **Cadence:**
  - Funding/OI: 30–60s
  - Positions/balances: 30s
  - Gas: 10s
- **Output:** normalized snapshots persisted to DB.

#### 2) Signal Engine (Regime Detector)

- **Inputs:** funding rates + OI skew + volatility guardrails
- **Core signal:**
  - `long_funding_rate_4h_ma > ENTRY_THRESHOLD`
  - OI skew supportive (long OI > short OI) if available
- **Exit:**
  - `long_funding_rate_4h_ma <= EXIT_THRESHOLD` (usually 0)
  - or net expected yield drops below minimum

#### 3) Cost Model

- **Gas model:**
  - static estimate per tx + live gas price
  - total tx count per lifecycle (approve optional + createOrder + createDeposit + close + withdraw + cancels)
- **Impact model:**
  - simulate before submit using GMX simulation
  - log estimated impact bps for chosen size
- **IL/GM drift proxy:**
  - track GM token mark-to-market delta vs cost basis + accrued fees (hybrid)

#### 4) Risk Engine (On-Chain Extensions)

- **Enforces:**
  - max gas threshold
  - max impact threshold (per leg + total)
  - oracle staleness/deviation
  - keeper delay timeout/cancel
  - liquidation distance minimum
  - max exposure per market
  - circuit breakers (RPC unhealthy, abnormal deviations)

#### 5) Execution Engine (State Machine)

- **Enter sequence** (serial queue, 1 lifecycle at a time):
  1. Ensure approvals
  2. simulateExecuteDeposit (GM deposit)
  3. simulateExecuteOrder (perp short)
  4. Submit tx(s) with conservative acceptable price
  5. Monitor keeper execution events
  6. Confirm state; reconcile balances/positions
- **Exit sequence:**
  1. simulate close order + withdraw
  2. submit
  3. monitor keeper execution
  4. reconcile

#### 6) Reconciler

- Periodic chain reads to ensure:
  - position exists / closed as expected
  - GM balances match expected
  - pending orders cleared
- Corrects local state if missed events.

#### 7) Accounting / P&L Attribution

- **Unit:** USD
- **Snapshot frequency:** event-driven + periodic (every 5 min):
  - event-driven on: enter submitted, enter executed, exit submitted, exit executed
  - periodic for ongoing accrual reporting
- **Buckets:**
  - Perp leg: funding accrued, price impact / fees
  - GM leg: change in GM value (mark-to-market), fee accrual estimate (if available) or realized on exit
  - Gas
  - Net

---

## Key Configurations (MVP Defaults)

- **Markets:** ETH/USD, BTC/USD
- **Notional:** $50,000 per market (or split; start smaller in feasibility mode)
- **Entry threshold (funding):** 4h_MA > 0.05 bps/hr (tunable)
- **Exit threshold:** 4h_MA <= 0
- **Max round-trip impact:** 5 bps target, 8 bps hard cap
- **Gas cap:** configurable (e.g., if estimated round-trip gas > $10, don't enter)
- **Keeper timeout:** 60–120s (cancel if not executed)
- **Min liquidation distance:** conservative (protocol-specific; enforce via Reader)

---

## Implementation Plan

### Phase 0 — Data + Simulator First (Fast Go/No-Go)

**Deliverables:**

- Collector that stores hourly:
  - funding rates, OI long/short, borrow rates (REST)
  - gas price
- Impact sampler:
  - every N minutes, run simulateExecuteOrder for $50k size (ETH/BTC)
  - record impact bps distribution

**Success criteria:** Median impact well below threshold (e.g., <3 bps) and p90 < 8 bps

### Phase 1 — MVP Execution (Small Capital)

**Deliverables:**

- Enter/exit state machine
- Keeper monitoring and cancellation logic
- Risk engine guardrails
- Accounting snapshots and P&L breakdown

**Success criteria:**

- Trades complete reliably
- P&L attribution matches expectations
- No unsafe failure modes (stuck orders, nonce issues)

### Phase 2 — Profit Optimization

**Deliverables:**

- Better hedge sizing vs GM underlying exposure
- IL tracking refinement
- Adaptive thresholds (entry/exit based on cost model + forecasted hold time)
- Alerting/monitoring dashboards

---

## Alternatives Considered

1. **Always-on short + GM hold**
   - Rejected: regime flips and impact/IL drift can erase returns.
2. **Funding-only (no GM hedge)**
   - Rejected: loses delta neutrality; becomes directional short.
3. **CEX perps**
   - Rejected: access restrictions were the forcing function (ADR-0019).

---

## Consequences

### Positive

- Architecture matches GMX reality: async keepers, on-chain costs, pool impact.
- Fast feasibility validation: you can prove/disprove profitability quickly.
- Regime logic aligns with observed funding persistence.

### Negative / Risks

- GM leg introduces IL/drift and valuation complexity.
- Keeper delays can cause worse fills during volatility.
- Exact borrow/LP fee attribution may require additional data sources; MVP may approximate until improved.

---

## Operational Runbook (Minimum)

- If RPC unhealthy or oracle stale → pause trading
- If keeper delay > timeout → cancel order
- If impact estimate > threshold → skip entry/exit (or reduce size)
- If funding regime flips negative → exit next safe window
- If net expected yield < minimum after costs → do not enter

---

## Decision: Is it worth building?

**Yes**, but only as defined here:

- ETH/BTC only
- Regime-based
- Simulate+measure impact before execution
- $50k notional viability determined primarily by impact + GM drift, not gas

This ADR is the blueprint.

---

## Appendix: Minimal Data Schema (what to store)

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

### execution_estimate

- ts
- market
- size_usd
- simulated_impact_bps
- estimated_gas_usd
- acceptable_price

### position_state

- ts
- market
- perp_position (size, entry, pnl, liquidation)
- gm_balance
- gm_cost_basis
- gm_mtm_value

### pnl_snapshot

- ts
- trade_id
- perp_funding_usd
- perp_fees_usd
- gm_value_change_usd
- gm_fee_accrual_usd (or realized)
- gas_usd
- impact_usd
- net_usd
