---
name: Capital Scaling
overview: Reference ADR-0022 $50k notional target and impact constraints. Pool utilization, OI caps.
todos:
  - id: pool-utilization
    content: Monitor pool utilization for scaling decisions
    status: pending
  - id: oi-caps
    content: Respect OI caps per market
    status: pending
  - id: impact-constraints
    content: Enforce impact constraints (5 bps target, 8 bps hard) at scale
    status: pending
  - id: sizing-logic
    content: Adjust position sizing based on impact/cost model
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

> **Phase 2-10** in [GMX Pivot Roadmap](../../../README.md). Reference: [ADR-0022](../../../../../../adrs/0022-regime-based-gmx-arb.md) Key Configurations

# Capital Scaling

## Overview

Scale capital per ADR-0022: $50k notional target. Impact constraints (5 bps target, 8 bps hard). Pool utilization, OI caps. Per ADR-0022 Phase 2 — better hedge sizing vs GM underlying exposure.

See deprecated [phase-e-testing-deployment/production/0011-on-chain-capital-scaling.md](../../../../deprecated/0002-gmx-pivot-v1/phase-e-testing-deployment/production/0011-on-chain-capital-scaling.md).
