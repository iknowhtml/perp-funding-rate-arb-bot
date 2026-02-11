---
name: Regime Detector & Signal Engine
overview: 4h MA-based regime detection. Entry: long_funding_rate_4h_ma > ENTRY_THRESHOLD. Exit: <= EXIT_THRESHOLD or net yield < costs. Per ADR-0022 Signal Engine.
todos:
  - id: regime-types
    content: Define RegimeSignal types (funding 4h MA, OI skew, entry/exit flags)
    status: pending
  - id: entry-signal
    content: Implement entry: long_funding_rate_4h_ma > ENTRY_THRESHOLD (default 0.05 bps/hr)
    status: pending
  - id: exit-signal
    content: Implement exit: 4h_MA <= EXIT_THRESHOLD (0) or remaining expected yield < costs
    status: pending
  - id: oi-skew-support
    content: Add OI skew supportive check (long OI > short OI) if available
    status: pending
  - id: update-strategy-engine
    content: Update strategy engine to use regime signals
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

> **Phase 1-06** in [GMX Pivot Roadmap](../../README.md). Reference: [ADR-0022](../../../../../adrs/0022-regime-based-gmx-arb.md) Signal Engine

# Regime Detector & Signal Engine

## Overview

Implement the Signal Engine per ADR-0022. Core signal: long_funding_rate_4h_ma > ENTRY_THRESHOLD. OI skew supportive (long OI > short OI) if available. Exit when 4h_MA <= 0 or net expected yield drops below minimum.

Replaces/rewrites the former OI Skew Funding Signal plan with explicit 4h MA regime logic.

## Validation

- [ ] Entry signal correct
- [ ] Exit signal correct
- [ ] Strategy engine uses regime signals
- [ ] Typecheck and biome pass
