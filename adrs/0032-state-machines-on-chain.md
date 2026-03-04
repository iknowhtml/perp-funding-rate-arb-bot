# ADR 0032: State Machines (On-Chain)

- **Status:** Accepted
- **Date:** 2026-03-04
- **Updated:** 2026-03-04
- **Owners:** -
- **Supersedes:** [ADR-0012: State Machines for Order and Position Lifecycle](0012-state-machines.md)
- **Related:**
  - [ADR-0031: Bot Architecture (On-Chain)](0031-bot-architecture-on-chain.md)
  - [ADR-0020: Contract Interaction Patterns](0020-contract-interaction-patterns.md)
  - [ADR-0026: On-Chain Execution Safety](0026-on-chain-execution-safety.md)

## Context

The bot manages execution and position. ADR-0012 defined state machines for **CEX order lifecycle** (CREATED → SUBMITTED → ACKED → FILLED etc.) and **hedge lifecycle** (IDLE → ENTERING → ACTIVE → EXITING → CLOSED). With on-chain execution (ADR-0031), entry and exit are **atomic** (one tx per enter, one per exit). We need state-machine discipline for **transaction lifecycle**; “in position or not” is derived from chain, so a separate hedge state machine is unnecessary.

## Decision

### What Carries Over from ADR-0012

- **State-machine discipline**: Discriminated union types, explicit transitions, validation, idempotency via intent IDs, state persistence for audit.
- **StateTransition** (or equivalent) for audit trail: entityType can include `"transaction"` (and optionally a minimal hedge view); same correlation and history requirements.

### Transaction Lifecycle (Replaces Order Lifecycle)

On-chain execution has no exchange ACK or partial fill. The primitive is a transaction:

| State      | Meaning                          | Next states      |
|-----------|-----------------------------------|------------------|
| BUILDING  | Transaction payload being built   | READY, FAILED    |
| READY     | Built, not yet sent               | PENDING, FAILED  |
| PENDING   | Sent, waiting for receipt        | CONFIRMED, REVERTED, TIMED_OUT |
| CONFIRMED | Receipt success                  | (terminal)      |
| REVERTED  | Receipt reverted                 | (terminal)      |
| TIMED_OUT | No receipt within timeout       | (terminal)      |
| FAILED    | Build/simulate failed or aborted | (terminal)      |

- **Events**: BUILD_SUBMIT, TX_SENT (txHash), RECEIPT_CONFIRMED, RECEIPT_REVERTED, TIMEOUT, FAIL (reason).
- **Timeout**: Configurable wait for receipt (e.g. 2–5 minutes on Arbitrum); on timeout, transition to TIMED_OUT and treat as retriable or failed per policy (ADR-0026).
- **Reconciliation**: Chain state (Reader contract, balances) is source of truth; no polling for “order status.” Reconciler detects position/balance and aligns in-memory state (ADR-0031).

### Hedge State: Not a Separate State Machine

With **atomic** entry and exit (one multicall per enter, one per exit), we do **not** need a separate multi-phase hedge state machine (IDLE → ENTERING → ACTIVE → EXITING → CLOSED). CEX needed those phases because entry/exit were multi-step (perp order then spot order, with ACKs and partial fills). On-chain:

- **“In position?”** is derived from chain: Reader contract (and optionally REST) tells us if we have a position. Reconciler keeps this in sync (ADR-0031).
- **“Are we doing something?”** is at most one in-flight transaction: the execution queue is serial, so we have either no pending tx or one (enter or exit). That’s **transaction lifecycle** (e.g. PENDING → CONFIRMED/REVERTED), not a separate hedge phase.

So the **minimal model** is:

- **Position**: `Position | null` from chain (reconciler + last read). No separate “hedge state” enum required.
- **Pending work**: `{ intentId: string; type: "ENTER" | "EXIT"; txStatus: TxStatus } | null` when the queue has sent a tx and we’re waiting for receipt. When the tx confirms or reverts, we clear this and rely on the next reconcile (or immediate receipt handling) to update position.

Optional **derived** “logical” state for evaluator or UI (e.g. “don’t try to enter again while we have a pending enter tx”): compute from `(position, pendingTx)` — e.g. IDLE, PENDING_ENTER, ACTIVE, PENDING_EXIT. That’s a view over position + pendingTx, not a state machine to be driven by its own events. Audit can log “enter tx sent”, “enter tx confirmed”, “exit tx sent”, “exit tx confirmed” as transaction lifecycle events; no separate hedge-phase transitions are required.

### Idempotency and Audit

- **Intent IDs** still scope a logical operation (e.g. one “enter hedge” intent may trigger one multicall tx). Retries use the same intent ID so we avoid double execution.
- **Audit**: Persist transition events (hedge and transaction) with entityType, fromState, toState, event payload, correlationId, timestamp—same as ADR-0012.

## Consequences

### Positive

- Single ADR for current (on-chain) state machines; ADR-0012 remains CEX historical.
- Transaction lifecycle is explicit and receipt-driven; no CEX-specific ACK/fill concepts.
- No separate hedge state machine: position from chain + at most one pending tx keeps the model simple.
- Same rigor (transitions, validation, idempotency, audit) for transactions as before.

### Negative

- Two ADRs to read if comparing CEX vs on-chain (0012 vs 0032).

## References

- [ADR-0012: State Machines for Order and Position Lifecycle](0012-state-machines.md) — Superseded; CEX order lifecycle and pattern origins
- [ADR-0031: Bot Architecture (On-Chain)](0031-bot-architecture-on-chain.md) — Execution queue and reconciler
- [ADR-0020: Contract Interaction Patterns](0020-contract-interaction-patterns.md) — Build, simulate, send, confirm
- [ADR-0026: On-Chain Execution Safety](0026-on-chain-execution-safety.md) — Simulation, revert, timeout policy
