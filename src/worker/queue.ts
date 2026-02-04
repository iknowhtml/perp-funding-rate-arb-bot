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

  const enqueue = <T>(fn: (signal: AbortSignal) => Promise<T>, id?: string): JobHandle<T> => {
    const jobId = id ?? `job-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const controller = new AbortController();

    jobs.set(jobId, "pending");
    abortControllers.set(jobId, controller);

    const promise = queue
      .add(
        async () => {
          if (controller.signal.aborted) {
            jobs.set(jobId, "cancelled");
            throw new Error(`Job ${jobId} was cancelled`);
          }

          jobs.set(jobId, "running");
          try {
            const result = await fn(controller.signal);
            jobs.set(jobId, "completed");
            return result;
          } catch (error) {
            if (controller.signal.aborted) {
              jobs.set(jobId, "cancelled");
            } else {
              jobs.set(jobId, "failed");
            }
            throw error;
          } finally {
            abortControllers.delete(jobId);
          }
        },
        { signal: controller.signal },
      )
      .catch((error) => {
        // Handle cancellation errors gracefully
        if (error.name === "AbortError" || controller.signal.aborted) {
          jobs.set(jobId, "cancelled");
        }
        throw error;
      });

    return {
      id: jobId,
      promise,
      cancel: () => {
        const status = jobs.get(jobId);
        if (status === "pending" || status === "running") {
          controller.abort();
          jobs.set(jobId, "cancelled");
        }
      },
      getStatus: () => jobs.get(jobId) ?? "pending",
    };
  };

  const getStatus = (id: string): JobStatus | null => {
    return jobs.get(id) ?? null;
  };

  const getPendingCount = (): number => {
    return queue.size + (queue.pending > 0 ? 1 : 0);
  };

  const cancelAll = (): void => {
    for (const [id, controller] of abortControllers.entries()) {
      const status = jobs.get(id);
      if (status === "pending" || status === "running") {
        controller.abort();
        jobs.set(id, "cancelled");
      }
    }
    queue.clear();
  };

  const waitForIdle = async (): Promise<void> => {
    await queue.onIdle();
  };

  return {
    enqueue,
    getStatus,
    getPendingCount,
    cancelAll,
    waitForIdle,
  };
};
