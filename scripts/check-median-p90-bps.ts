/**
 * Phase 0 criteria check: viability of strategy from execution_estimate data.
 *
 * Connects to DB, computes impact distribution per market (median, p90), and
 * evaluates go/no-go (median < 3 bps, p90 < 8 bps per ADR-0022/0025).
 *
 * Usage:
 *   DATABASE_URL=postgresql://... pnpm run check-phase0
 *   pnpm run check-phase0 -- --since-days=7
 *
 * Requires DATABASE_URL in env or .env (loaded from src/scripts/.env). Exit codes: 0 = pass,
 * 1 = criteria not met, 2 = error (missing DATABASE_URL, DB failure, or no data).
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";

import { type DatabaseInstance, createDatabase } from "@/lib/db";
import { evaluateGoNoGo, getImpactDistributions } from "@/worker/impact-analysis";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, ".env") });

const DEFAULT_SINCE_DAYS = 7;

const parseSinceDays = (): number => {
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--since-days=")) {
      const value = Number.parseInt(arg.slice("--since-days=".length), 10);
      if (Number.isNaN(value) || value < 1) return DEFAULT_SINCE_DAYS;
      return value;
    }
  }
  return DEFAULT_SINCE_DAYS;
};

const main = async (): Promise<void> => {
  const env = process.env as { DATABASE_URL?: string };
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("Error: DATABASE_URL is required (set in env or src/scripts/.env).");
    process.exit(2);
  }

  const sinceDays = parseSinceDays();
  let db: DatabaseInstance | null = null;

  try {
    db = await createDatabase(databaseUrl);

    const distributions = await getImpactDistributions(db.db, {
      sinceDaysAgo: sinceDays,
    });

    if (distributions.length === 0) {
      console.error(`Error: No execution_estimate data in the last ${sinceDays} day(s).`);
      process.exit(2);
    }

    const result = evaluateGoNoGo(distributions);

    for (const m of result.markets) {
      const status = m.medianPassed && m.p90Passed ? "PASS" : "FAIL";
      console.log(
        `${m.market}: median ${m.distribution.medianBps.toString()} bps, p90 ${m.distribution.p90Bps.toString()} bps, samples ${m.distribution.sampleCount} — ${status}`,
      );
    }

    console.log(result.passed ? "Overall: PASS" : "Overall: FAIL");
    process.exit(result.passed ? 0 : 1);
  } catch (err) {
    console.error("Error:", err instanceof Error ? err.message : String(err));
    process.exit(2);
  } finally {
    if (db) await db.close();
  }
};

void main();
