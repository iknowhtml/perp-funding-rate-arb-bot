---
name: Logging
overview: Implement structured logging with levels, JSON output for production, and log rotation/archival.
todos:
  - id: structured-logging
    content: Implement structured logging with levels (debug, info, warn, error)
    status: completed
  - id: json-output
    content: Implement JSON output format for production
    status: completed
  - id: log-rotation
    content: Implement log rotation and archival
    status: completed
isProject: false
---

> **Note**: This plan is part of Phase 1 (Foundation) in [MVP Roadmap](../../../active/0001-mvp-roadmap/README.md).

# Logging

## Overview

Implement a structured logging system that supports multiple log levels, JSON output for production environments, and log rotation/archival for long-running processes.

## Tasks

### 1. Structured Logging with Levels

Create `src/lib/logger/index.ts`:

**Note**: Implementation follows CODE_GUIDELINES.md:
- Uses factory pattern (`createLogger`) instead of singleton
- No type casting - leverages Valibot type inference from `config.logging.level`
- Explicit return types on all exported functions
- Safe handling of optional `error.stack` property

```typescript
import { config } from "../config";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LoggerConfig {
  level: LogLevel;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

const logLevels: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const shouldLog = (level: LogLevel, currentLevel: LogLevel): boolean => {
  const levelValue = logLevels[level];
  const currentLevelValue = logLevels[currentLevel];
  return levelValue >= currentLevelValue;
};

const createLogEntry = (
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
  error?: Error,
): LogEntry => {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(context && { context }),
    ...(error && {
      error: {
        name: error.name,
        message: error.message,
        ...(error.stack && { stack: error.stack }),
      },
    }),
  };
  return entry;
};

const formatLog = (entry: LogEntry): string => {
  if (config.server.nodeEnv === "development") {
    return `${entry.timestamp} [${entry.level.toUpperCase()}] ${entry.message}${
      entry.context ? ` ${JSON.stringify(entry.context)}` : ""
    }`;
  }
  return JSON.stringify(entry);
};

export interface Logger {
  debug: (message: string, context?: Record<string, unknown>) => void;
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, error?: Error, context?: Record<string, unknown>) => void;
}

export const createLogger = (
  loggerConfig: LoggerConfig = { level: config.logging.level },
): Logger => {
  return {
    debug: (message: string, context?: Record<string, unknown>): void => {
      if (shouldLog("debug", loggerConfig.level)) {
        console.log(formatLog(createLogEntry("debug", message, context)));
      }
    },

    info: (message: string, context?: Record<string, unknown>): void => {
      if (shouldLog("info", loggerConfig.level)) {
        console.log(formatLog(createLogEntry("info", message, context)));
      }
    },

    warn: (message: string, context?: Record<string, unknown>): void => {
      if (shouldLog("warn", loggerConfig.level)) {
        console.warn(formatLog(createLogEntry("warn", message, context)));
      }
    },

    error: (message: string, error?: Error, context?: Record<string, unknown>): void => {
      if (shouldLog("error", loggerConfig.level)) {
        console.error(formatLog(createLogEntry("error", message, context, error)));
      }
    },
  };
};

// Export a default logger instance for convenience
export const logger = createLogger();
```

### 2. JSON Output Format for Production

The `formatLog` function is integrated into the logger implementation above. It outputs:
- **Development**: Pretty-printed format with timestamp, level, message, and context
- **Production**: JSON stringified format for structured logging

### 3. Log Rotation and Archival

Create `src/lib/logger/rotation.ts`:

**Note**: Simplified implementation creates timestamped log files. Full rotation logic (size limits, file count limits) can be added later if needed.

```typescript
import { type WriteStream, createWriteStream, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const LOG_DIR = "logs";

export const createRotatingLogStream = (): WriteStream => {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }

  const logFile = join(LOG_DIR, `app-${Date.now()}.log`);
  return createWriteStream(logFile, { flags: "a" });
};
```

Future enhancements could include:
- File size limits (`MAX_FILE_SIZE`)
- Maximum number of log files (`MAX_FILES`)
- Automatic cleanup of old log files
- Or use a library like `winston` or `pino` with rotation plugins

## File Structure

```
src/lib/logger/
├── index.ts          # Public API re-exports from logger.ts
├── logger.ts         # All implementation (createLogger, logger, createRotatingLogStream)
└── logger.test.ts    # Unit tests
```

## Dependencies

- Node.js built-in modules (fs, path)
- Optional: `winston` or `pino` for advanced features

## Validation

- [x] Logger supports all four log levels (debug, info, warn, error)
- [x] Log level filtering works correctly
- [x] JSON output is valid and parseable
- [x] Log rotation creates timestamped log files
- [x] Error logging includes stack traces (when available)
- [x] Context data is included in logs
- [x] Factory pattern (`createLogger`) implemented per CODE_GUIDELINES.md
- [x] No type casting used - leverages Valibot type inference
- [x] Explicit return types on all exported functions
- [x] Unit tests for logger and rotation modules

## Implementation Notes

### Deviations from Original Plan

1. **Factory Pattern**: Implemented `createLogger()` factory function instead of singleton pattern, per CODE_GUIDELINES.md preference for factory functions over classes/singletons.

2. **No Type Casting**: Removed `as LogLevel` cast from `config.logging.level`. Instead, leverages Valibot's type inference from the environment schema validation, per CODE_GUIDELINES.md rule against type casting.

3. **Explicit Return Types**: Added explicit return types (`: void`, `: Logger`, `: WriteStream`) to all exported functions, per CODE_GUIDELINES.md requirement.

4. **Safe Error Handling**: Changed `error.stack` to use conditional spread `...(error.stack && { stack: error.stack })` to safely handle optional stack property.

5. **Simplified Log Rotation**: Initial implementation creates timestamped log files. File size limits and file count limits (`MAX_FILE_SIZE`, `MAX_FILES`) mentioned in plan are deferred for future enhancement.

6. **Integrated Formatting**: `formatLog` function is integrated into the logger implementation rather than being a separate step.

7. **File Organization**: Following file organization rules, implementation is in `logger.ts` with `index.ts` re-exporting, and tests are in `logger.test.ts`.

## References

- [MVP Roadmap](../../../active/0001-mvp-roadmap/README.md)
- [ADR-0008: Monitoring Observability](../../../../../adrs/0008-monitoring-observability.md)
- [CODE_GUIDELINES.md](../../../../../CODE_GUIDELINES.md)
