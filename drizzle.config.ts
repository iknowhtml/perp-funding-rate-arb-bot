import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  dialect: "postgresql",
  casing: "snake_case",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5433/funding_rate_arb",
  },
});
