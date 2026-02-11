---
name: Accounting & P&L Attribution
overview: Full implementation of ADR-0021 — trade identity, event-driven + 5min periodic snapshots, two-bucket attribution (Perp/GM) + costs + drift, trade_snapshot schema, feasibility metrics.
todos:
  - id: trade-identity
    content: Trade ID on enter submission; finalized on exit execution
    status: pending
  - id: event-snapshots
    content: Event-driven snapshots on enter/exit submitted, executed, cancel
    status: pending
  - id: periodic-snapshots
    content: Periodic snapshots every 5 min while in-position
    status: pending
  - id: perp-bucket
    content: Perp leg — funding, position fees, price impact
    status: pending
  - id: gm-bucket
    content: GM leg — fees earned, drift
    status: pending
  - id: cost-buckets
    content: Gas, execution impact (USD)
    status: pending
  - id: trade-snapshot-schema
    content: Implement trade_snapshot schema per ADR-0021
    status: pending
  - id: feasibility-metrics
    content: net_usd_per_day, net_bps_per_day, win-rate, p10/p50/p90
    status: pending
  - id: tests
    content: Add unit tests
    status: pending
  - id: code-review
    content: Run code-reviewer subagent
    status: pending
  - id: lifecycle-management
    content: "Move plan to implemented/"
    status: pending
isProject: false
---

> **Phase 1-14** in [GMX Pivot Roadmap](../../README.md). Reference: [ADR-0021](../../../../../adrs/0021-on-chain-pnl-accounting.md)

# Accounting & P&L Attribution

## Overview

Full implementation of ADR-0021: USD unit of account, two buckets (Perp/GM) + explicit costs + drift. Event-driven + 5min periodic snapshots. trade_snapshot schema. Feasibility metrics (net_usd_per_day, net_bps_per_day, win-rate, p10/p50/p90).

## Validation

- [ ] All buckets populated
- [ ] Snapshots on correct events
- [ ] Feasibility metrics computable
- [ ] Typecheck and biome pass
