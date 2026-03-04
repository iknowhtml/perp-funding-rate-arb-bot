# ADR 0021: On-Chain Hedge Model & P&L Accounting

- **Status:** Accepted
- **Date:** 2026-02-11
- **Owners:** -
- **Related:**
  - [ADR-0022: Regime-Based GMX v2 Funding Arb Bot](0022-regime-based-gmx-arb.md)
  - [ADR-0019: On-Chain Perps Pivot](0019-on-chain-perps-pivot.md)
  - [ADR-0014: Funding Rate Strategy](0014-funding-rate-strategy.md)
  - [ADR-0013: Risk Management Engine](0013-risk-management.md)


## Context

The CEX model (ADR-0014) has a simple P&L structure: funding rate income minus trading fees and slippage. One yield source, two cost components.

The GMX model introduces a fundamentally different P&L structure with **four revenue components** and **three cost components**:

### Revenue

1. **Funding rate income** — from OI skew on the short perp position (continuous, variable)
2. **Trading fees** — GM token holders earn a share of all trading fees in the pool
3. **Borrow fees** — GM token holders earn borrow fees paid by leveraged traders
4. **Price impact rebates** — collected when traders accept worse prices

### Costs

1. **Gas costs** — entry tx + exit tx + any rebalancing (2-6 txs per round trip)
2. **Price impact** — pool-based impact on entry/exit (replaces order book slippage)
3. **Impermanent loss** — GM tokens are exposed to index token price movement

To decide feasibility and operate safely, we must define unit of account, attribution buckets, measurement frequency, break-even thresholds, and GM valuation. This ADR resolves those choices.

---

## Decision

### 1) Unit of Account

**Decision:** Use USD as the primary accounting unit.

- **Why:** Strategy feasibility and thresholds (bps of notional, $ profit/day, gas in $) are easiest to interpret in USD; ROI comparisons across markets/sizes are straightforward.
- **How:** Convert using GMX oracle / REST price for market mark-to-market. Record price source + timestamp with every snapshot.

**Secondary units:** bps of notional (`net_bps = (net_usd / notional_usd) * 10_000`). Native ETH for gas stored for traceability but converted to USD for reporting.

---

### 2) P&L Attribution Granularity

**Decision:** Option C + targeted breakdown

- **Two top-level buckets:** Perp Leg, GM Leg
- **Plus explicit cost buckets:** Gas, Execution Price Impact / Fees
- **And one risk bucket:** GM Drift (IL proxy) tracked both as P&L and risk metric

---

### 3) Measurement Frequency

**Decision:** Event-driven + periodic (hybrid)

- **Event-driven snapshots on:** enter submitted, enter executed, exit submitted, exit executed, cancel executed
- **Periodic snapshots every 5 minutes** while in-position.

---

### 4) Break-even and Entry/Exit Economics

**Decision:** Use a dynamic break-even model at entry time.

**At entry, estimate:** expected_hold_hours, gas_est_usd_roundtrip, impact_est_bps_roundtrip, gm_drift_budget_bps_per_day.

**Entry condition:** Enter only if `expected_total_yield_bps >= gas_bps + impact_bps + drift_bps + buffer_bps` where:
- gas_bps = (gas_est_usd_roundtrip / N) * 10_000
- impact_bps = impact_est_bps_roundtrip
- drift_bps = gm_drift_budget_bps_per_day * expected_hold_days
- buffer_bps = configured (default 2 bps)

**Exit condition:** funding regime flips (`funding_4h_ma <= 0`) or `remaining_expected_yield_bps < remaining_costs_bps`.

**MVP:** expected_funding_bps from rolling 4h avg; expected_lp_bps = 0 (conservative) until measured.

---

### 5) GM Token Valuation

**Decision:** Hybrid valuation (Cost basis + mark-to-market with smoothing)

- **Cost basis (USD):** Sum of deposits minus withdrawals at deposit-time oracle
- **Mark-to-market (USD):** gm_balance * gm_price_usd(t)
- **Smoothed MTM:** EMA over 30–60 minutes for monitoring

**Reporting:** Unrealized GM P&L uses Smoothed MTM; realized uses actual withdrawal proceeds.

---

### 6) Impermanent Loss / Drift Treatment

**Decision:** Track as both P&L component and risk metric.

```
gm_drift_usd = gm_mtm_usd - gm_cost_basis_usd - gm_fee_accrual_est_usd
```

**Exit guardrail:** If drift exceeds budget (e.g. 5–10 bps/day * days held), tighten exit or exit immediately if funding weak.

---

## Accounting Model

**Trade identity:** Perp open short → close short; GM deposit → withdraw. Trade ID created on enter submission, finalized on exit execution.

**Buckets:** Perp leg (funding, fees, impact); GM leg (fees earned, drift); Costs (gas, impact).

**trade_snapshot fields:** ts, trade_id, market, notional_usd, oracle_price_usd, perp_position_size_usd, perp_entry_price, perp_mtm_price, cum_funding_usd, perp_fee_usd, gm_balance, gm_cost_basis_usd, gm_mtm_usd, gm_mtm_usd_ema, gas_spent_usd_to_date, impact_bps_est_enter/exit, state.

**Feasibility metrics:** net_usd_per_day, net_bps_per_day, win-rate, p10/p50/p90, max drawdown.

---

## Implementation Notes

- gas_bps = gas_usd / notional_usd * 10_000
- impact_usd = notional_usd * impact_bps / 10_000
- net_usd = perp_funding_usd + gm_realized_fee_usd + gm_mtm_delta_usd - gas_usd - perp_fees_usd - impact_usd
- Entry gate: impact_bps_est_roundtrip <= 8 (hard), <= 5 (target); expected_funding_bps_hold >= gas_bps + impact_bps + drift_budget_bps + buffer_bps

---

## Consequences

**Positive:** Easy-to-debug attribution; conservative feasibility; works with imperfect GM fee visibility.

**Negative:** Hybrid GM valuation introduces smoothing lag; drift is operational proxy, not true IL; requires consistent price source logging.

---

## Open Items (Deferred)

1. Exact GM fee accrual breakdown (trading vs borrow)
2. Full IL decomposition into "vs HODL" metric
3. Continuous tick-level P&L

---

## References

- [GMX GM Pools — Providing Liquidity](https://docs.gmx.io/docs/providing-liquidity/v2)
- [GMX Adaptive Funding](https://docs.gmx.io/docs/trading/v2#adaptive-funding)
- Plan C-01: OI Skew Funding Signal
- Plan C-02: GM Token Yield Model
