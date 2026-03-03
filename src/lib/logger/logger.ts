import { type WriteStream, createWriteStream, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { getConfig } from "../config";

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

/** Replacer so JSON.stringify serializes bigint as string (JSON does not support bigint). */
const customReplacerFn = (_key: string, value: unknown): unknown =>
  typeof value === "bigint" ? value.toString() : value;

const formatLog = (entry: LogEntry): string => {
  const config = getConfig();
  if (config.server.nodeEnv === "development") {
    const contextStr = entry.context ? ` ${JSON.stringify(entry.context, customReplacerFn)}` : "";
    const errorLine = entry.error ? ` — ${entry.error.name}: ${entry.error.message}` : "";
    const stackStr = entry.error?.stack ? `\n${entry.error.stack}` : "";
    return `${entry.timestamp} [${entry.level.toUpperCase()}] ${entry.message}${contextStr}${errorLine}${stackStr}`;
  }
  return JSON.stringify(entry, customReplacerFn);
};

export interface Logger {
  debug: (message: string, context?: Record<string, unknown>) => void;
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, error?: Error, context?: Record<string, unknown>) => void;
}

export const createLogger = (loggerConfig?: LoggerConfig): Logger => {
  const config = getConfig();
  const level = loggerConfig?.level ?? config.logging.level;
  return {
    debug: (message: string, context?: Record<string, unknown>): void => {
      if (shouldLog("debug", level)) {
        console.log(formatLog(createLogEntry("debug", message, context)));
      }
    },

    info: (message: string, context?: Record<string, unknown>): void => {
      if (shouldLog("info", level)) {
        console.log(formatLog(createLogEntry("info", message, context)));
      }
    },

    warn: (message: string, context?: Record<string, unknown>): void => {
      if (shouldLog("warn", level)) {
        console.warn(formatLog(createLogEntry("warn", message, context)));
      }
    },

    error: (message: string, error?: Error, context?: Record<string, unknown>): void => {
      if (shouldLog("error", level)) {
        console.error(formatLog(createLogEntry("error", message, context, error)));
      }
    },
  };
};

// Log rotation utility
const LOG_DIR = "logs";

export const createRotatingLogStream = (): WriteStream => {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }

  const logFile = join(LOG_DIR, `app-${Date.now()}.log`);
  return createWriteStream(logFile, { flags: "a" });
};
