import { sql } from "drizzle-orm";
import { Hono } from "hono";

import type { Database } from "@/lib/db/client";

const checkDatabase = async (
  db: Database,
): Promise<{ status: "healthy" | "unhealthy"; error?: string }> => {
  try {
    await db.execute(sql`SELECT 1`);
    return { status: "healthy" };
  } catch (error) {
    return {
      status: "unhealthy",
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export const createHealthRoute = (db: Database): Hono => {
  const health = new Hono();

  health.get("/", async (c) => {
    const databaseCheck = await checkDatabase(db);

    const checks = {
      status: databaseCheck.status === "healthy" ? ("healthy" as const) : ("unhealthy" as const),
      timestamp: new Date().toISOString(),
      checks: {
        database: databaseCheck,
      },
    };

    const allHealthy = Object.values(checks.checks).every((check) => check.status === "healthy");

    return c.json(checks, allHealthy ? 200 : 503);
  });

  return health;
};
