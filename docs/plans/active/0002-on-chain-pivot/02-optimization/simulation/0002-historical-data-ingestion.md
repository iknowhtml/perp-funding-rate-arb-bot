---
name: Historical Data Ingestion
overview: Same DB pattern, GMX data sources. Ingest funding, OI, borrow rates for backtesting.
todos:
  - id: ingestion-service
    content: Create historical data ingestion from GMX REST/archives
    status: pending
  - id: market-snapshot-history
    content: Populate market_snapshot table with historical data
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

> **Phase 2-02** in [GMX Pivot Roadmap](../../../README.md)

# Historical Data Ingestion

## Overview

Ingest historical GMX data for backtesting. Same DB pattern as Phase 0 data collector; historical sources. Per ADR-0022 regime analysis.

See deprecated [phase-e-testing-deployment/simulation/0003-historical-data-ingestion.md](../../../../deprecated/0002-gmx-pivot-v1/phase-e-testing-deployment/simulation/0003-historical-data-ingestion.md).
