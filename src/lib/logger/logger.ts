import { type WriteStream, createWriteStream, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { config } from "../config";

import type { LogLevel } from "./schema";

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

// Export a default logger instance for backward compatibility if needed,
// but prefer createLogger.
export const logger = createLogger();

// Log rotation utility
const LOG_DIR = "logs";

export const createRotatingLogStream = (): WriteStream => {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }

  const logFile = join(LOG_DIR, `app-${Date.now()}.log`);
  return createWriteStream(logFile, { flags: "a" });
};
