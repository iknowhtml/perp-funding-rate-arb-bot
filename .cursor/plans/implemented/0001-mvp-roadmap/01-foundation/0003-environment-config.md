---
name: Environment Configuration
overview: Implement environment variable validation and configuration loading using Valibot schemas per ADR-0003.
todos:
  - id: valibot-schema
    content: Create Valibot schema for environment variables
    status: completed
  - id: validation-startup
    content: Implement environment variable validation at startup
    status: completed
  - id: config-loading
    content: Implement configuration loading and validation
    status: completed
  - id: update-env-example
    content: Add DATABASE_URL to .env.example
    status: completed
isProject: false
---

> **Note**: This plan is part of Phase 1 (Foundation) in [MVP Roadmap](../../../active/0001-mvp-roadmap/README.md).

# Environment Configuration

## Overview

Implement type-safe environment variable validation and configuration loading using Valibot schemas. This ensures all required environment variables are present and correctly typed at application startup.

## Tasks

### 1. Create Valibot Schema for Environment Variables

Create `src/lib/env/schema.ts`:

```typescript
import * as v from "valibot";

export const envSchema = v.object({
  // Database
  DATABASE_URL: v.pipe(v.string(), v.minLength(1)),
  
  // Server
  PORT: v.pipe(v.string(), v.transform(Number), v.number(), v.minValue(1), v.maxValue(65535)),
  NODE_ENV: v.picklist(["development", "production", "test"]),
  
  // Logging
  LOG_LEVEL: v.pipe(
    v.string(),
    v.picklist(["debug", "info", "warn", "error"]),
    v.optional(),
  ),
});

export type Env = v.InferInput<typeof envSchema>;
```

### 2. Environment Variable Validation at Startup

Create `src/lib/env/index.ts`:

```typescript
import * as v from "valibot";
import { envSchema, type Env } from "./schema";

const parseEnv = (): Env => {
  try {
    return v.parse(envSchema, process.env);
  } catch (error) {
    if (v.isValiError(error)) {
      console.error("Environment variable validation failed:");
      for (const issue of error.issues) {
        console.error(`  - ${issue.path?.map(String).join(".")}: ${issue.message}`);
      }
      process.exit(1);
    }
    throw error;
  }
};

export const env = parseEnv();
```

### 3. Configuration Loading and Validation

Create `src/lib/config/index.ts`:

```typescript
import { env } from "../env";

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
```

### 4. Add DATABASE_URL to `.env.example`

Update `.env.example`:

```bash
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/funding_rate_arb

# Server
PORT=3000
NODE_ENV=development

# Logging
LOG_LEVEL=debug
```

## File Structure

```
src/lib/env/
├── schema.ts      # Valibot schema definition
├── index.ts       # Environment parsing and validation
└── index.test.ts  # Unit tests
```

## Dependencies

- Valibot (per ADR-0003)

## Validation

- [x] Environment schema validates all required variables
- [x] Application fails fast with clear error messages on invalid env vars
- [x] Configuration is type-safe and accessible throughout the app
- [x] `.env.example` includes all required variables with examples
- [x] Unit tests verify validation logic

## References

- [MVP Roadmap](../../../active/0001-mvp-roadmap/README.md)
- [ADR-0003: Validation Strategy](../../../../../adrs/0003-validation-strategy.md)
- [Valibot Documentation](https://valibot.dev/)
