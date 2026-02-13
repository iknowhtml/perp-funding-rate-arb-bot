---
name: Monitoring & Alerting
overview: Add regime state monitoring, GM drift alerts, impact alerts per ADR-0022 runbook.
todos:
  - id: health-checks
    content: Health checks for RPC, oracle, keeper
    status: pending
  - id: regime-alerts
    content: Alert on regime state (entry/exit signal changes)
    status: pending
  - id: gm-drift-alerts
    content: Alert when GM drift exceeds budget
    status: pending
  - id: impact-alerts
    content: Alert when impact estimate > threshold
    status: pending
  - id: discord-telegram
    content: Discord/Telegram integration per ADR-0008
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

> **Phase 2-05** in [GMX Pivot Roadmap](../../../README.md). Reference: [ADR-0022](../../../../../../adrs/0022-regime-based-gmx-arb.md) Operational Runbook

# Monitoring & Alerting

## Overview

Monitoring with new on-chain alert types. Per ADR-0022 runbook: regime state, GM drift, impact. Remove WS alerts (GMX uses REST).

See deprecated [phase-e-testing-deployment/live-testing/0006-monitoring-alerting.md](../../../../deprecated/0002-gmx-pivot-v1/phase-e-testing-deployment/live-testing/0006-monitoring-alerting.md).
