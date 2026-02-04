import { env } from "./env/env";

export const config = {
  database: {
    url: env.DATABASE_URL,
  },
  server: {
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
  },
  logging: {
    level: env.LOG_LEVEL ?? (env.NODE_ENV === "production" ? "info" : "debug"),
  },
} as const;
