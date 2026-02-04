import type { DatabaseInstance } from "@/lib/db";
import type { Env } from "@/lib/env";
import type { Logger } from "@/lib/logger";
import { createScheduler } from "./scheduler";

export interface WorkerConfig {
  env: Env;
  db: DatabaseInstance;
  logger: Logger;
}

export interface Worker {
  shutdown: () => Promise<void>;
}

export const startWorker = async (config: WorkerConfig): Promise<Worker> => {
  const { logger } = config;
  const scheduler = createScheduler();

  // TODO: Register scheduled tasks here
  // Example:
  // scheduler.schedule({
  //   id: "fetch-funding-rates",
  //   fn: async () => { /* fetch rates */ },
  //   intervalMs: 60_000,
  //   enabled: true,
  // });

  const shutdown = async (): Promise<void> => {
    logger.info("Worker shutting down...");
    scheduler.cancelAll();
    await scheduler.waitForRunning();
    logger.info("Worker shutdown complete");
  };

  return { shutdown };
};

export * from "./scheduler";
export * from "./queue";
export * from "./websocket";
