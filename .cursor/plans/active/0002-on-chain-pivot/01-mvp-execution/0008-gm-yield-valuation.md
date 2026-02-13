---
name: GM Token Yield & Valuation
overview: Hybrid valuation (cost basis + MTM + EMA smoothing) per ADR-0021. Drift treatment per ADR-0021.
todos:
  - id: cost-basis
    content: Track GM cost basis (deposits minus withdrawals, USD at deposit-time)
    status: pending
  - id: mtm-valuation
    content: Implement mark-to-market from pool/reader/REST
    status: pending
  - id: smoothed-mtm
    content: Implement EMA over 30-60 min for unrealized P&L stability
    status: pending
  - id: drift-treatment
    content: Track gm_drift_usd = gm_mtm - cost_basis - fee_accrual; use in exit logic
    status: pending
  - id: fee-accrual
    content: MVP: realized on withdrawal; optionally REST/reader if exposes accrual
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

> **Phase 1-08** in [GMX Pivot Roadmap](../../README.md). Reference: [ADR-0021](../../../../../adrs/0021-on-chain-pnl-accounting.md)

# GM Token Yield & Valuation

## Overview

Per ADR-0021: Hybrid valuation (cost basis + MTM + smoothed MTM). Unrealized GM P&L uses Smoothed MTM; realized uses withdrawal proceeds. Drift = gm_mtm - cost_basis - fee_accrual; tracked as P&L and risk metric for exit guardrail.

See deprecated [phase-c-strategy-risk/0002-gm-token-yield-model.md](../../../deprecated/0002-gmx-pivot-v1/phase-c-strategy-risk/0002-gm-token-yield-model.md) for base.

## Validation

- [ ] Cost basis, MTM, smoothed MTM correct
- [ ] Drift used in exit logic
- [ ] Typecheck and biome pass
