---
name: Backtesting Engine
overview: Event-driven architecture, GMX mechanics. Add regime-based strategy backtesting per ADR-0022.
todos:
  - id: backtest-engine
    content: Create backtesting engine with event-driven architecture
    status: pending
  - id: regime-strategy
    content: Add regime-based strategy (4h MA, entry/exit thresholds) to backtest
    status: pending
  - id: gm-mechanics
    content: Model GM mechanics (funding, impact, drift) in backtest
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

> **Phase 2-03** in [GMX Pivot Roadmap](../../../README.md). Reference: [ADR-0022](../../../../../../adrs/0022-regime-based-gmx-arb.md)

# Backtesting Engine

## Overview

Backtesting engine with GMX mechanics. Add regime-based strategy backtesting (4h MA entry/exit, OI skew). Per ADR-0022 Signal Engine.

See deprecated [phase-e-testing-deployment/simulation/0004-backtesting-engine.md](../../../../deprecated/0002-gmx-pivot-v1/phase-e-testing-deployment/simulation/0004-backtesting-engine.md).
