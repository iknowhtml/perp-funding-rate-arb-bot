import * as v from "valibot";

import { logLevelSchema } from "../logger/schema";

export const envSchema = v.object({
  // Database
  DATABASE_URL: v.pipe(v.string(), v.minLength(1)),

  // Server
  PORT: v.pipe(v.string(), v.transform(Number), v.number(), v.minValue(1), v.maxValue(65535)),
  NODE_ENV: v.picklist(["development", "production", "test"]),

  // Logging
  LOG_LEVEL: v.optional(v.pipe(v.string(), logLevelSchema)),

  // Coinbase Advanced Trade API (CDP API Keys)
  COINBASE_API_KEY: v.optional(v.string()),
  COINBASE_API_SECRET: v.optional(v.string()),
});

export type Env = v.InferOutput<typeof envSchema>;
