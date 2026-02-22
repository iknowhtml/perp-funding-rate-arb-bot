import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { MaxReconnectsExceededError, classifyCloseCode, createWebSocketManager } from "./websocket";

// Mock ws module
vi.mock("ws", () => {
  const createMockInstance = () => ({
    on: vi.fn(),
    send: vi.fn(),
    close: vi.fn(),
    ping: vi.fn(),
    removeAllListeners: vi.fn(),
    readyState: 0, // CONNECTING
  });

  const mockWs = vi.fn(() => createMockInstance());

  // Add WebSocket constants
  mockWs.CONNECTING = 0;
  mockWs.OPEN = 1;
  mockWs.CLOSING = 2;
  mockWs.CLOSED = 3;

  return {
    default: mockWs,
  };
});

describe("classifyCloseCode", () => {
  it("should classify auth failures", () => {
    expect(classifyCloseCode(4401)).toBe("AUTH_FAILURE");
    expect(classifyCloseCode(4403)).toBe("AUTH_FAILURE");
    expect(classifyCloseCode(1008)).toBe("AUTH_FAILURE");
  });

  it("should classify rate limits", () => {
    expect(classifyCloseCode(4429)).toBe("RATE_LIMITED");
    expect(classifyCloseCode(1013)).toBe("RATE_LIMITED");
  });

  it("should classify normal closures", () => {
    expect(classifyCloseCode(1000)).toBe("NORMAL");
    expect(classifyCloseCode(1001)).toBe("NORMAL");
    expect(classifyCloseCode(1006)).toBe("NORMAL");
  });

  it("should classify unknown codes", () => {
    expect(classifyCloseCode(9999)).toBe("UNKNOWN");
    expect(classifyCloseCode(2000)).toBe("UNKNOWN");
  });
});

describe("createWebSocketManager", () => {
  let latestMockInstance: ReturnType<typeof WebSocket> | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    latestMockInstance = undefined;
    vi.mocked(WebSocket).mockImplementation(() => {
      const instance = {
        on: vi.fn(),
        send: vi.fn(),
        close: vi.fn(),
        ping: vi.fn(),
        removeAllListeners: vi.fn(),
        removeListener: vi.fn(),
      };
      // Define readyState as configurable so tests can change it
      Object.defineProperty(instance, "readyState", {
        value: 0, // CONNECTING
        writable: true,
        configurable: true,
      });
      latestMockInstance = instance as unknown as ReturnType<typeof WebSocket>;
      return latestMockInstance;
    });
  });

  const getMockInstance = (): ReturnType<typeof WebSocket> => {
    if (!latestMockInstance) {
      throw new Error("Mock instance not created yet - call ws.connect() first");
    }
    return latestMockInstance;
  };

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    it("should start in DISCONNECTED state", () => {
      const ws = createWebSocketManager({ url: "ws://test" });
      expect(ws.getState()).toBe("DISCONNECTED");
      expect(ws.getGeneration()).toBe(0);
    });
  });

  describe("connect", () => {
    it("should transition to CONNECTING then CONNECTED", async () => {
      const ws = createWebSocketManager({ url: "ws://test" });
      const stateChanges: string[] = [];

      ws.onStateChange((state) => stateChanges.push(state));

      const connectPromise = ws.connect();

      // Simulate open event
      const mockInstance = getMockInstance();
      const onOpen = vi
        .mocked(mockInstance.on)
        .mock.calls.find((call) => call[0] === "open")?.[1] as () => void;
      expect(onOpen).toBeDefined();

      // Trigger open
      onOpen?.();
      await connectPromise;

      expect(ws.getState()).toBe("CONNECTED");
      expect(stateChanges).toContain("CONNECTING");
      expect(stateChanges).toContain("CONNECTED");
    });

    it("should be single-flight (only create one WebSocket)", async () => {
      const ws = createWebSocketManager({ url: "ws://test" });

      // Call connect multiple times before it completes
      const promise1 = ws.connect();
      const promise2 = ws.connect();

      // Should only create one WebSocket instance
      expect(vi.mocked(WebSocket)).toHaveBeenCalledTimes(1);

      // Both should resolve when connection completes
      const mockInstance = getMockInstance();
      const onOpen = vi
        .mocked(mockInstance.on)
        .mock.calls.find((call) => call[0] === "open")?.[1] as () => void;
      onOpen?.();

      await Promise.all([promise1, promise2]);

      // Still only one WebSocket created
      expect(vi.mocked(WebSocket)).toHaveBeenCalledTimes(1);

      await ws.disconnect();
    });

    it("should increment generation on new connection", async () => {
      const ws = createWebSocketManager({ url: "ws://test" });

      expect(ws.getGeneration()).toBe(0);

      const connectPromise = ws.connect();
      const onOpen = vi
        .mocked(getMockInstance().on)
        .mock.calls.find((call) => call[0] === "open")?.[1] as () => void;
      onOpen?.();
      await connectPromise;

      expect(ws.getGeneration()).toBe(1);

      await ws.disconnect();

      // Reconnect should increment again
      const connectPromise2 = ws.connect();
      const onOpen2 = vi
        .mocked(getMockInstance().on)
        .mock.calls.find((call) => call[0] === "open")?.[1] as () => void;
      onOpen2?.();
      await connectPromise2;

      expect(ws.getGeneration()).toBe(2);
    });

    it("should call onConnected handlers", async () => {
      const ws = createWebSocketManager({ url: "ws://test" });
      const handler = vi.fn(async () => {});

      ws.onConnected(handler);

      const connectPromise = ws.connect();
      const onOpen = vi
        .mocked(getMockInstance().on)
        .mock.calls.find((call) => call[0] === "open")?.[1] as () => void;
      onOpen?.();
      await connectPromise;

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe("disconnect", () => {
    it("should transition to DISCONNECTED and cleanup", async () => {
      const ws = createWebSocketManager({ url: "ws://test" });

      const connectPromise = ws.connect();
      const onOpen = vi
        .mocked(getMockInstance().on)
        .mock.calls.find((call) => call[0] === "open")?.[1] as () => void;
      onOpen?.();
      await connectPromise;

      await ws.disconnect();

      expect(ws.getState()).toBe("DISCONNECTED");
      expect(vi.mocked(getMockInstance().close)).toHaveBeenCalled();
      expect(vi.mocked(getMockInstance().removeAllListeners)).toHaveBeenCalled();
    });

    it("should cancel pending reconnect", async () => {
      const ws = createWebSocketManager({
        url: "ws://test",
        reconnect: { enabled: true, maxAttempts: 5 },
      });

      const connectPromise = ws.connect();
      const onOpen = vi
        .mocked(getMockInstance().on)
        .mock.calls.find((call) => call[0] === "open")?.[1] as () => void;
      onOpen?.();
      await connectPromise;

      // Simulate close
      const onClose = vi
        .mocked(getMockInstance().on)
        .mock.calls.find((call) => call[0] === "close")?.[1] as (
        code: number,
        reason: Buffer,
      ) => void;
      onClose?.(1006, Buffer.from(""));

      // Advance timer to trigger reconnect attempt
      await vi.advanceTimersByTimeAsync(100);

      // Disconnect should cancel reconnect
      await ws.disconnect();

      // Advance more - reconnect should not happen
      await vi.advanceTimersByTimeAsync(2000);
      expect(ws.getState()).toBe("DISCONNECTED");
    });
  });

  describe("send", () => {
    it("should send message when connected", async () => {
      const ws = createWebSocketManager({ url: "ws://test" });

      const connectPromise = ws.connect();
      const mockInstance = getMockInstance();
      const onOpen = vi
        .mocked(mockInstance.on)
        .mock.calls.find((call) => call[0] === "open")?.[1] as () => void;
      onOpen?.();
      await connectPromise;

      // Mock readyState as OPEN
      Object.defineProperty(mockInstance, "readyState", {
        value: 1,
        writable: true,
        configurable: true,
      });

      ws.send("test message");
      ws.send({ type: "test", data: "value" });

      expect(vi.mocked(mockInstance.send)).toHaveBeenCalledTimes(2);
      expect(vi.mocked(mockInstance.send)).toHaveBeenCalledWith("test message");
      expect(vi.mocked(mockInstance.send)).toHaveBeenCalledWith(
        JSON.stringify({ type: "test", data: "value" }),
      );
    });

    it("should queue messages when not connected", async () => {
      const ws = createWebSocketManager({ url: "ws://test" });

      // Send before connecting - should be queued
      ws.send("queued message");

      // Connect and flush queue
      const connectPromise = ws.connect();
      const mockInstance = getMockInstance();
      const onOpen = vi
        .mocked(mockInstance.on)
        .mock.calls.find((call) => call[0] === "open")?.[1] as () => void;

      // Set readyState to OPEN before triggering open event
      Object.defineProperty(mockInstance, "readyState", {
        value: 1,
        writable: true,
        configurable: true,
      });
      onOpen?.();
      await connectPromise;

      // Queue should be flushed
      expect(vi.mocked(mockInstance.send)).toHaveBeenCalledWith("queued message");
    });
  });

  describe("onMessage", () => {
    it("should call handlers with message and generation", async () => {
      const ws = createWebSocketManager({ url: "ws://test" });
      const handler = vi.fn();

      ws.onMessage(handler);

      const connectPromise = ws.connect();
      const onOpen = vi
        .mocked(getMockInstance().on)
        .mock.calls.find((call) => call[0] === "open")?.[1] as () => void;
      onOpen?.();
      await connectPromise;

      const generation = ws.getGeneration();

      // Simulate message
      const onMessage = vi
        .mocked(getMockInstance().on)
        .mock.calls.find((call) => call[0] === "message")?.[1] as (data: WebSocket.RawData) => void;
      onMessage?.(Buffer.from(JSON.stringify({ type: "test", data: "value" })));

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ type: "test", data: "value" }, generation);
    });

    it("should allow unsubscribing", async () => {
      const ws = createWebSocketManager({ url: "ws://test" });
      const handler = vi.fn();

      const unsubscribe = ws.onMessage(handler);

      const connectPromise = ws.connect();
      const onOpen = vi
        .mocked(getMockInstance().on)
        .mock.calls.find((call) => call[0] === "open")?.[1] as () => void;
      onOpen?.();
      await connectPromise;

      unsubscribe();

      const onMessage = vi
        .mocked(getMockInstance().on)
        .mock.calls.find((call) => call[0] === "message")?.[1] as (data: WebSocket.RawData) => void;
      onMessage?.(Buffer.from(JSON.stringify({ type: "test" })));

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("reconnection", () => {
    it("should reconnect with backoff on close", async () => {
      const ws = createWebSocketManager({
        url: "ws://test",
        reconnect: {
          enabled: true,
          maxAttempts: 3,
          backoffConfig: {
            initialDelayMs: 100,
            maxDelayMs: 1000,
            multiplier: 2,
            jitterFactor: 0,
          },
        },
      });

      // Connect initially
      const connectPromise = ws.connect();
      let mockInstance = getMockInstance();
      const onOpen = vi
        .mocked(mockInstance.on)
        .mock.calls.find((call) => call[0] === "open")?.[1] as () => void;
      onOpen?.();
      await connectPromise;

      expect(ws.getState()).toBe("CONNECTED");

      // Simulate close
      const onClose = vi
        .mocked(mockInstance.on)
        .mock.calls.find((call) => call[0] === "close")?.[1] as (
        code: number,
        reason: Buffer,
      ) => void;
      onClose?.(1006, Buffer.from(""));

      // State immediately goes to RECONNECTING (timer is scheduled)
      expect(ws.getState()).toBe("RECONNECTING");

      // Advance timer - reconnect attempt starts
      await vi.advanceTimersByTimeAsync(110);

      // New WebSocket instance is created
      mockInstance = getMockInstance();
      const onOpen2 = vi
        .mocked(mockInstance.on)
        .mock.calls.find((call) => call[0] === "open")?.[1] as () => void;
      onOpen2?.();
      await vi.advanceTimersByTimeAsync(1);

      expect(ws.getState()).toBe("CONNECTED");
    });

    it("should stop after max consecutive failures", async () => {
      const ws = createWebSocketManager({
        url: "ws://test",
        reconnect: {
          enabled: true,
          maxAttempts: 2,
          backoffConfig: {
            initialDelayMs: 100,
            maxDelayMs: 1000,
            multiplier: 2,
            jitterFactor: 0,
          },
        },
      });

      const errorHandler = vi.fn();
      ws.onError(errorHandler);

      // Helper to get event handlers from current mock instance
      const getHandlers = () => {
        const mockInstance = getMockInstance();
        const onCalls = vi.mocked(mockInstance.on).mock.calls;
        return {
          onOpen: onCalls.find((call) => call[0] === "open")?.[1] as () => void,
          onClose: onCalls.find((call) => call[0] === "close")?.[1] as (
            code: number,
            reason: Buffer,
          ) => void,
        };
      };

      // Connect initially
      ws.connect();
      let handlers = getHandlers();
      handlers.onOpen?.();

      expect(ws.getState()).toBe("CONNECTED");

      // First close - reconnectAttempts goes from 0 to 1, schedules reconnect
      handlers.onClose?.(1006, Buffer.from(""));
      expect(ws.getState()).toBe("RECONNECTING");

      // Timer fires - reconnect attempt 1 (new WS created)
      await vi.advanceTimersByTimeAsync(110);
      handlers = getHandlers();

      // Fail immediately (close without open) - reconnectAttempts goes from 1 to 2
      handlers.onClose?.(1006, Buffer.from(""));
      expect(ws.getState()).toBe("RECONNECTING");

      // Timer fires - reconnect attempt 2 (new WS created)
      await vi.advanceTimersByTimeAsync(110);
      handlers = getHandlers();

      // Fail again (close without open) - reconnectAttempts is 2 >= maxAttempts(2), error!
      handlers.onClose?.(1006, Buffer.from(""));

      expect(errorHandler).toHaveBeenCalled();
      const error = errorHandler.mock.calls[0]?.[0];
      expect(error).toBeInstanceOf(MaxReconnectsExceededError);
      expect(ws.getState()).toBe("DISCONNECTED");
    });

    it("should use different max attempts for auth failures", async () => {
      const ws = createWebSocketManager({
        url: "ws://test",
        reconnect: {
          enabled: true,
          maxAttempts: 10,
          maxAuthFailureAttempts: 2,
          backoffConfig: {
            initialDelayMs: 100,
            maxDelayMs: 1000,
            multiplier: 2,
            jitterFactor: 0,
          },
        },
      });

      const errorHandler = vi.fn();
      ws.onError(errorHandler);

      // Helper to get event handlers from current mock instance
      const getHandlers = () => {
        const mockInstance = getMockInstance();
        const onCalls = vi.mocked(mockInstance.on).mock.calls;
        return {
          onOpen: onCalls.find((call) => call[0] === "open")?.[1] as () => void,
          onClose: onCalls.find((call) => call[0] === "close")?.[1] as (
            code: number,
            reason: Buffer,
          ) => void,
        };
      };

      // Connect initially
      ws.connect();
      let handlers = getHandlers();
      handlers.onOpen?.();

      expect(ws.getState()).toBe("CONNECTED");

      // First auth failure close - reconnectAttempts goes from 0 to 1
      handlers.onClose?.(4401, Buffer.from("auth failed"));
      expect(ws.getState()).toBe("RECONNECTING");

      // Timer fires - reconnect attempt 1
      await vi.advanceTimersByTimeAsync(110);
      handlers = getHandlers();

      // Fail again with auth error - reconnectAttempts goes from 1 to 2
      handlers.onClose?.(4401, Buffer.from("auth failed"));
      expect(ws.getState()).toBe("RECONNECTING");

      // Timer fires - reconnect attempt 2
      await vi.advanceTimersByTimeAsync(110);
      handlers = getHandlers();

      // Fail again - reconnectAttempts is 2 >= maxAuthFailureAttempts(2), error!
      handlers.onClose?.(4401, Buffer.from("auth failed"));

      expect(errorHandler).toHaveBeenCalled();
      const error = errorHandler.mock.calls[
        errorHandler.mock.calls.length - 1
      ]?.[0] as MaxReconnectsExceededError;
      expect(error).toBeInstanceOf(MaxReconnectsExceededError);
      expect(error.category).toBe("AUTH_FAILURE");
    });
  });

  describe("heartbeat", () => {
    it("should send ping at interval", async () => {
      const ws = createWebSocketManager({
        url: "ws://test",
        heartbeat: {
          enabled: true,
          intervalMs: 1000,
          timeoutMs: 5000,
        },
      });

      const connectPromise = ws.connect();
      const mockInstance = getMockInstance();
      const onOpen = vi
        .mocked(mockInstance.on)
        .mock.calls.find((call) => call[0] === "open")?.[1] as () => void;
      onOpen?.();
      await connectPromise;

      // Set readyState after connection is established (WebSocket.OPEN = 1)
      Object.defineProperty(mockInstance, "readyState", {
        value: 1,
        writable: true,
        configurable: true,
      });

      // Advance timer to trigger interval (needs to advance past intervalMs)
      await vi.advanceTimersByTimeAsync(1100);

      expect(vi.mocked(mockInstance.ping)).toHaveBeenCalled();
    });

    it("should send app-level ping message if configured", async () => {
      const ws = createWebSocketManager({
        url: "ws://test",
        heartbeat: {
          enabled: true,
          intervalMs: 1000,
          timeoutMs: 5000,
          pingMessage: '{"type":"ping"}',
        },
      });

      const connectPromise = ws.connect();
      const mockInstance = getMockInstance();
      const onOpen = vi
        .mocked(mockInstance.on)
        .mock.calls.find((call) => call[0] === "open")?.[1] as () => void;
      onOpen?.();
      await connectPromise;

      // Set readyState after connection is established (WebSocket.OPEN = 1)
      Object.defineProperty(mockInstance, "readyState", {
        value: 1,
        writable: true,
        configurable: true,
      });

      await vi.advanceTimersByTimeAsync(1100);

      expect(vi.mocked(mockInstance.send)).toHaveBeenCalledWith('{"type":"ping"}');
    });
  });
});
