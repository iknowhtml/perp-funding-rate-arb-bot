import { logger } from "@/lib/logger";

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

export interface RetryConfig {
  maxRetries: number;
  retryDelayMs: number;
  backoffMultiplier: number;
}

export interface Scheduler {
  schedule: (task: ScheduledTask) => TaskHandle;
  cancelAll: () => void;
  waitForRunning: (timeoutMs?: number) => Promise<void>;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  retryDelayMs: 1000,
  backoffMultiplier: 2,
};

const executeWithRetry = async (
  fn: () => Promise<void>,
  taskId: string,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): Promise<void> => {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      await fn();
      return; // Success
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < config.maxRetries) {
        const delay = config.retryDelayMs * config.backoffMultiplier ** attempt;
        logger.warn(
          `Task ${taskId} failed (attempt ${attempt + 1}/${config.maxRetries + 1}), retrying in ${delay}ms`,
          {
            error: {
              name: lastError.name,
              message: lastError.message,
              stack: lastError.stack,
            },
          },
        );
        await new Promise<void>((resolve) =>
          setTimeout(() => {
            resolve();
          }, delay),
        );
      }
    }
  }

  // All retries exhausted
  if (lastError) {
    throw lastError;
  }
  throw new Error(`Task ${taskId} failed after ${config.maxRetries + 1} attempts`);
};

export const createScheduler = (): Scheduler => {
  const tasks = new Map<string, NodeJS.Timeout>();
  const runningTasks = new Set<string>();

  const schedule = (task: ScheduledTask): TaskHandle => {
    if (!task.enabled) {
      return {
        cancel: (): void => {
          // No-op for disabled tasks
        },
        isRunning: (): boolean => false,
      };
    }

    const execute = async (): Promise<void> => {
      if (runningTasks.has(task.id)) {
        return; // Skip if already running
      }

      runningTasks.add(task.id);
      try {
        await executeWithRetry(task.fn, task.id);
      } catch (error) {
        logger.error(
          `Task ${task.id} failed after retries`,
          error instanceof Error ? error : new Error(String(error)),
        );
      } finally {
        runningTasks.delete(task.id);
      }
    };

    // Execute immediately, then schedule interval
    void execute();
    const intervalId = setInterval(() => {
      void execute();
    }, task.intervalMs);
    tasks.set(task.id, intervalId);

    return {
      cancel: (): void => {
        const id = tasks.get(task.id);
        if (id) {
          clearInterval(id);
          tasks.delete(task.id);
        }
      },
      isRunning: (): boolean => runningTasks.has(task.id),
    };
  };

  const cancelAll = (): void => {
    for (const [, intervalId] of tasks.entries()) {
      clearInterval(intervalId);
    }
    tasks.clear();
  };

  const waitForRunning = async (timeoutMs = 5000): Promise<void> => {
    const start = Date.now();
    while (runningTasks.size > 0 && Date.now() - start < timeoutMs) {
      await new Promise<void>((resolve) =>
        setTimeout(() => {
          resolve();
        }, 100),
      );
    }
    if (runningTasks.size > 0) {
      logger.warn(
        `Some tasks did not complete within timeout: ${Array.from(runningTasks).join(", ")}`,
      );
    }
  };

  return { schedule, cancelAll, waitForRunning };
};
