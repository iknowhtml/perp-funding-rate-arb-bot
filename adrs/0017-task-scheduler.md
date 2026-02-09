# ADR 0017: Task Scheduler Implementation

- **Status:** Accepted
- **Date:** 2026-02-04
- **Owners:** -
- **Related:**
  - [ADR-0001: Bot Architecture](0001-bot-architecture.md)

## Context

The bot requires periodic task execution for:
- **Evaluation loop**: Run decision pipeline every 2 seconds
- **Funding rate refresh**: Poll latest funding rates every 30 seconds
- **Account reconciliation**: Verify state consistency every 60 seconds
- **Data refresh**: Update market data periodically

These tasks need:
1. **Millisecond precision** - Funding rate windows are time-sensitive
2. **Concurrency control** - Prevent overlapping execution of the same task
3. **Retry logic** - Handle transient API failures with exponential backoff
4. **Graceful cancellation** - Clean shutdown without interrupting running tasks
5. **Zero external dependencies** - Keep MVP simple, no Redis/MongoDB overhead

## Decision

**Implement a custom scheduler using Node.js built-in `setInterval`** wrapped in a coordination layer that handles concurrency, retries, and graceful shutdown.

### Why Custom Over Existing Libraries

We evaluated several Node.js scheduler libraries:

| Library | Concurrency Guard | Retries | External Deps | MS Precision | Verdict |
|---------|------------------|---------|---------------|--------------|---------|
| **BullMQ** | Yes | Yes | Redis | Yes | Overkill for MVP |
| **Agenda** | Yes | Yes | MongoDB | Yes | Overkill for MVP |
| **Bree** | Yes | No | No | Yes | File-based jobs add complexity |
| **Toad-scheduler** | Yes (`preventOverrun`) | No | No | Yes | Still need custom retry logic |
| **Croner** | No | No | No | Yes | Timing only, no coordination |
| **Node Schedule** | No | No | No | Seconds only | Insufficient precision |
| **Cron/Node Cron** | No | No | No | Seconds only | Insufficient precision |

**Key insight**: No single library provides all requirements without external dependencies or unnecessary complexity. The coordination layer (concurrency + retries) is domain-specific and warrants custom implementation.

### Architecture

```typescript
export interface ScheduledTask {
  id: string;
  fn: () => Promise<void>;
  intervalMs: number;
  enabled: boolean;
}

export interface TaskHandle {
  cancel: () => void;
  isRunning: () => boolean;
}

export interface Scheduler {
  schedule: (task: ScheduledTask) => TaskHandle;
  cancelAll: () => void;
  waitForRunning: (timeoutMs?: number) => Promise<void>;
}
```

### Core Features

#### 1. Concurrency Protection

Prevents overlapping execution of the same task:

```typescript
const runningTasks = new Set<string>();

const execute = async (): Promise<void> => {
  if (runningTasks.has(task.id)) {
    return; // Skip if already running
  }
  runningTasks.add(task.id);
  // ... execute task
  runningTasks.delete(task.id);
};
```

#### 2. Retry with Exponential Backoff

Handles transient failures automatically:

```typescript
const executeWithRetry = async (
  fn: () => Promise<void>,
  taskId: string,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): Promise<void> => {
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      await fn();
      return; // Success
    } catch (error) {
      if (attempt < config.maxRetries) {
        const delay = config.retryDelayMs * Math.pow(config.backoffMultiplier, attempt);
        await sleep(delay);
      }
    }
  }
  throw lastError;
};
```

#### 3. Graceful Shutdown

Allows running tasks to complete before shutdown:

```typescript
const waitForRunning = async (timeoutMs = 5000): Promise<void> => {
  const start = Date.now();
  while (runningTasks.size > 0 && Date.now() - start < timeoutMs) {
    await sleep(100);
  }
  if (runningTasks.size > 0) {
    logger.warn(`Some tasks did not complete within timeout`);
  }
};
```

### Implementation Location

```
src/worker/
├── scheduler.ts        # Core scheduler implementation
└── scheduler.test.ts   # Comprehensive tests
```

## Consequences

### Positive

- **Zero external dependencies** - Uses only Node.js built-ins
- **Full control** - Customize behavior for bot's specific needs
- **Lightweight** - No Redis/MongoDB overhead
- **Millisecond precision** - `setInterval` provides exact timing
- **Type-safe** - TypeScript interfaces ensure correctness
- **Testable** - Simple, focused API easy to test

### Negative

- **No persistence** - Tasks lost on restart (acceptable for MVP)
- **Single process** - No distributed scheduling (acceptable for MVP)
- **Custom code** - More code to maintain vs. using a library

### Risks

- **Timer drift**: `setInterval` can drift over long periods
  - **Mitigation**: Reconciler corrects state every 60s, evaluation loop runs frequently (2s)
- **Memory leaks**: If tasks aren't properly cancelled
  - **Mitigation**: `cancelAll()` clears all intervals, `waitForRunning()` ensures cleanup
- **Long-running tasks**: Could block scheduler
  - **Mitigation**: Concurrency guard prevents overlapping runs, tasks should complete quickly

## Future Considerations

If scaling beyond single-process MVP:

1. **Distributed scheduling**: Consider BullMQ or Agenda for multi-instance coordination
2. **Persistence**: Add job persistence for crash recovery
3. **Advanced scheduling**: Cron expressions, timezone support, job dependencies
4. **Monitoring**: Add metrics for task execution times, failure rates, queue depth

For MVP, the custom scheduler is sufficient and keeps the system simple.

## References

- [ADR-0001: Bot Architecture](0001-bot-architecture.md) - Overall bot design
- [Scheduler Plan](../plans/implemented/0001-mvp-roadmap/01-foundation/0006-scheduler.md) - Implementation details
- [Better Stack: Node.js Schedulers Comparison](https://betterstack.com/community/guides/scaling-nodejs/best-nodejs-schedulers/) - Library evaluation
