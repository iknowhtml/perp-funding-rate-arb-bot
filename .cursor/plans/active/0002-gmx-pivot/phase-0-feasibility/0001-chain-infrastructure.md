---
name: Chain Infrastructure
overview: Viem client + GMX contract read helpers — foundation for Phase 0 data collector and impact sampler. Reads only; no tx lifecycle.
todos:
  - id: install-deps
    content: Install viem and @gmx-io/sdk dependencies
    status: pending
  - id: chain-constants
    content: Create src/lib/chain/constants.ts with Arbitrum chain config, contract addresses, gas defaults
    status: pending
  - id: public-client
    content: Create src/lib/chain/client.ts with createArbitrumPublicClient (multicall batching via SDK)
    status: pending
  - id: wallet-client
    content: Add createArbitrumWalletClient to client.ts (optional for Phase 0 — impact sampler needs it)
    status: pending
  - id: rpc-health
    content: Create src/lib/chain/health.ts with RPC health monitoring
    status: pending
  - id: gmx-contracts
    content: Create src/adapters/gmx/contracts.ts with GMX contract addresses from SDK
    status: pending
  - id: gmx-reader-rest
    content: Create GMX Reader + REST API helpers for market data (positions, funding, OI, tickers)
    status: pending
  - id: env-schema
    content: Update env schema with ARBITRUM_RPC_URL, ARBITRUM_PRIVATE_KEY, GMX_ORACLE_URL
    status: pending
  - id: tests
    content: Add unit tests for client factory, health monitor, GMX read helpers
    status: pending
  - id: code-review
    content: Run code-reviewer subagent
    status: pending
  - id: lifecycle-management
    content: "Move plan to implemented/"
    status: pending
isProject: false
---

> **Phase 0-01** in [GMX Pivot Roadmap](../../README.md). Reference: [ADR-0022](../../../../../adrs/0022-regime-based-gmx-arb.md), [ADR-0024](../../../../../adrs/0024-data-plane-rest-polling.md)

# Chain Infrastructure

## Overview

Set up the Ethereum/Arbitrum client layer and GMX read helpers. This consolidates the foundation from the former Phase A-01 and A-02, scoped to **reads only** for Phase 0 (no transaction lifecycle yet).

Phase 0 needs:
- Public client for RPC reads (market data, OI, gas price)
- GMX REST API client (funding rates, borrow rates, OI long/short)
- Reader contract helpers for positions, balances (for later Phase 1)
- RPC health monitoring (circuit breaker input)

## Tasks

See deprecated [phase-a-chain-infra/0001-viem-client-setup.md](../../../deprecated/0002-gmx-pivot-v1/phase-a-chain-infra/0001-viem-client-setup.md) and [0002-gmx-contract-integration.md](../../../deprecated/0002-gmx-pivot-v1/phase-a-chain-infra/0002-gmx-contract-integration.md) for implementation details.

Scope for Phase 0:
- Viem public + wallet client (wallet needed for impact sampler simulation)
- GMX contract addresses, Reader helpers, REST API client
- Valibot schemas for REST responses and contract data
- No ExchangeRouter writes, no tx send/confirm

## Validation

- [ ] Can connect to Arbitrum RPC and read chain state
- [ ] Multicall batching works
- [ ] GMX REST API fetches markets/info (funding, OI, borrow rates)
- [ ] Reader contract reads market data and positions
- [ ] RPC health monitor detects stale blocks
- [ ] All code passes typecheck and biome

## References

- [ADR-0022: Regime-Based GMX v2 Funding Arb Bot](../../../../../adrs/0022-regime-based-gmx-arb.md)
- [ADR-0020: Contract Interaction Patterns](../../../../../adrs/0020-contract-interaction-patterns.md)
- [ADR-0024: Data Plane REST Polling](../../../../../adrs/0024-data-plane-rest-polling.md)
