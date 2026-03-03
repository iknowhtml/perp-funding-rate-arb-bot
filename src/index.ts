/**
 * Funding Rate Arbitrage Bot
 *
 * Entry point for the trading bot.
 *
 * @see {@link ../adrs/0001-bot-architecture.md ADR-0001: Bot Architecture}
 */

import "dotenv/config";

import { createDatabase } from "./lib/db";
import { getEnv } from "./lib/env";
import { createLogger } from "./lib/logger";
import { startHttpServer } from "./server";
import { startWorker } from "./worker";

const main = async (): Promise<void> => {
  const logger = createLogger({ level: "info" });

  // Global handlers so fatal errors are logged and the process exits cleanly.
  // uncaughtException: sync throws that escape every try/catch (e.g. at top level).
  // unhandledRejection: Promise rejections with no .catch() or await in try/catch.
  // We log, print stack to stderr for the terminal, then exit(1) so the process
  // can be restarted by the OS or process manager.
  process.on("uncaughtException", (error: unknown) => {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Uncaught exception", err);
    if (err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  });

  process.on("unhandledRejection", (reason: unknown) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    logger.error("Unhandled rejection", err);
    if (err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  });

  logger.info("Funding Rate Arbitrage Bot starting...");

  try {
    // 1. Validate environment configuration
    logger.info("Validating environment configuration...");
    const env = getEnv();
    logger.info("Environment configuration validated");

    // 2. Initialize database connection
    logger.info("Initializing database connection...");
    const db = await createDatabase(env.DATABASE_URL);
    logger.info("Database connection established");

    // 3. Start HTTP server (health checks, metrics)
    logger.info("Starting HTTP server...");
    const httpServer = await startHttpServer({
      port: env.PORT ?? 8080,
      logger,
      db: db.db,
    });
    logger.info(`HTTP server listening on port ${httpServer.port}`);

    // 4. Start worker (trading logic)
    logger.info("Starting worker...");
    const worker = await startWorker({
      env,
      db,
      logger,
    });
    logger.info("Worker started");

    // 5. Setup graceful shutdown
    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`Received ${signal} — initiating graceful shutdown`);

      // Stop worker
      await worker.shutdown();

      // Close HTTP server
      await httpServer.close();

      // Close database connection
      await db.close();

      logger.info("Graceful shutdown complete");
      process.exit(0);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

    logger.info("Bot initialized successfully");
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Fatal error during startup", err);
    if (err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  }
};

main().catch((error) => {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error("Unhandled error:", err.message);
  if (err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
