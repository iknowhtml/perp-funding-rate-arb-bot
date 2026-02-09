---
name: WebSocket Management
overview: Implement robust WebSocket connection management with automatic reconnection, health monitoring, and production-grade error handling.
todos:
  - id: connection-manager
    content: Implement WebSocket connection manager with ws library, single-flight connect, and close-code policies
    status: completed
  - id: message-queue
    content: Implement bounded inbound message queue with backpressure control
    status: completed
  - id: message-parsing
    content: Implement message parsing, validation, and de-duplication
    status: completed
  - id: health-monitoring
    content: Implement per-stream health monitoring with expected-silence support
    status: completed
  - id: tests
    content: Add unit tests for WebSocket management
    status: completed
  - id: lifecycle-management
    content: Move plan to implemented/ directory after completion (update todos, check validation boxes, update roadmap link, move file, delete from active/)
    status: completed
isProject: false
---

> **Note**: This plan is part of Phase 2 (Connectivity) in [MVP Roadmap](../../../active/0001-mvp-roadmap/README.md).

# WebSocket Management

## Overview

Implement a production-grade WebSocket management layer that handles connection lifecycle, message parsing, health monitoring, and automatic reconnection. This provides a foundation for real-time data streams from exchanges.

**Build vs Buy Decision** (per distinguished Node engineer review):

| Component | Decision | Rationale |
|-----------|----------|-----------|
| WS connection + reconnect + ping/pong | **Use `ws` library** | Production WS behavior is gnarly (close codes, half-open TCP, backpressure, reconnect races) |
| Message parsing/validation | **Roll our own** | Exchange message shapes are custom; valibot is fine |
| Health monitoring | **Roll our own** | Needs to be domain-aware ("stale ticker" vs "stale order updates") |
| Backoff | **Reuse existing** | Already standard in `src/lib/rate-limiter/backoff.ts` |

## Design Decisions

### Why `ws` Over Native WebSocket API

Node's built-in WebSocket support exists, but for production bots `ws` is preferred because:
- Battle-tested across Node versions
- Better control over ping/pong, permessage-deflate, timeouts
- Known production behaviors for long-running processes
- Exchange SDKs and examples use `ws`

### Key Production Concerns Addressed

1. **Resubscription + Replay**: Reconnect is not enough—need re-auth + re-subscribe + catch-up sync
2. **Duplicate Messages**: On reconnect, feeds may replay; need idempotency/de-dupe
3. **Backpressure**: If parser is slower than inbound, can OOM; need bounded queue
4. **Heartbeat Variance**: Exchanges differ (WS-level ping, app-level ping, per-channel)
5. **Reconnect Races**: Multiple timers can fire; need single-flight connect + generationId
6. **Close Code Policies**: Auth failure vs rate limit vs network blip need different handling

## Tasks

### 1. WebSocket Connection Manager

Create `src/worker/websocket/websocket.ts`:

```typescript
import WebSocket from "ws";
import { calculateBackoffMs, type BackoffConfig } from "@/lib/rate-limiter/backoff";

export type WebSocketState = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "RECONNECTING";

/**
 * Close code categories for policy-based handling.
 */
export type CloseCategory = "AUTH_FAILURE" | "RATE_LIMITED" | "NORMAL" | "UNKNOWN";

/**
 * Classifies WebSocket close codes for policy decisions.
 * 
 * @see https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent/code
 */
export const classifyCloseCode = (code: number): CloseCategory => {
  // Auth failures - don't retry forever
  if (code === 4401 || code === 4403 || code === 1008) return "AUTH_FAILURE";
  // Rate limited - back off more aggressively
  if (code === 4429 || code === 1013) return "RATE_LIMITED";
  // Normal closures - standard backoff
  if (code === 1000 || code === 1001 || code === 1006) return "NORMAL";
  return "UNKNOWN";
};

export interface WebSocketConfig {
  /** WebSocket URL */
  url: string;
  /** Subprotocols */
  protocols?: string[];
  /** Reconnection configuration */
  reconnect?: {
    enabled: boolean;
    maxAttempts: number;
    /** Max attempts for auth failures (should be lower) */
    maxAuthFailureAttempts?: number;
    backoffConfig?: BackoffConfig;
    /** More aggressive backoff for rate limits */
    rateLimitBackoffConfig?: BackoffConfig;
  };
  /** Heartbeat/ping configuration */
  heartbeat?: {
    enabled: boolean;
    intervalMs: number;
    timeoutMs: number;
    /** App-level ping message (if exchange requires it) */
    pingMessage?: string | (() => string);
  };
}

export interface WebSocketManager {
  /** Connect to WebSocket (single-flight) */
  connect(): Promise<void>;
  /** Disconnect and cancel pending reconnects */
  disconnect(): Promise<void>;
  /** Send message (queued if not connected) */
  send(message: string | object): void;
  /** Get current state */
  getState(): WebSocketState;
  /** Get connection generation (for stale event detection) */
  getGeneration(): number;
  
  // Event handlers
  /** Called when connected (use for re-auth + re-subscribe) */
  onConnected(handler: () => Promise<void>): () => void;
  /** Called when disconnected */
  onDisconnected(handler: (code: number, reason: string, category: CloseCategory) => void): () => void;
  /** Called for each inbound message (raw) */
  onMessage(handler: (data: unknown, generation: number) => void): () => void;
  /** Called on state change */
  onStateChange(handler: (state: WebSocketState) => void): () => void;
  /** Called on error */
  onError(handler: (error: Error) => void): () => void;
}

/**
 * Creates a production-grade WebSocket manager.
 * 
 * Key features:
 * - Single-flight connect (prevents reconnect races)
 * - Generation ID for stale event detection
 * - Close-code aware reconnection policies
 * - Lifecycle hooks for re-auth/re-subscribe
 * 
 * @example
 * ```typescript
 * const ws = createWebSocketManager({
 *   url: "wss://stream.exchange.com/ws",
 *   reconnect: { enabled: true, maxAttempts: 10 },
 * });
 * 
 * ws.onConnected(async () => {
 *   await authenticate();
 *   await subscribe(["ticker", "orders"]);
 * });
 * 
 * ws.onMessage((data, generation) => {
 *   if (generation !== ws.getGeneration()) return; // Stale
 *   messageQueue.enqueue(data);
 * });
 * 
 * await ws.connect();
 * ```
 */
export const createWebSocketManager = (config: WebSocketConfig): WebSocketManager => {
  // Implementation with:
  // - Single connectPromise to prevent races
  // - Monotonic generationId for stale event detection
  // - Close-code based policy selection
  // - Proper cleanup on disconnect
};
```

### 2. Bounded Message Queue

Create `src/worker/websocket/message-queue.ts`:

```typescript
import PQueue from "p-queue";

export interface MessageQueueConfig {
  /** Max concurrent message processing (default: 1) */
  concurrency?: number;
  /** Max queued messages before dropping (default: 1000) */
  maxQueueSize?: number;
  /** Called when messages are dropped due to backpressure */
  onDrop?: (dropped: number) => void;
}

export interface MessageQueue<T> {
  /** Enqueue a message for processing */
  enqueue(message: T): boolean;
  /** Get current queue size */
  getQueueSize(): number;
  /** Get total dropped messages */
  getDroppedCount(): number;
  /** Wait for queue to drain */
  waitForIdle(): Promise<void>;
  /** Clear the queue */
  clear(): void;
}

/**
 * Creates a bounded message queue with backpressure control.
 * 
 * Prevents OOM if parser is slower than inbound messages.
 * Drops oldest messages when queue is full (configurable policy).
 * 
 * @example
 * ```typescript
 * const queue = createMessageQueue<unknown>({
 *   concurrency: 1,
 *   maxQueueSize: 500,
 *   onDrop: (n) => logger.warn("Dropped messages due to backpressure", { count: n }),
 * });
 * 
 * ws.onMessage((data) => {
 *   queue.enqueue(data);
 * });
 * ```
 */
export const createMessageQueue = <T>(
  handler: (message: T) => Promise<void> | void,
  config?: MessageQueueConfig,
): MessageQueue<T> => {
  // Implementation using p-queue with bounded size
};
```

### 3. Message Parsing and Validation

Create `src/worker/websocket/message-parser.ts`:

```typescript
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
  // Implementation with LRU cache for de-duplication
};
```

### 4. Per-Stream Health Monitoring

Create `src/worker/websocket/health-monitor.ts`:

```typescript
export type StreamId = string;

export interface StreamConfig {
  /** Expected message interval (e.g., 1000ms for chatty ticker) */
  expectedIntervalMs: number;
  /** Time before considering stale (should be > expectedIntervalMs) */
  staleThresholdMs: number;
  /** If true, silence is expected (e.g., order updates when no orders) */
  allowSilence?: boolean;
}

export interface HealthMonitorConfig {
  /** Per-stream configuration */
  streams: Record<StreamId, StreamConfig>;
  /** Callback when any stream becomes unhealthy */
  onUnhealthy: (streamId: StreamId, lastMessageMs: number | null) => void;
  /** Callback when stream recovers */
  onRecovered?: (streamId: StreamId) => void;
  /** Check interval (default: 5000ms) */
  checkIntervalMs?: number;
}

export interface HealthMonitor {
  /** Record a message for a stream */
  recordMessage(streamId: StreamId): void;
  /** Record a pong (WS-level) */
  recordPong(): void;
  /** Check if a specific stream is healthy */
  isStreamHealthy(streamId: StreamId): boolean;
  /** Check if all required streams are healthy */
  isHealthy(): boolean;
  /** Get health status for all streams */
  getStatus(): Record<StreamId, { healthy: boolean; lastMessageMs: number | null }>;
  /** Start monitoring */
  start(): void;
  /** Stop monitoring */
  stop(): void;
}

/**
 * Creates a per-stream health monitor.
 * 
 * Unlike a simple "any message = healthy" approach, this tracks:
 * - Per-stream staleness (ticker vs order feed have different expectations)
 * - Expected silence channels (order updates are quiet when no orders)
 * - WS-level pong responses
 * 
 * @example
 * ```typescript
 * const health = createHealthMonitor({
 *   streams: {
 *     ticker: { expectedIntervalMs: 1000, staleThresholdMs: 5000 },
 *     orders: { expectedIntervalMs: 60000, staleThresholdMs: 120000, allowSilence: true },
 *   },
 *   onUnhealthy: (stream) => {
 *     logger.warn("Stream unhealthy", { stream });
 *     if (stream === "ticker") ws.reconnect();
 *   },
 * });
 * 
 * parser.registerHandler("ticker", {
 *   handler: (t) => {
 *     health.recordMessage("ticker");
 *     // ...
 *   },
 * });
 * ```
 */
export const createHealthMonitor = (config: HealthMonitorConfig): HealthMonitor => {
  // Implementation with per-stream tracking
};
```

## File Structure

```
src/worker/websocket/
├── websocket.ts           # WebSocket connection manager (uses ws library)
├── websocket.test.ts      # Connection manager tests
├── message-queue.ts       # Bounded inbound message queue
├── message-queue.test.ts
├── message-parser.ts      # Message parsing, validation, de-dupe
├── message-parser.test.ts
├── health-monitor.ts      # Per-stream health monitoring
├── health-monitor.test.ts
└── index.ts               # Re-exports
```

## Dependencies

```bash
pnpm add ws lru-cache
pnpm add -D @types/ws
```

**Note**: `p-queue` is already in the project (used by `src/worker/queue.ts`).

## Integration Pattern

```typescript
// Example: Exchange WebSocket client
const createExchangeWsClient = (config: ExchangeConfig) => {
  const ws = createWebSocketManager({
    url: config.wsUrl,
    reconnect: { enabled: true, maxAttempts: 10 },
    heartbeat: { enabled: true, intervalMs: 30000, timeoutMs: 10000 },
  });

  const parser = createMessageParser({ logger });
  const queue = createMessageQueue<unknown>(
    (msg) => parser.parse(JSON.stringify(msg)),
    { maxQueueSize: 500, onDrop: (n) => logger.warn("Dropped messages", { n }) },
  );

  const health = createHealthMonitor({
    streams: {
      ticker: { expectedIntervalMs: 1000, staleThresholdMs: 5000 },
      orders: { expectedIntervalMs: 60000, staleThresholdMs: 120000, allowSilence: true },
    },
    onUnhealthy: (stream) => {
      if (!health.isHealthy()) {
        // Trigger reconnect or alert
      }
    },
  });

  // Lifecycle hooks
  ws.onConnected(async () => {
    await authenticate(ws);
    await subscribe(ws, ["ticker", "orders"]);
    // Catch-up REST sync for missed events
    await syncState();
  });

  ws.onMessage((data, generation) => {
    if (generation !== ws.getGeneration()) return; // Stale event
    queue.enqueue(data);
  });

  return { ws, parser, queue, health };
};
```

## Validation

- [x] WebSocket connects using `ws` library
- [x] Single-flight connect prevents race conditions
- [x] Close codes are classified correctly (auth/rate-limit/normal)
- [x] Reconnection uses appropriate backoff per close category
- [x] Auth failures halt after max attempts (with alert)
- [x] onConnected hook fires on every connect (including reconnects)
- [x] Message queue enforces bounds and drops when full
- [x] Parser validates with valibot and doesn't crash on invalid
- [x] De-duplication prevents duplicate message processing
- [x] Health monitor tracks per-stream staleness
- [x] Expected-silence streams don't trigger false unhealthy
- [x] Generation ID prevents stale events from mutating state
- [x] Unit tests pass (40/40 tests passing for message-queue, message-parser, health-monitor)

## Implementation Context

> **For Composer**: This section provides the exact patterns, types, and examples to follow during implementation.

### Code Patterns

**Factory Pattern** (MUST follow):
All modules use `createX(config)` returning an interface. See existing examples:

```typescript
// Pattern from src/lib/rate-limiter/circuit-breaker.ts
export const createCircuitBreaker = (
  config: CircuitBreakerConfig = DEFAULT_CIRCUIT_BREAKER_CONFIG,
): CircuitBreaker => {
  // Internal state
  const stateChangeListeners = new Set<(state: CircuitBreakerState) => void>();
  
  // Return interface implementation
  return {
    execute,
    getState,
    isOpen,
    reset,
    onStateChange,
  };
};
```

```typescript
// Pattern from src/worker/queue.ts
export const createSerialQueue = (): SerialQueue => {
  const queue = new PQueue({ concurrency: 1 });
  const jobs = new Map<string, JobStatus>();
  const abortControllers = new Map<string, AbortController>();

  const enqueue = <T>(fn: (signal: AbortSignal) => Promise<T>, id?: string): JobHandle<T> => {
    // Implementation
  };

  return { enqueue, getStatus, getPendingCount, cancelAll, waitForIdle };
};
```

**Event Handler Pattern** (return unsubscribe function):
```typescript
// Pattern from circuit-breaker.ts
const onStateChange = (callback: (state: CircuitBreakerState) => void): (() => void) => {
  stateChangeListeners.add(callback);
  return () => {
    stateChangeListeners.delete(callback);
  };
};
```

**Constants as SCREAMING_SNAKE_CASE**:
```typescript
// Pattern from backoff.ts
export const DEFAULT_BACKOFF_CONFIG: BackoffConfig = {
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  multiplier: 2,
  jitterFactor: 0.1,
};
```

### Relevant Types

**Reuse from `src/lib/rate-limiter/backoff.ts`**:
```typescript
import {
  type BackoffConfig,
  DEFAULT_BACKOFF_CONFIG,
  RATE_LIMIT_BACKOFF_CONFIG,
  calculateBackoffMs,
} from "@/lib/rate-limiter/backoff";
```

**Logger interface from `src/lib/logger`**:
```typescript
import type { Logger } from "@/lib/logger";

// Logger has: debug, info, warn, error methods
// error signature: (message: string, error?: Error, context?: Record<string, unknown>) => void
```

**Use `p-queue` for bounded queue** (already in deps):
```typescript
import PQueue from "p-queue";
const queue = new PQueue({ concurrency: 1 });
```

### File Locations

Create new directory `src/worker/websocket/` with:
```
src/worker/websocket/
├── websocket.ts           # WebSocketManager
├── websocket.test.ts
├── message-queue.ts       # MessageQueue<T>
├── message-queue.test.ts
├── message-parser.ts      # MessageParser
├── message-parser.test.ts
├── health-monitor.ts      # HealthMonitor
├── health-monitor.test.ts
└── index.ts               # Re-exports all
```

Update `src/worker/index.ts` to export:
```typescript
export * from "./websocket";
```

### Test Patterns

**Test structure from `src/worker/queue.test.ts`**:
```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("createWebSocketManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("connect", () => {
    it("should transition to CONNECTED state", async () => {
      // Arrange
      const ws = createWebSocketManager({ url: "wss://test" });
      
      // Act
      await ws.connect();
      
      // Assert
      expect(ws.getState()).toBe("CONNECTED");
    });
  });
});
```

**Mocking WebSocket** (use `vi.mock`):
```typescript
vi.mock("ws", () => ({
  default: vi.fn(() => ({
    on: vi.fn(),
    send: vi.fn(),
    close: vi.fn(),
    readyState: 1, // OPEN
  })),
}));
```

**Testing event handlers**:
```typescript
it("should notify on state changes", async () => {
  const ws = createWebSocketManager({ url: "wss://test" });
  const stateChanges: WebSocketState[] = [];
  
  ws.onStateChange((state) => stateChanges.push(state));
  
  await ws.connect();
  
  expect(stateChanges).toContain("CONNECTED");
});
```

**Testing with fake timers for backoff/reconnect**:
```typescript
it("should reconnect with backoff after disconnect", async () => {
  const ws = createWebSocketManager({
    url: "wss://test",
    reconnect: { enabled: true, maxAttempts: 3 },
  });
  
  await ws.connect();
  // Simulate disconnect
  simulateClose(ws, 1006);
  
  // First reconnect attempt after ~1s
  await vi.advanceTimersByTimeAsync(1100);
  expect(ws.getState()).toBe("RECONNECTING");
});
```

### Error Handling

**Custom error classes** (extend Error, set `name`):
```typescript
// Pattern from circuit-breaker.ts
export class WebSocketError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
  ) {
    super(message);
    this.name = "WebSocketError";
  }
}

export class WebSocketAuthError extends WebSocketError {
  constructor(message = "WebSocket authentication failed") {
    super(message);
    this.name = "WebSocketAuthError";
  }
}

export class MaxReconnectsExceededError extends WebSocketError {
  constructor(
    public readonly attempts: number,
  ) {
    super(`Max reconnection attempts (${attempts}) exceeded`);
    this.name = "MaxReconnectsExceededError";
  }
}
```

### Dependencies to Install

```bash
pnpm add ws
pnpm add -D @types/ws
```

**Note**: `p-queue` (v9.1.0) and `valibot` (v1.0.0) already installed.

### LRU Cache for De-duplication

**Use `lru-cache` package** for production-grade de-duplication:

- Battle-tested, fast, handles TTL cleanup automatically
- Supports both max size and TTL eviction
- Prevents subtle bugs (stale reads, perf edge cases)
- Better than hand-rolled Map which is FIFO, not true LRU

```typescript
import { LRUCache } from "lru-cache";

const dedupeCache = new LRUCache<string, true>({
  max: maxDedupeSize,
  ttl: dedupeTtlMs,
});
```

**Rationale**: For WebSocket message deduplication, we need TTL semantics (e.g., "dedupe for 60s") plus proper LRU eviction when cache is full. `lru-cache` handles both correctly and is the standard solution for production bots.

## References

- [MVP Roadmap](../../../active/0001-mvp-roadmap/README.md)
- [ADR-0001: Bot Architecture](../../../../../adrs/0001-bot-architecture.md) — WebSocket data plane, reconciler pattern
- [ADR-0008: Monitoring & Observability](../../../../../adrs/0008-monitoring-observability.md) — Health checks
- [Rate Limiter Backoff](../../../../src/lib/rate-limiter/backoff.ts) — Reuse for reconnection
