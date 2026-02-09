---
name: Serial Execution Queue
overview: Implement a single-job-at-a-time queue with job status tracking and cancellation support.
todos:
  - id: single-job-queue
    content: Implement single-job-at-a-time queue
    status: completed
  - id: job-status-tracking
    content: Implement job status tracking (pending, running, completed, failed)
    status: completed
  - id: job-cancellation
    content: Implement job cancellation support
    status: completed
isProject: false
---

> **Note**: This plan is part of Phase 1 (Foundation) in [MVP Roadmap](../../../active/0001-mvp-roadmap/README.md).

# Serial Execution Queue

## Overview

Implement a serial execution queue that ensures only one job runs at a time. This is critical for trading operations to prevent race conditions and ensure order execution happens sequentially.

**Decision**: Use `p-queue` library with a thin wrapper for domain-specific job status tracking. See [ADR-0018](../../../../../adrs/0018-serial-execution-queue.md) for rationale.

## Tasks

### 1. Add p-queue Dependency

```bash
pnpm add p-queue
```

`p-queue` is a battle-tested library (~15M weekly downloads) with zero runtime dependencies, MIT licensed, ~6KB minified.

### 2. Implement Queue with p-queue Wrapper

Create `src/worker/queue.ts`:

```typescript
import PQueue from "p-queue";

export type JobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface JobHandle<T> {
  id: string;
  promise: Promise<T>;
  cancel: () => void;
  getStatus: () => JobStatus;
}

export interface SerialQueue {
  enqueue: <T>(fn: (signal: AbortSignal) => Promise<T>, id?: string) => JobHandle<T>;
  getStatus: (id: string) => JobStatus | null;
  getPendingCount: () => number;
  cancelAll: () => void;
  waitForIdle: () => Promise<void>;
}

export const createSerialQueue = (): SerialQueue => {
  const queue = new PQueue({ concurrency: 1 });
  const jobs = new Map<string, JobStatus>();
  const abortControllers = new Map<string, AbortController>();

  // Implementation wraps p-queue with job status tracking
  // Jobs receive AbortSignal for cancellation support
  // Status transitions: pending → running → completed/failed/cancelled
};
```

Key features:
- **Serial execution**: `concurrency: 1` ensures one job at a time
- **AbortController support**: Can cancel running jobs (critical improvement over custom)
- **Job status tracking**: Domain-specific wrapper tracks status transitions
- **Graceful shutdown**: `waitForIdle()` for clean shutdown

### 3. Write Comprehensive Tests

Create `src/worker/queue.test.ts`:
- Serial execution (only one job at a time)
- FIFO ordering
- Job status transitions
- Cancellation (pending and running jobs)
- `waitForIdle()` behavior
- Error handling
- AbortSignal integration

## File Structure

```
src/worker/
├── queue.ts
└── queue.test.ts
```

## Dependencies

- `p-queue` - Battle-tested serial execution queue library

## Validation

- [x] Only one job executes at a time
- [x] Jobs execute in FIFO order
- [x] Job status transitions correctly (pending → running → completed/failed)
- [x] Pending jobs can be cancelled
- [x] Running jobs can be cancelled (via AbortSignal)
- [x] Queue handles errors gracefully
- [x] Status queries return accurate information
- [x] `waitForIdle()` works correctly for graceful shutdown

## Benefits Over Custom Implementation

- **AbortController support**: Can cancel running jobs (not possible in original plan)
- **Battle-tested**: ~15M weekly downloads, edge cases handled
- **Less code**: ~40 lines wrapper vs. ~100 lines custom queue
- **Timeout support**: Built-in per-job timeouts if needed
- **Pause/resume**: Built-in if needed later

## References

- [MVP Roadmap](../../../active/0001-mvp-roadmap/README.md)
- [ADR-0001: Bot Architecture](../../../../../adrs/0001-bot-architecture.md)
- [ADR-0018: Serial Execution Queue](../../../../../adrs/0018-serial-execution-queue.md) - Decision to use p-queue
- [ADR-0017: Task Scheduler](../../../../../adrs/0017-task-scheduler.md) - Periodic tasks (different use case)
