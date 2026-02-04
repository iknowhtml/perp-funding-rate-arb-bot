import { serve } from "@hono/node-server";
import { Hono } from "hono";

import type { Database } from "../lib/db/client";
import type { Logger } from "../lib/logger/logger";
import { createHealthRoute } from "./routes/health";
import { incrementMetric, recordDuration } from "./routes/metrics";
import { metrics } from "./routes/metrics";

export interface ServerDeps {
  port: number;
  logger: Logger;
  db: Database;
}

export interface HttpServer {
  port: number;
  close: () => Promise<void>;
}

export const startHttpServer = async (deps: ServerDeps): Promise<HttpServer> => {
  const app = new Hono();

  // Request logging middleware
  app.use("*", async (c, next) => {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;
    deps.logger.info("HTTP request", {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: duration,
    });
    incrementMetric("httpRequestsTotal");
    recordDuration(duration);
  });

  // Routes
  app.get("/", (c) => c.json({ message: "Funding Rate Arb Bot API" }));
  app.route("/health", createHealthRoute(deps.db));
  app.route("/metrics", metrics);

  // Start server
  const server = serve(
    {
      fetch: app.fetch,
      port: deps.port,
    },
    (info) => {
      deps.logger.info(`HTTP server listening on port ${info.port}`);
    },
  );

  return {
    port: deps.port,
    close: async (): Promise<void> => {
      return new Promise<void>((resolve) => {
        server.close(() => {
          deps.logger.info("HTTP server closed");
          resolve();
        });
      });
    },
  };
};
