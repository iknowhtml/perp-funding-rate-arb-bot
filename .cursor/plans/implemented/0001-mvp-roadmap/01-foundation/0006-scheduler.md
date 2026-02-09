---
name: Scheduler
overview: Implement interval-based task scheduling with cancellation, cleanup, and error handling/retry logic.
todos:
  - id: interval-scheduling
    content: Implement interval-based task scheduling
    status: completed
  - id: cancellation-cleanup
    content: Implement task cancellation and cleanup
    status: completed
  - id: error-handling
    content: Implement error handling and retry logic
    status: completed
  - id: create-adr
    content: Create ADR-0017 for scheduler decision
    status: completed
  - id: create-tests
    content: Create comprehensive tests for scheduler
    status: completed
isProject: false
---

> **Note**: This plan is part of Phase 1 (Foundation) in [MVP Roadmap](../../../active/0001-mvp-roadmap/README.md).

# Scheduler

## Overview

Implement a robust task scheduler that supports interval-based execution, graceful cancellation, cleanup, and error handling with retry logic. This will be used for periodic tasks like evaluation loops and reconciliation.

**Decision**: Custom implementation using Node.js `setInterval` with coordination layer for concurrency and retries. See [ADR-0017: Task Scheduler Implementation](../../../../../adrs/0017-task-scheduler.md) for rationale.

## Tasks

### 1. Interval-Based Task Scheduling

Create `src/worker/scheduler.ts`:

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

export const createScheduler = () => {
  const tasks = new Map<string, NodeJS.Timeout>();
  const runningTasks = new Set<string>();

  const schedule = (task: ScheduledTask): TaskHandle => {
    if (!task.enabled) {
      return {
        cancel: () => {},
        isRunning: () => false,
      };
    }

    const execute = async () => {
      if (runningTasks.has(task.id)) {
        return; // Skip if already running
      }

      runningTasks.add(task.id);
      try {
        await task.fn();
      } catch (error) {
        logger.error(`Task ${task.id} failed`, error as Error);
      } finally {
        runningTasks.delete(task.id);
      }
    };

    // Execute immediately, then schedule interval
    execute();
    const intervalId = setInterval(execute, task.intervalMs);
    tasks.set(task.id, intervalId);

    return {
      cancel: () => {
        const id = tasks.get(task.id);
        if (id) {
          clearInterval(id);
          tasks.delete(task.id);
        }
      },
      isRunning: () => runningTasks.has(task.id),
    };
  };

  return { schedule };
};
```

### 2. Task Cancellation and Cleanup

Enhance scheduler with cleanup:

```typescript
export const createScheduler = () => {
  // ... previous code ...

  const cancelAll = () => {
    for (const [id, intervalId] of tasks.entries()) {
      clearInterval(intervalId);
    }
    tasks.clear();
  };

  const waitForRunning = async (timeoutMs = 5000): Promise<void> => {
    const start = Date.now();
    while (runningTasks.size > 0 && Date.now() - start < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (runningTasks.size > 0) {
      logger.warn(`Some tasks did not complete within timeout: ${Array.from(runningTasks)}`);
    }
  };

  return { schedule, cancelAll, waitForRunning };
};
```

### 3. Error Handling and Retry Logic

Add retry logic:

```typescript
interface RetryConfig {
  maxRetries: number;
  retryDelayMs: number;
  backoffMultiplier: number;
}

const defaultRetryConfig: RetryConfig = {
  maxRetries: 3,
  retryDelayMs: 1000,
  backoffMultiplier: 2,
};

const executeWithRetry = async (
  fn: () => Promise<void>,
  config: RetryConfig = defaultRetryConfig,
): Promise<void> => {
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      await fn();
      return; // Success
    } catch (error) {
      lastError = error as Error;
      if (attempt < config.maxRetries) {
        const delay = config.retryDelayMs * Math.pow(config.backoffMultiplier, attempt);
        logger.warn(`Task failed (attempt ${attempt + 1}/${config.maxRetries + 1}), retrying in ${delay}ms`, { error });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError; // All retries exhausted
};
```

## File Structure

```
src/worker/
├── scheduler.ts
└── scheduler.test.ts
```

## Dependencies

- Node.js built-in modules (timers)

## Validation

- [x] Tasks execute at specified intervals
- [x] Tasks can be cancelled individually
- [x] All tasks can be cancelled at once
- [x] Scheduler waits for running tasks to complete
- [x] Errors are caught and logged
- [x] Retry logic works with exponential backoff
- [x] Concurrent execution of the same task is prevented
- [x] Comprehensive test coverage (17 tests covering all functionality)

## References

- [MVP Roadmap](../../../active/0001-mvp-roadmap/README.md)
- [ADR-0001: Bot Architecture](../../../../../adrs/0001-bot-architecture.md)
- [ADR-0017: Task Scheduler Implementation](../../../../../adrs/0017-task-scheduler.md)
