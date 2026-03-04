# ADR 0026: On-Chain Execution Safety

- **Status:** Accepted
- **Date:** 2026-02-11
- **Owners:** -
- **Related:**
  - [ADR-0022: Regime-Based GMX v2 Funding Arb Bot](0022-regime-based-gmx-arb.md)
  - [ADR-0019: On-Chain Perps Pivot](0019-on-chain-perps-pivot.md)
  - [ADR-0020: Contract Interaction Patterns](0020-contract-interaction-patterns.md)
  - [ADR-0015: Execution Safety & Slippage](0015-execution-safety-slippage.md) (CEX predecessor)
  - [ADR-0018: Serial Execution Queue](0018-serial-execution-queue.md)

## Context

ADR-0015 covers CEX execution safety: order book slippage estimation, market vs limit orders, slippage limits per order. None of this applies to GMX's pool-based execution model.

On-chain execution introduces different safety concerns: pool-based price impact, two-leg atomicity, acceptable price parameters, execution fee estimation, emergency exit. These are resolved below.

## Decision

### 1. Pool-Based Price Impact

**Simulate before submit.** Use GMX `simulateExecuteOrder` and `simulateExecuteDeposit` before every tx. Log estimated impact bps. **Max impact:** 5 bps target, 8 bps hard cap (ADR-0022). Block entry if impact exceeds threshold.

### 2. Two-Leg Atomicity / Partial Execution Recovery

**Reconciler + retry.** If leg 1 succeeds and leg 2 fails, reconciler detects discrepancy. Enter reduce-only mode: hold single leg, don't open new positions. Retry leg 2 on next evaluation tick. Unwind leg 1 only if retries exhausted (manual escalation acceptable for MVP).

### 3. Acceptable Price Parameters

**Conservative from simulation.** Set `acceptablePrice` based on simulated execution price + configurable buffer (e.g. 50 bps). Tiered: normal for entries, wider for exits, widest for emergency exits. Use simulation output as baseline.

### 4. Execution Fee Buffer

**Estimate + buffer.** Use GMX SDK / DataStore for execution gas limit. Include buffer (e.g. 1.5x) on estimated gas. Avoid under-funding; excess is refunded.

### 5. Emergency Exit Gas Policy

**Elevated but bounded.** Relax gas circuit breaker for exits when risk engine triggers DANGER/BLOCKED. Use elevated gas limit (e.g. 10x normal max). If gas cost exceeds position value, still attempt exit (manual override for extreme cases).

### 6. Simulation Failure Policy

**Block execution on simulation failure.** Always simulate before submit. If simulation fails or reverts, block execution. For emergency exits: allow skip-simulation only when explicitly configured (use with caution).

### 7. Price Impact Limits

**5 bps target, 8 bps hard cap** (ADR-0022). Apply per leg and total round-trip. Skip entry/exit if estimate exceeds threshold; optionally reduce size.

## Consequences

**Positive:** Simulate-before-submit prevents bad fills; impact caps protect profitability; keeper timeout avoids stuck orders; tiered acceptable price balances safety and fill probability.

**Negative:** Conservative parameters may reduce fill rate during volatility; emergency exit at elevated gas can be costly.

## References

- [GMX Order Execution](https://docs.gmx.io/docs/api/contracts-v2#order-execution)
- [GMX Price Impact](https://docs.gmx.io/docs/trading/v2#price-impact)
- Plan D-01: Enter Hedge On-Chain
- Plan D-02: Exit Hedge On-Chain
- Plan D-03: Async Order Lifecycle
