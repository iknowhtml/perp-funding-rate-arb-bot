/**
 * Per-stream health monitor for WebSocket connections.
 *
 * Unlike a simple "any message = healthy" approach, this tracks:
 * - Per-stream staleness (ticker vs order feed have different expectations)
 * - Expected silence channels (order updates are quiet when no orders)
 * - WS-level pong responses
 *
 * @see {@link ../../../../adrs/0001-bot-architecture.md ADR-0001: Bot Architecture}
 */

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

interface StreamState {
  config: StreamConfig;
  lastMessageTime: number | null;
  lastPongTime: number | null;
  wasHealthy: boolean;
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
  const { streams, onUnhealthy, onRecovered, checkIntervalMs = 5000 } = config;

  const streamStates = new Map<StreamId, StreamState>();

  // Initialize stream states
  for (const [streamId, streamConfig] of Object.entries(streams)) {
    streamStates.set(streamId, {
      config: streamConfig,
      lastMessageTime: null,
      lastPongTime: null,
      wasHealthy: true,
    });
  }

  let checkInterval: NodeJS.Timeout | null = null;

  const checkHealth = (): void => {
    const now = Date.now();

    for (const [streamId, state] of streamStates.entries()) {
      const { config, lastMessageTime } = state;

      // If silence is allowed and no messages yet, consider healthy
      if (config.allowSilence && lastMessageTime === null) {
        if (!state.wasHealthy) {
          state.wasHealthy = true;
          onRecovered?.(streamId);
        }
        continue;
      }

      // Check staleness
      const isHealthy = lastMessageTime !== null && now - lastMessageTime < config.staleThresholdMs;

      if (!isHealthy && state.wasHealthy) {
        // Transitioned to unhealthy
        state.wasHealthy = false;
        const lastMessageMs = lastMessageTime ? now - lastMessageTime : null;
        onUnhealthy(streamId, lastMessageMs);
      } else if (isHealthy && !state.wasHealthy) {
        // Recovered
        state.wasHealthy = true;
        onRecovered?.(streamId);
      }
    }
  };

  const recordMessage = (streamId: StreamId): void => {
    const state = streamStates.get(streamId);
    if (state) {
      state.lastMessageTime = Date.now();
    }
  };

  const recordPong = (): void => {
    const now = Date.now();
    for (const state of streamStates.values()) {
      state.lastPongTime = now;
    }
  };

  const isStreamHealthy = (streamId: StreamId): boolean => {
    const state = streamStates.get(streamId);
    if (!state) return false;

    const { config, lastMessageTime } = state;

    // If silence is allowed and no messages yet, consider healthy
    if (config.allowSilence && lastMessageTime === null) {
      return true;
    }

    if (lastMessageTime === null) return false;

    const now = Date.now();
    return now - lastMessageTime < config.staleThresholdMs;
  };

  const isHealthy = (): boolean => {
    for (const streamId of streamStates.keys()) {
      if (!isStreamHealthy(streamId)) {
        return false;
      }
    }
    return true;
  };

  const getStatus = (): Record<StreamId, { healthy: boolean; lastMessageMs: number | null }> => {
    const status: Record<StreamId, { healthy: boolean; lastMessageMs: number | null }> = {};
    const now = Date.now();

    for (const [streamId, state] of streamStates.entries()) {
      const healthy = isStreamHealthy(streamId);
      const lastMessageMs = state.lastMessageTime ? now - state.lastMessageTime : null;
      status[streamId] = { healthy, lastMessageMs };
    }

    return status;
  };

  const start = (): void => {
    if (checkInterval) return;

    checkInterval = setInterval(() => {
      checkHealth();
    }, checkIntervalMs);

    // Initial check
    checkHealth();
  };

  const stop = (): void => {
    if (checkInterval) {
      clearInterval(checkInterval);
      checkInterval = null;
    }
  };

  return {
    recordMessage,
    recordPong,
    isStreamHealthy,
    isHealthy,
    getStatus,
    start,
    stop,
  };
};
