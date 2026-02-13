import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env/env", () => ({
  env: {
    DATABASE_URL: "postgresql://localhost/test",
    PORT: 3000,
    NODE_ENV: "test",
    ARBITRUM_RPC_URL: "https://arb1.arbitrum.io/rpc",
  },
}));

import { createImpactSampler } from "./impact-sampler";

vi.mock("@/adapters/gmx", () => ({
  BTC_USD_MARKET: "0x47c031236e19d024b42f8AE6780E44A573170703",
  ETH_USD_MARKET: "0x70d95587d40A2caf56bd97485aB3Eec10Bee6336",
  fetchGmxTickers: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  db: { insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })) },
}));

vi.mock("@/lib/chain", () => ({
  createArbitrumPublicClient: vi.fn(),
  createArbitrumWalletClient: vi.fn(),
}));

import { fetchGmxTickers } from "@/adapters/gmx";
import { db } from "@/lib/db/client";

describe("createImpactSampler", () => {
  it("sampleOnce inserts rows for both markets", async () => {
    const mockValues = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.insert).mockReturnValue({ values: mockValues } as never);

    vi.mocked(fetchGmxTickers).mockResolvedValue([
      { tokenSymbol: "ETH", minPrice: 2000n, maxPrice: 2010n } as never,
      { tokenSymbol: "BTC", minPrice: 60000n, maxPrice: 60100n } as never,
    ]);

    const sampler = createImpactSampler({
      db: db as never,
      publicClient: {} as never,
      walletClient: null,
      gmxOracleUrl: "https://arbitrum-api.gmxinfra.io",
    });

    await sampler.sampleOnce();

    expect(mockValues).toHaveBeenCalledTimes(2);
  });

  it("handles simulation errors gracefully", async () => {
    vi.mocked(fetchGmxTickers).mockRejectedValue(new Error("network error"));

    const sampler = createImpactSampler({
      db: db as never,
      publicClient: {} as never,
      walletClient: null,
      gmxOracleUrl: "https://arbitrum-api.gmxinfra.io",
    });

    await sampler.sampleOnce();

    expect(sampler).toBeDefined();
  });
});
