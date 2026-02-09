# ADR 0018: Serial Execution Queue Implementation

- **Status:** Accepted
- **Date:** 2026-02-04
- **Owners:** -
- **Related:**
  - [ADR-0001: Bot Architecture](0001-bot-architecture.md)
  - [ADR-0017: Task Scheduler Implementation](0017-task-scheduler.md)

## Context

The bot requires a serial execution queue for trading operations (ENTER_HEDGE, EXIT_HEDGE) to:
- **Prevent race conditions** - Ensure only one trading action executes at a time
- **Ensure idempotency** - Make it safe to retry or replay operations
- **Enable clean audit logs** - Single execution path for all trading actions
- **Prevent double-trading disasters** - Critical safety mechanism

According to ADR-0001, all trading actions must go through one serialized queue. This is separate from the scheduler (ADR-0017), which handles periodic tasks like evaluation loops and data refresh.

## Decision

**Use `p-queue` library with a thin wrapper for domain-specific job status tracking.**

### Why p-queue Over Custom Implementation

We evaluated rolling our own serial queue vs. using an existing library:

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Custom implementation** | Full control, zero dependencies | ~100 lines of queue mechanics, edge cases to handle, no AbortController support | ❌ Reinventing the wheel |
| **p-queue** | Battle-tested (~15M weekly downloads), AbortController support, timeout support, pause/resume, ~40 lines wrapper | Adds npm dependency | ✅ Best fit |

**Key insight**: `p-queue` is a pure TypeScript library with zero runtime dependencies (no Redis/MongoDB). It's MIT licensed, ~6KB minified, and handles all the queue mechanics we need. We only need to add a thin wrapper for job status tracking, which is domain-specific.

### Comparison with ADR-0017

| Aspect | Scheduler (ADR-0017) | Queue (This ADR) |
|--------|---------------------|------------------|
| **Purpose** | Periodic tasks (every N ms) | One-off jobs (execute once) |
| **Use case** | Evaluation loop, funding refresh, reconciliation | ENTER_HEDGE, EXIT_HEDGE operations |
| **Concurrency** | Per-task (same task can't overlap) | Global (only one job total) |
| **Retries** | Built-in exponential backoff | Not needed (handled by caller) |
| **Implementation** | Custom (setInterval + coordination) | p-queue library |

These serve different purposes and complement each other:
- **Scheduler** triggers the evaluation loop every 2s
- **Evaluation** decides to act and enqueues a job
- **Queue** executes the job serially

### Architecture

```typescript
import PQueue from "p-queue";

export type JobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface SerialQueue {
  enqueue: <T>(fn: (signal: AbortSignal) => Promise<T>, id?: string) => JobHandle<T>;
  getStatus: (id: string) => JobStatus | null;
  getPendingCount: () => number;
  cancelAll: () => void;
  waitForIdle: () => Promise<void>;
}
```

### Core Features

#### 1. Serial Execution

`p-queue` with `concurrency: 1` ensures only one job runs at a time:

```typescript
const queue = new PQueue({ concurrency: 1 });
```

#### 2. AbortController Support

Jobs receive an `AbortSignal` and can be cancelled even while running:

```typescript
const job = queue.enqueue(async (signal) => {
  // Check signal.aborted periodically
  if (signal.aborted) {
    throw new Error("Job cancelled");
  }
  // ... execute trading action
});

// Later: job.cancel(); // Cancels even if running
```

This is a critical improvement over a custom implementation, which couldn't cancel running jobs.

#### 3. Job Status Tracking

Thin wrapper tracks domain-specific status:

```typescript
const jobs = new Map<string, JobStatus>();

// Track status transitions: pending → running → completed/failed/cancelled
```

#### 4. Graceful Shutdown

`waitForIdle()` allows running jobs to complete before shutdown:

```typescript
await queue.waitForIdle(); // Wait for all jobs to complete
```

### Implementation Location

```
src/worker/
├── scheduler.ts        # Periodic tasks (ADR-0017)
├── scheduler.test.ts
├── queue.ts            # Serial execution queue (this ADR)
└── queue.test.ts
```

## Consequences

### Positive

- **Battle-tested**: ~15M weekly downloads, edge cases handled
- **AbortController support**: Can cancel running jobs (critical for trading)
- **Less code**: ~40 lines wrapper vs. ~100 lines custom queue
- **Timeout support**: Built-in per-job timeouts if needed
- **Pause/resume**: Built-in if needed later
- **Zero runtime dependencies**: No Redis/MongoDB, pure TypeScript

### Negative

- **Adds npm dependency**: `p-queue` (~6KB minified)
  - **Mitigation**: This is acceptable - we already have dependencies (valibot, drizzle-orm). The "zero dependencies" principle applies to runtime dependencies (Redis/MongoDB), not npm packages.

### Risks

- **Library maintenance**: What if `p-queue` stops being maintained?
  - **Mitigation**: Library is stable, MIT licensed, can fork if needed. Risk is low.
- **AbortSignal not checked**: Jobs must check `signal.aborted` to respect cancellation
  - **Mitigation**: Document requirement, add examples in code comments

## Future Considerations

If scaling beyond single-process MVP:

1. **Distributed queue**: Consider BullMQ for multi-instance coordination
2. **Job persistence**: Add job persistence for crash recovery
3. **Priority queue**: `p-queue` supports priorities if needed
4. **Rate limiting**: `p-queue` supports rate limiting if needed

For MVP, `p-queue` is the right choice - battle-tested, simple, and provides all features we need.

## References

- [ADR-0001: Bot Architecture](0001-bot-architecture.md) - Overall bot design, serial queue requirement
- [ADR-0017: Task Scheduler Implementation](0017-task-scheduler.md) - Periodic tasks (different use case)
- [p-queue GitHub](https://github.com/sindresorhus/p-queue) - Library documentation
- [Serial Queue Plan](../plans/implemented/0001-mvp-roadmap/01-foundation/0007-serial-execution-queue.md) - Implementation details
