---
name: Operational Excellence
overview: Incorporate ADR-0022 operational runbook — RPC unhealthy, oracle stale, keeper timeout, regime flip, yield < minimum.
todos:
  - id: runbook-rpc
    content: Runbook: If RPC unhealthy → pause trading
    status: pending
  - id: runbook-oracle
    content: Runbook: If oracle stale → pause trading
    status: pending
  - id: runbook-keeper
    content: Runbook: If keeper delay > timeout → cancel order
    status: pending
  - id: runbook-regime
    content: Runbook: If funding regime flips negative → exit next safe window
    status: pending
  - id: runbook-yield
    content: Runbook: If net expected yield < minimum → do not enter
    status: pending
  - id: tx-troubleshooting
    content: On-chain tx troubleshooting docs
    status: pending
  - id: tests
    content: Add runbook validation tests
    status: pending
  - id: code-review
    content: Run code-reviewer subagent
    status: pending
  - id: lifecycle-management
    content: "Move plan to implemented/"
    status: pending
isProject: false
---

> **Phase 2-11** in [GMX Pivot Roadmap](../../../README.md). Reference: [ADR-0022](../../../../../../adrs/0022-regime-based-gmx-arb.md) Operational Runbook

# Operational Excellence

## Overview

Incorporate ADR-0022 operational runbook: RPC unhealthy/oracle stale → pause; keeper timeout → cancel; regime flip → exit; yield < minimum → do not enter. On-chain tx troubleshooting.

See deprecated [phase-e-testing-deployment/production/0012-operational-excellence.md](../../../../deprecated/0002-gmx-pivot-v1/phase-e-testing-deployment/production/0012-operational-excellence.md).
