---
name: Deployment
overview: Protocol-agnostic infra. New env vars for Arbitrum, GMX, regime config.
todos:
  - id: flyio-config
    content: Update Fly.io config for Arbitrum RPC
    status: pending
  - id: env-vars
    content: Add ARBITRUM_*, GMX_*, regime env vars
    status: pending
  - id: docker
    content: Update Dockerfile if needed
    status: pending
  - id: tests
    content: Add deployment validation
    status: pending
  - id: code-review
    content: Run code-reviewer subagent
    status: pending
  - id: lifecycle-management
    content: "Move plan to implemented/"
    status: pending
isProject: false
---

> **Phase 2-07** in [GMX Pivot Roadmap](../../../README.md)

# Deployment

## Overview

Deployment on Fly.io. Protocol-agnostic; new env vars for chain, GMX, regime thresholds. Per ADR-0022 Key Configurations.

See deprecated [phase-e-testing-deployment/live-testing/0008-deployment.md](../../../../deprecated/0002-gmx-pivot-v1/phase-e-testing-deployment/live-testing/0008-deployment.md).
