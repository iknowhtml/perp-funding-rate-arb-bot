---
name: Impact Sampler
overview: Run simulateExecuteOrder for $50k ETH/BTC every N minutes. Record impact bps distribution. Go/no-go: median < 3 bps, p90 < 8 bps.
todos:
  - id: simulate-order
    content: Integrate GMX simulateExecuteOrder (or equivalent) for short perp at $50k notional
    status: pending
  - id: eth-btc-markets
    content: Run sampler for both ETH/USD and BTC/USD markets
    status: pending
  - id: impact-recording
    content: Record simulated_impact_bps to execution_estimate table (ADR-0022 schema)
    status: pending
  - id: scheduler
    content: Run sampler every N minutes (configurable, e.g. 5–15 min)
    status: pending
  - id: distribution-metrics
    content: Compute and log median, p90 impact bps (nightly or on-demand)
    status: pending
  - id: go-no-go-check
    content: Implement go/no-go check — median < 3 bps and p90 < 8 bps (configurable thresholds)
    status: pending
  - id: tests
    content: Add unit tests for sampler, distribution calculation
    status: pending
  - id: code-review
    content: Run code-reviewer subagent
    status: pending
  - id: lifecycle-management
    content: "Move plan to implemented/"
    status: pending
isProject: false
---

> **Phase 0-03** in [GMX Pivot Roadmap](../../README.md). Reference: [ADR-0022](../../../../../adrs/0022-regime-based-gmx-arb.md)

# Impact Sampler

## Overview

Per ADR-0022 Phase 0: Every N minutes, run `simulateExecuteOrder` for $50k size on ETH/USD and BTC/USD. Record impact bps distribution.

**Success criteria (go/no-go):**
- Median impact well below threshold (e.g. < 3 bps)
- p90 < 8 bps

If impact exceeds these thresholds at $50k notional, profitability is at risk. Phase 0 determines feasibility before committing to Phase 1 execution.

## Tasks

1. **Simulate order**: Use GMX Reader or ExchangeRouter simulation to estimate execution price and impact for a $50k short perp order. Requires wallet client (for simulation context) but no actual tx submission.
2. **Markets**: ETH/USD and BTC/USD only (ADR-0022 MVP).
3. **Persist**: Insert into `execution_estimate` table (ts, market, size_usd, simulated_impact_bps, estimated_gas_usd, acceptable_price).
4. **Distribution**: Compute median and p90 from recent samples (e.g. last 24h or 7d).
5. **Go/no-go**: Expose check or CLI to evaluate whether Phase 0 success criteria are met.

## Dependencies

- Phase 0-01: Chain Infrastructure (viem client, GMX Reader/REST)
- Phase 0-02: Data Collector (execution_estimate table)

## Validation

- [ ] SimulateExecuteOrder runs successfully for ETH and BTC
- [ ] Impact bps recorded correctly
- [ ] Distribution metrics (median, p90) computed
- [ ] Go/no-go criteria configurable
- [ ] Success: median < 3 bps, p90 < 8 bps in test/mainnet environment

## References

- [ADR-0022: Regime-Based GMX v2 Funding Arb Bot](../../../../../adrs/0022-regime-based-gmx-arb.md) — Phase 0, Cost Model, Key Configurations
- [ADR-0020: Contract Interaction Patterns](../../../../../adrs/0020-contract-interaction-patterns.md) — simulate before submit
- [GMX Price Impact](https://docs.gmx.io/docs/trading/v2#price-impact)
