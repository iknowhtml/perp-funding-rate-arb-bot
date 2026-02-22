/**
 * Tests for adapter factory and config validation.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseAdapterConfig } from "../config";
import { createExchangeAdapter } from "./factory";

// Mock adapters
const mockAdapter = {
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  isConnected: vi.fn().mockReturnValue(false),
  getBalance: vi.fn(),
  getBalances: vi.fn(),
  createOrder: vi.fn(),
  cancelOrder: vi.fn(),
  getOrder: vi.fn(),
  getOpenOrders: vi.fn(),
  getPosition: vi.fn(),
  getPositions: vi.fn(),
  getTicker: vi.fn(),
  getFundingRate: vi.fn(),
  getOrderBook: vi.fn(),
  subscribeTicker: vi.fn(),
  unsubscribeTicker: vi.fn(),
};

vi.mock("../paper", () => ({
  createPaperAdapter: vi.fn(() => mockAdapter),
}));

import { createPaperAdapter } from "../paper";

describe("createExchangeAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createPaperAdapter).mockReturnValue(mockAdapter);
  });

  it("should throw for Coinbase adapter", () => {
    const config = parseAdapterConfig({
      exchange: "coinbase",
      apiKey: "test-key",
      apiSecret: "test-secret",
    });

    expect(() => createExchangeAdapter(config)).toThrow("coinbase adapter not yet implemented");
  });

  it("should create paper adapter with valid config", () => {
    const config = parseAdapterConfig({
      exchange: "paper",
      initialBalances: { USD: 1000n },
    });

    const adapter = createExchangeAdapter(config);

    expect(adapter).toBeDefined();
    expect(createPaperAdapter).toHaveBeenCalledWith({
      initialBalances: { USD: 1000n },
    });
  });

  it("should create paper adapter with empty balances when not provided", () => {
    const config = parseAdapterConfig({
      exchange: "paper",
    });

    const adapter = createExchangeAdapter(config);

    expect(adapter).toBeDefined();
    expect(createPaperAdapter).toHaveBeenCalledWith({
      initialBalances: {},
    });
  });

  it("should throw error for Binance adapter", () => {
    const config = parseAdapterConfig({
      exchange: "binance",
      apiKey: "test-key",
      apiSecret: "test-secret",
    });

    expect(() => createExchangeAdapter(config)).toThrow("binance adapter not yet implemented");
  });

  it("should throw error for Bybit adapter", () => {
    const config = parseAdapterConfig({
      exchange: "bybit",
      apiKey: "test-key",
      apiSecret: "test-secret",
    });

    expect(() => createExchangeAdapter(config)).toThrow("bybit adapter not yet implemented");
  });
});

describe("parseAdapterConfig", () => {
  it("should parse valid Coinbase config", () => {
    const config = parseAdapterConfig({
      exchange: "coinbase",
      apiKey: "test-key",
      apiSecret: "test-secret",
    });

    expect(config.exchange).toBe("coinbase");
    if (config.exchange === "coinbase") {
      expect(config.apiKey).toBe("test-key");
      expect(config.apiSecret).toBe("test-secret");
    }
  });

  it("should parse valid Binance config", () => {
    const config = parseAdapterConfig({
      exchange: "binance",
      apiKey: "test-key",
      apiSecret: "test-secret",
    });

    expect(config.exchange).toBe("binance");
    if (config.exchange === "binance") {
      expect(config.apiKey).toBe("test-key");
      expect(config.apiSecret).toBe("test-secret");
    }
  });

  it("should parse valid Bybit config", () => {
    const config = parseAdapterConfig({
      exchange: "bybit",
      apiKey: "test-key",
      apiSecret: "test-secret",
    });

    expect(config.exchange).toBe("bybit");
    if (config.exchange === "bybit") {
      expect(config.apiKey).toBe("test-key");
      expect(config.apiSecret).toBe("test-secret");
    }
  });

  it("should parse valid paper config with balances", () => {
    const config = parseAdapterConfig({
      exchange: "paper",
      initialBalances: { USD: 1000n, BTC: 1n },
    });

    expect(config.exchange).toBe("paper");
    if (config.exchange === "paper") {
      expect(config.initialBalances).toEqual({ USD: 1000n, BTC: 1n });
    }
  });

  it("should parse valid paper config without balances", () => {
    const config = parseAdapterConfig({
      exchange: "paper",
    });

    expect(config.exchange).toBe("paper");
    if (config.exchange === "paper") {
      expect(config.initialBalances).toBeUndefined();
    }
  });

  it("should reject config with missing apiKey", () => {
    expect(() =>
      parseAdapterConfig({
        exchange: "coinbase",
        apiSecret: "test-secret",
      }),
    ).toThrow();
  });

  it("should reject config with missing apiSecret", () => {
    expect(() =>
      parseAdapterConfig({
        exchange: "coinbase",
        apiKey: "test-key",
      }),
    ).toThrow();
  });

  it("should reject config with empty apiKey", () => {
    expect(() =>
      parseAdapterConfig({
        exchange: "coinbase",
        apiKey: "",
        apiSecret: "test-secret",
      }),
    ).toThrow();
  });

  it("should reject config with empty apiSecret", () => {
    expect(() =>
      parseAdapterConfig({
        exchange: "coinbase",
        apiKey: "test-key",
        apiSecret: "",
      }),
    ).toThrow();
  });

  it("should reject config with invalid exchange", () => {
    expect(() =>
      parseAdapterConfig({
        exchange: "invalid",
        apiKey: "test-key",
        apiSecret: "test-secret",
      }),
    ).toThrow();
  });

  it("should reject config with invalid initialBalances type", () => {
    expect(() =>
      parseAdapterConfig({
        exchange: "paper",
        initialBalances: { USD: "1000" },
      }),
    ).toThrow();
  });
});
