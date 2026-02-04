/**
 * Tests for Coinbase adapter.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCoinbaseAdapter } from "./adapter";

// Create mock services
const mockPublicService = {
  getServerTime: vi.fn().mockResolvedValue({}),
  getProduct: vi.fn().mockResolvedValue({
    productId: "BTC-PERP",
    futureProductDetails: {
      perpetualDetails: {
        fundingRate: "0.0003",
        fundingTime: "2026-02-04T08:00:00.000Z",
      },
    },
  }),
};

const mockAccountsService = {
  listAccounts: vi.fn().mockResolvedValue({
    accounts: [
      {
        uuid: "test-uuid",
        name: "USD Wallet",
        currency: "USD",
        availableBalance: { value: "1000.00", currency: "USD" },
      },
    ],
  }),
};

const mockClient = {};

// Mock the Coinbase SDK
vi.mock("@coinbase-sample/advanced-trade-sdk-ts", () => ({
  CoinbaseAdvTradeCredentials: vi.fn(),
  CoinbaseAdvTradeClient: vi.fn(() => mockClient),
  PublicService: vi.fn(() => mockPublicService),
  AccountsService: vi.fn(() => mockAccountsService),
}));

// Mock rate limiter
const mockExecute = vi.fn((fn) => fn());
vi.mock("@/lib/rate-limiter", () => ({
  createRequestPolicy: vi.fn(() => ({
    execute: mockExecute,
  })),
}));

describe("createCoinbaseAdapter", () => {
  const config = {
    apiKey: "test-key",
    apiSecret: "test-secret",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockImplementation((fn) => fn());
  });

  it("should create adapter with config", () => {
    const adapter = createCoinbaseAdapter(config);
    expect(adapter).toBeDefined();
    expect(adapter.isConnected()).toBe(false);
  });

  describe("connect", () => {
    it("should connect and verify credentials", async () => {
      const adapter = createCoinbaseAdapter(config);
      await adapter.connect();
      expect(adapter.isConnected()).toBe(true);
      expect(mockPublicService.getServerTime).toHaveBeenCalled();
    });
  });

  describe("disconnect", () => {
    it("should disconnect", async () => {
      const adapter = createCoinbaseAdapter(config);
      await adapter.connect();
      await adapter.disconnect();
      expect(adapter.isConnected()).toBe(false);
    });
  });

  describe("getFundingRate", () => {
    it("should fetch and normalize funding rate", async () => {
      const adapter = createCoinbaseAdapter(config);
      await adapter.connect();

      const result = await adapter.getFundingRate("BTC-PERP");

      expect(result.symbol).toBe("BTC-PERP");
      expect(result.rateBps).toBe(3n);
      expect(mockPublicService.getProduct).toHaveBeenCalledWith({ productId: "BTC-PERP" });
    });
  });

  describe("getBalances", () => {
    it("should fetch and normalize balances", async () => {
      const adapter = createCoinbaseAdapter(config);
      await adapter.connect();

      const result = await adapter.getBalances();

      expect(result).toHaveLength(1);
      expect(result[0].asset).toBe("USD");
      expect(mockAccountsService.listAccounts).toHaveBeenCalled();
    });
  });

  describe("getBalance", () => {
    it("should return balance for asset", async () => {
      const adapter = createCoinbaseAdapter(config);
      await adapter.connect();

      const balance = await adapter.getBalance("USD");

      expect(balance.asset).toBe("USD");
    });

    it("should throw if balance not found", async () => {
      const adapter = createCoinbaseAdapter(config);
      await adapter.connect();

      await expect(adapter.getBalance("INVALID")).rejects.toThrow();
    });
  });

  describe("stub methods", () => {
    it("should throw for unimplemented methods", async () => {
      const adapter = createCoinbaseAdapter(config);
      await adapter.connect();

      await expect(adapter.getTicker("BTC-USD")).rejects.toThrow("Not implemented");
      await expect(adapter.getOrderBook("BTC-USD")).rejects.toThrow("Not implemented");
      await expect(
        adapter.createOrder({
          symbol: "BTC-USD",
          side: "BUY",
          type: "MARKET",
          quantityBase: 1000n,
        }),
      ).rejects.toThrow("Not implemented");
    });
  });
});
