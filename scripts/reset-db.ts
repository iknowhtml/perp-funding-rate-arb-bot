/**
 * Nuke database: drop all application tables (orders, market_snapshot, execution_estimate).
 * Re-run db:push or db:migrate to recreate schema.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... pnpm run nuke-db -- --yes
 *   pnpm run nuke-db -- --yes
 *
 * Requires DATABASE_URL in env or .env (loaded from src/scripts/.env). Requires --yes to confirm.
 * Exit codes: 0 = success, 2 = error (missing DATABASE_URL, missing --yes, or DB failure).
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";
import { sql } from "drizzle-orm";

import { type DatabaseInstance, createDatabase } from "@/lib/db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, ".env") });

const hasYesFlag = (): boolean =>
  process.argv.slice(2).some((arg) => arg === "--yes" || arg === "-y");

const main = async (): Promise<void> => {
  const env = process.env as { DATABASE_URL?: string };
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("Error: DATABASE_URL is required (set in env or src/scripts/.env).");
    process.exit(2);
  }

  if (!hasYesFlag()) {
    console.error("Error: --yes (or -y) is required to confirm nuke.");
    process.exit(2);
  }

  let db: DatabaseInstance | null = null;

  try {
    db = await createDatabase(databaseUrl);

    await db.db.execute(
      sql`DROP TABLE IF EXISTS orders, market_snapshot, execution_estimate CASCADE`,
    );

    console.log("Database nuked: orders, market_snapshot, execution_estimate dropped.");
    process.exit(0);
  } catch (err) {
    console.error("Error:", err instanceof Error ? err.message : String(err));
    process.exit(2);
  } finally {
    if (db) await db.close();
  }
};

void main();
