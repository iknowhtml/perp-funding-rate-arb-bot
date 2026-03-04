---
name: Backtesting CLI
overview: Protocol-agnostic CLI for running backtests. Minor param updates for regime config.
todos:
  - id: cli-command
    content: Create backtest CLI command
    status: pending
  - id: regime-params
    content: Add regime params (entry/exit threshold, hold hours)
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

> **Phase 2-04** in [GMX Pivot Roadmap](../../../README.md)

# Backtesting CLI

## Overview

CLI for running backtests. Protocol-agnostic; add regime-specific params (entry/exit threshold, expected hold) per ADR-0022.

See deprecated [phase-e-testing-deployment/simulation/0005-backtesting-cli.md](../../../../deprecated/0002-gmx-pivot-v1/phase-e-testing-deployment/simulation/0005-backtesting-cli.md).
