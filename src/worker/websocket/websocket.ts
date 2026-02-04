/**
 * Production-grade WebSocket connection manager with automatic reconnection,
 * close-code policies, and lifecycle hooks.
 *
 * Key features:
 * - Single-flight connect (prevents reconnect races)
 * - Generation ID for stale event detection
 * - Close-code aware reconnection policies
 * - Lifecycle hooks for re-auth/re-subscribe
 *
 * @see {@link ../../../../adrs/0001-bot-architecture.md ADR-0001: Bot Architecture}
 */

import {
  type BackoffConfig,
  DEFAULT_BACKOFF_CONFIG,
  calculateBackoffMs,
} from "@/lib/rate-limiter/backoff";
import WebSocket from "ws";

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
  onDisconnected(
    handler: (code: number, reason: string, category: CloseCategory) => void,
  ): () => void;
  /** Called for each inbound message (raw) */
  onMessage(handler: (data: unknown, generation: number) => void): () => void;
  /** Called on state change */
  onStateChange(handler: (state: WebSocketState) => void): () => void;
  /** Called on error */
  onError(handler: (error: Error) => void): () => void;
}

/**
 * Error thrown when max reconnection attempts exceeded.
 */
export class MaxReconnectsExceededError extends Error {
  constructor(
    public readonly attempts: number,
    public readonly category: CloseCategory,
  ) {
    super(`Max reconnection attempts (${attempts}) exceeded for category ${category}`);
    this.name = "MaxReconnectsExceededError";
  }
}

/**
 * Error thrown when WebSocket authentication fails.
 */
export class WebSocketAuthError extends Error {
  constructor(message = "WebSocket authentication failed") {
    super(message);
    this.name = "WebSocketAuthError";
  }
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
  const { url, protocols, reconnect = { enabled: false, maxAttempts: 0 }, heartbeat } = config;

  let state: WebSocketState = "DISCONNECTED";
  let ws: WebSocket | null = null;
  let generationId = 0; // Monotonic counter for stale event detection
  let connectPromise: Promise<void> | null = null; // Single-flight connect
  let reconnectAttempts = 0;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;
  let heartbeatTimeout: NodeJS.Timeout | null = null;
  const sendQueue: Array<string> = [];

  // Event handlers
  const connectedHandlers = new Set<() => Promise<void>>();
  const disconnectedHandlers = new Set<
    (code: number, reason: string, category: CloseCategory) => void
  >();
  const messageHandlers = new Set<(data: unknown, generation: number) => void>();
  const stateChangeHandlers = new Set<(state: WebSocketState) => void>();
  const errorHandlers = new Set<(error: Error) => void>();

  const setState = (newState: WebSocketState): void => {
    if (state !== newState) {
      state = newState;
      for (const handler of stateChangeHandlers) {
        handler(newState);
      }
    }
  };

  const cleanup = (): void => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (heartbeatTimeout) {
      clearTimeout(heartbeatTimeout);
      heartbeatTimeout = null;
    }
    if (ws) {
      ws.removeAllListeners();
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      ws = null;
    }
  };

  const startHeartbeat = (): void => {
    if (!heartbeat?.enabled) return;

    heartbeatTimer = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        // WS-level ping (handled by ws library)
        ws.ping();

        // App-level ping (if configured)
        if (heartbeat.pingMessage) {
          const message =
            typeof heartbeat.pingMessage === "function"
              ? heartbeat.pingMessage()
              : heartbeat.pingMessage;
          ws.send(message);
        }

        // Set timeout for pong
        if (heartbeatTimeout) {
          clearTimeout(heartbeatTimeout);
        }
        heartbeatTimeout = setTimeout(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.close(1000, "Heartbeat timeout");
          }
        }, heartbeat.timeoutMs);
      }
    }, heartbeat.intervalMs);
  };

  const stopHeartbeat = (): void => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (heartbeatTimeout) {
      clearTimeout(heartbeatTimeout);
      heartbeatTimeout = null;
    }
  };

  const flushSendQueue = (): void => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    while (sendQueue.length > 0) {
      const message = sendQueue.shift();
      if (message) {
        try {
          ws.send(message);
        } catch (error) {
          // Re-queue if send fails
          sendQueue.unshift(message);
          throw error;
        }
      }
    }
  };

  const handleConnect = async (): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      if (ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      setState("CONNECTING");
      generationId++; // Increment generation on new connection

      ws = new WebSocket(url, protocols);

      const cleanupListeners = (): void => {
        ws?.removeListener("open", onOpen);
        ws?.removeListener("error", onError);
        ws?.removeListener("close", onClose);
        ws?.removeListener("message", onMessage);
        ws?.removeListener("pong", onPong);
      };

      const onOpen = async (): Promise<void> => {
        cleanupListeners();
        setState("CONNECTED");
        reconnectAttempts = 0; // Reset on successful connect

        startHeartbeat();
        flushSendQueue();

        // Call connected handlers
        for (const handler of connectedHandlers) {
          try {
            await handler();
          } catch (error) {
            for (const errorHandler of errorHandlers) {
              errorHandler(error instanceof Error ? error : new Error(String(error)));
            }
          }
        }

        resolve();
      };

      const onError = (error: Error): void => {
        cleanupListeners();
        for (const handler of errorHandlers) {
          handler(error);
        }
        reject(error);
      };

      const onClose = (code: number, reason: Buffer): void => {
        cleanupListeners();
        stopHeartbeat();
        const reasonStr = reason.toString("utf-8");
        const category = classifyCloseCode(code);

        setState("DISCONNECTED");

        // Call disconnected handlers
        for (const handler of disconnectedHandlers) {
          handler(code, reasonStr, category);
        }

        // Handle reconnection (enabled check happens before state change)
        if (reconnect.enabled) {
          // Check if we should retry based on category
          const maxAttempts =
            category === "AUTH_FAILURE" && reconnect.maxAuthFailureAttempts !== undefined
              ? reconnect.maxAuthFailureAttempts
              : reconnect.maxAttempts;

          if (reconnectAttempts >= maxAttempts) {
            const error = new MaxReconnectsExceededError(reconnectAttempts, category);
            for (const handler of errorHandlers) {
              handler(error);
            }
            return;
          }

          // Select backoff config based on category
          const backoffConfig =
            category === "RATE_LIMITED" && reconnect.rateLimitBackoffConfig
              ? reconnect.rateLimitBackoffConfig
              : (reconnect.backoffConfig ?? DEFAULT_BACKOFF_CONFIG);

          const delay = calculateBackoffMs(reconnectAttempts, backoffConfig);

          setState("RECONNECTING");
          reconnectAttempts++;

          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            void handleConnect().catch((error) => {
              for (const handler of errorHandlers) {
                handler(error instanceof Error ? error : new Error(String(error)));
              }
            });
          }, delay);
        }
      };

      const onMessage = (data: WebSocket.RawData): void => {
        const currentGeneration = generationId;
        let parsed: unknown;

        try {
          if (Buffer.isBuffer(data) || data instanceof ArrayBuffer) {
            parsed = JSON.parse(data.toString("utf-8"));
          } else {
            parsed = data;
          }
        } catch {
          parsed = data;
        }

        for (const handler of messageHandlers) {
          handler(parsed, currentGeneration);
        }
      };

      const onPong = (): void => {
        // Clear heartbeat timeout on pong
        if (heartbeatTimeout) {
          clearTimeout(heartbeatTimeout);
          heartbeatTimeout = null;
        }
      };

      ws.on("open", onOpen);
      ws.on("error", onError);
      ws.on("close", onClose);
      ws.on("message", onMessage);
      ws.on("pong", onPong);
    });
  };

  const connect = async (): Promise<void> => {
    // Single-flight: if already connecting, return existing promise
    if (connectPromise) {
      return connectPromise;
    }

    if (state === "CONNECTED") {
      return;
    }

    connectPromise = handleConnect();
    try {
      await connectPromise;
    } finally {
      connectPromise = null;
    }
  };

  const disconnect = async (): Promise<void> => {
    // Cancel pending reconnect
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    // Cancel pending connect
    connectPromise = null;

    setState("DISCONNECTED");
    cleanup();
    sendQueue.length = 0;
    reconnectAttempts = 0;
  };

  const send = (message: string | object): void => {
    const serialized = typeof message === "string" ? message : JSON.stringify(message);

    if (ws?.readyState === WebSocket.OPEN) {
      try {
        ws.send(serialized);
      } catch (error) {
        // Queue if send fails
        sendQueue.push(serialized);
        for (const handler of errorHandlers) {
          handler(error instanceof Error ? error : new Error(String(error)));
        }
      }
    } else {
      // Queue if not connected
      sendQueue.push(serialized);
    }
  };

  const getState = (): WebSocketState => state;

  const getGeneration = (): number => generationId;

  const onConnected = (handler: () => Promise<void>): (() => void) => {
    connectedHandlers.add(handler);
    return () => {
      connectedHandlers.delete(handler);
    };
  };

  const onDisconnected = (
    handler: (code: number, reason: string, category: CloseCategory) => void,
  ): (() => void) => {
    disconnectedHandlers.add(handler);
    return () => {
      disconnectedHandlers.delete(handler);
    };
  };

  const onMessage = (handler: (data: unknown, generation: number) => void): (() => void) => {
    messageHandlers.add(handler);
    return () => {
      messageHandlers.delete(handler);
    };
  };

  const onStateChange = (handler: (state: WebSocketState) => void): (() => void) => {
    stateChangeHandlers.add(handler);
    return () => {
      stateChangeHandlers.delete(handler);
    };
  };

  const onError = (handler: (error: Error) => void): (() => void) => {
    errorHandlers.add(handler);
    return () => {
      errorHandlers.delete(handler);
    };
  };

  return {
    connect,
    disconnect,
    send,
    getState,
    getGeneration,
    onConnected,
    onDisconnected,
    onMessage,
    onStateChange,
    onError,
  };
};
