import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env/env", () => ({
  env: {
    DATABASE_URL: "postgresql://localhost/test",
    PORT: 3000,
    NODE_ENV: "test",
    ARBITRUM_RPC_URL: "https://arb1.arbitrum.io/rpc",
  },
}));

import { createDataCollector } from "./data-collector";

vi.mock("@/adapters/gmx", () => ({
  fetchGmxMarketsInfo: vi.fn(),
  fetchGmxTickers: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  db: { insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })) },
}));

vi.mock("@/lib/chain", () => ({
  createArbitrumPublicClient: vi.fn(),
}));

import { fetchGmxMarketsInfo, fetchGmxTickers } from "@/adapters/gmx";
import { db } from "@/lib/db/client";

describe("createDataCollector", () => {
  it("inserts correct rows on collectMarketSnapshot", async () => {
    const mockValues = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.insert).mockReturnValue({
      values: mockValues,
    } as never);

    vi.mocked(fetchGmxMarketsInfo).mockResolvedValue([
      {
        marketToken: "0x70d95",
        name: "ETH/USD [ETH-USDC]",
        openInterestLong: 1000n,
        openInterestShort: 2000n,
        fundingRateLong: 1n,
        fundingRateShort: -1n,
        borrowingRateLong: 0n,
        borrowingRateShort: 1n,
      },
    ]);
    vi.mocked(fetchGmxTickers).mockResolvedValue([
      { tokenSymbol: "ETH", minPrice: 2000n, maxPrice: 2010n } as never,
    ]);

    const mockGetGasPrice = vi.fn().mockResolvedValue(1000000000n);
    const collector = createDataCollector({
      db: db as never,
      gmxOracleUrl: "https://arbitrum-api.gmxinfra.io",
      publicClient: { getGasPrice: mockGetGasPrice } as never,
    });

    collector.start();
    await new Promise((r) => setTimeout(r, 200));
    collector.stop();

    expect(mockValues).toHaveBeenCalled();
  });

  it("handles API errors gracefully", async () => {
    vi.mocked(fetchGmxMarketsInfo).mockRejectedValue(new Error("network error"));

    const collector = createDataCollector({
      db: db as never,
      gmxOracleUrl: "https://arbitrum-api.gmxinfra.io",
      publicClient: {} as never,
    });

    collector.start();
    await new Promise((r) => setTimeout(r, 500));
    collector.stop();

    expect(collector).toBeDefined();
  });
});
