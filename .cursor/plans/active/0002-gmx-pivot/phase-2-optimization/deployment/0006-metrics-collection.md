---
name: Metrics Collection
overview: Add P&L attribution metrics per ADR-0021 — net_usd_per_day, net_bps_per_day, win rate.
todos:
  - id: prometheus-metrics
    content: Add Prometheus metrics for gas, tx, oracle
    status: pending
  - id: pnl-metrics
    content: Add net_usd_per_day, net_bps_per_day, win_rate per ADR-0021
    status: pending
  - id: remove-ws-metrics
    content: Remove WebSocket metrics
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

> **Phase 2-06** in [GMX Pivot Roadmap](../../../README.md). Reference: [ADR-0021](../../../../../../adrs/0021-on-chain-pnl-accounting.md)

# Metrics Collection

## Overview

Add gas, tx, oracle metrics. Add P&L attribution metrics per ADR-0021: net_usd_per_day, net_bps_per_day, win-rate. Remove WS metrics.

See deprecated [phase-e-testing-deployment/live-testing/0007-metrics-collection.md](../../../../deprecated/0002-gmx-pivot-v1/phase-e-testing-deployment/live-testing/0007-metrics-collection.md).
