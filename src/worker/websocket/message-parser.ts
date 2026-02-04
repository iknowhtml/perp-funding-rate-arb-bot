/**
 * Message parser with validation and de-duplication.
 *
 * Features:
 * - Schema validation with valibot
 * - Automatic de-duplication (sequence numbers, trade IDs, etc.)
 * - Type-based routing
 * - Graceful error handling (logs but doesn't crash)
 *
 * @see {@link ../../../../adrs/0001-bot-architecture.md ADR-0001: Bot Architecture}
 */

import { LRUCache } from "lru-cache";
import * as v from "valibot";

export interface MessageHandler<T> {
  /** Valibot schema for validation */
  schema: v.GenericSchema<T>;
  /** Handler function */
  handler: (message: T) => void;
  /** Optional: Extract de-dupe key from message */
  getDedupeKey?: (message: T) => string;
}

export interface MessageParserConfig {
  /** Max size of de-dupe cache (default: 10000) */
  maxDedupeSize?: number;
  /** TTL for de-dupe entries in ms (default: 60000) */
  dedupeTtlMs?: number;
  /** Logger for parse errors */
  logger?: {
    warn: (message: string, context?: Record<string, unknown>) => void;
  };
}

export interface MessageParser {
  /** Register a handler for a message type */
  registerHandler<T>(type: string, handler: MessageHandler<T>): void;
  /** Parse and route a raw message */
  parse(rawMessage: string): void;
  /** Get de-dupe cache stats */
  getDedupeStats(): { size: number; hits: number; misses: number };
  /** Clear de-dupe cache */
  clearDedupeCache(): void;
}

/**
 * Creates a message parser with validation and de-duplication.
 *
 * Features:
 * - Schema validation with valibot
 * - Automatic de-duplication (sequence numbers, trade IDs, etc.)
 * - Type-based routing
 * - Graceful error handling (logs but doesn't crash)
 *
 * Uses `lru-cache` for production-grade de-duplication with TTL and LRU eviction.
 *
 * @example
 * ```typescript
 * const parser = createMessageParser({ logger });
 *
 * parser.registerHandler("ticker", {
 *   schema: TickerSchema,
 *   handler: (ticker) => state.updateTicker(ticker),
 *   getDedupeKey: (t) => `${t.symbol}-${t.timestamp}`,
 * });
 *
 * parser.registerHandler("order", {
 *   schema: OrderUpdateSchema,
 *   handler: (order) => state.updateOrder(order),
 *   getDedupeKey: (o) => `${o.orderId}-${o.updateId}`,
 * });
 *
 * ws.onMessage((data) => parser.parse(data));
 * ```
 */
export const createMessageParser = (config?: MessageParserConfig): MessageParser => {
  const { maxDedupeSize = 10000, dedupeTtlMs = 60000, logger } = config ?? {};

  const handlers = new Map<string, MessageHandler<unknown>>();
  // Use lru-cache for production-grade de-duplication with TTL and LRU eviction
  // Use perf.now to ensure compatibility with fake timers in tests
  const dedupeCache = new LRUCache<string, true>({
    max: maxDedupeSize,
    ttl: dedupeTtlMs,
    perf: {
      now: () => Date.now(),
    },
  });
  let dedupeHits = 0;
  let dedupeMisses = 0;

  const registerHandler = <T>(type: string, handler: MessageHandler<T>): void => {
    handlers.set(type, handler as MessageHandler<unknown>);
  };

  const parse = (rawMessage: string): void => {
    try {
      const data = v.parse(v.unknown(), JSON.parse(rawMessage));

      // Extract message type (exchange-specific)
      const type =
        (data !== null &&
          typeof data === "object" &&
          "type" in data &&
          typeof data.type === "string" &&
          data.type) ||
        (data !== null &&
          typeof data === "object" &&
          "channel" in data &&
          typeof data.channel === "string" &&
          data.channel) ||
        null;

      if (!type) {
        logger?.warn("Message missing type/channel field", { data });
        return;
      }

      const handler = handlers.get(type);
      if (!handler) {
        // No handler registered - not an error, just ignore
        return;
      }

      // Validate with schema
      const result = v.safeParse(handler.schema, data);
      if (!result.success) {
        logger?.warn("Message validation failed", {
          type,
          issues: result.issues,
        });
        return;
      }

      const validatedMessage = result.output;

      // Check de-duplication if key extractor provided
      if (handler.getDedupeKey) {
        const dedupeKey = handler.getDedupeKey(validatedMessage);
        // lru-cache.get() returns undefined if not found or expired
        if (dedupeCache.get(dedupeKey) !== undefined) {
          dedupeHits++;
          return; // Duplicate, skip
        }

        dedupeMisses++;
        // lru-cache automatically handles TTL and LRU eviction
        dedupeCache.set(dedupeKey, true);
      }

      // Call handler
      handler.handler(validatedMessage);
    } catch (error) {
      logger?.warn("Failed to parse message", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const getDedupeStats = (): { size: number; hits: number; misses: number } => {
    // lru-cache automatically evicts expired entries on access
    return {
      size: dedupeCache.size,
      hits: dedupeHits,
      misses: dedupeMisses,
    };
  };

  const clearDedupeCache = (): void => {
    dedupeCache.clear();
    dedupeHits = 0;
    dedupeMisses = 0;
  };

  return {
    registerHandler,
    parse,
    getDedupeStats,
    clearDedupeCache,
  };
};
