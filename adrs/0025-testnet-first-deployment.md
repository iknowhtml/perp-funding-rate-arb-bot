# ADR 0025: Testnet-First Deployment Strategy

- **Status:** Accepted
- **Date:** 2026-02-11
- **Owners:** -
- **Related:**
  - [ADR-0022: Regime-Based GMX v2 Funding Arb Bot](0022-regime-based-gmx-arb.md)
  - [ADR-0019: On-Chain Perps Pivot](0019-on-chain-perps-pivot.md)
  - [ADR-0007: Infrastructure (Fly.io)](0007-infrastructure-flyio.md)

## Context

On-chain execution is irreversible — bugs that would cause a failed API call on a CEX cause real ETH to be spent on gas and real tokens to be locked in contracts. A testnet-first deployment strategy mitigates this, but raises questions about what "testnet" means for GMX and what graduation criteria to use.

### GMX Testnet Availability

GMX v2 has contracts deployed on Arbitrum Sepolia, but the testnet environment differs from mainnet:
- Liquidity is thin or synthetic (not real market makers)
- Keeper behavior may differ (fewer keepers, different latency)
- Oracle prices may be stale or synthetic
- Gas dynamics differ from mainnet Arbitrum
- Some markets may not exist on testnet

This means testnet can validate **contract interaction correctness** (right ABI, right calldata, right flow) but NOT **real market behavior** (price impact, keeper latency, oracle freshness).

### Deployment Stages (Resolved per ADR-0022 Phase 0/1/2)

ADR-0022 defines a feasibility-driven model:

- **Phase 0 — Data + Simulator First**: Collector + impact sampler. No live trading. Success: median impact < 3 bps, p90 < 8 bps.
- **Phase 1 — MVP Execution**: Enter/exit state machine, keeper monitoring, risk engine, accounting. Small capital. Success: trades complete reliably, P&L attribution matches expectations.
- **Phase 2 — Profit Optimization**: Hedge sizing refinement, IL tracking, adaptive thresholds, alerting.

**Stage mapping:**
1. **Unit tests with mocked contracts** — validate logic (always)
2. **Arbitrum Sepolia** — validate contract interactions end-to-end
3. **Mainnet feasibility mode** (Phase 0) — data collector + impact sampler, no execution
4. **Mainnet MVP** (Phase 1) — small capital ($1K-$5K or split from $50k), enter/exit with strict risk gates
5. **Mainnet production** (Phase 2) — scaling, optimization

### Open Questions (Deferred)

1. **Forked mainnet usage**: Optional for local testing. Can skip and go Sepolia → mainnet feasibility.

2. **Graduation criteria**: Phase 0 → Phase 1: impact criteria met. Phase 1 → Phase 2: N successful round trips, P&L within expected range, no unsafe failure modes.

3. **Forked mainnet tooling**: If we use it, Anvil (`anvil --fork-url`) — free, local, fast. Optional.

4. **Testnet configuration**: Environment variable `ARBITRUM_CHAIN_ID` (421614 testnet, 42161 mainnet). Plan A-01. Separate DB per environment recommended for isolation.

5. **Duration at each stage**: Phase 0 — run until impact distribution is statistically sufficient. Phase 1 — run until N round trips complete successfully. Metrics over time.

6. **Rollback criteria**: Per ADR-0022 operational runbook — if RPC unhealthy, oracle stale, keeper timeout, regime flip, or yield < minimum → pause. Manual decision to reduce capital or retreat.

## Decision

**Accepted.** Phasing per ADR-0022: Phase 0 (feasibility) → Phase 1 (MVP execution) → Phase 2 (profit optimization). Testnet for contract validation; mainnet feasibility before execution. Environment variable for chain switch.

## Consequences

### Positive

- Feasibility validated before committing capital.
- Clear graduation criteria per phase.
- Runbook defines when to pause/rollback.

### Negative

- Phase 0 adds time before first live trade.

## References

- [GMX Testnet (Arbitrum Sepolia)](https://docs.gmx.io/docs/api/contracts-v2)
- [Foundry Anvil](https://book.getfoundry.sh/reference/anvil/)
- [Tenderly Forks](https://docs.tenderly.co/forks)
- Plan E-09: On-Chain Small Capital Deployment
