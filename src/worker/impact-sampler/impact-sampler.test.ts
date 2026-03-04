import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env/env", () => {
  const mockEnv = {
    DATABASE_URL: "postgresql://localhost/test",
    PORT: 3000,
    NODE_ENV: "test",
    ARBITRUM_RPC_URL: "https://arb1.arbitrum.io/rpc",
  };
  return { env: mockEnv, getEnv: () => mockEnv };
});

import { createImpactSampler } from "./impact-sampler";

vi.mock("@/lib/chain/protocols/gmx", () => ({
  BTC_USD_MARKET: "0x47c031236e19d024b42f8AE6780E44A573170703",
  ETH_USD_MARKET: "0x70d95587d40A2caf56bd97485aB3Eec10Bee6336",
  fetchGmxTickers: vi.fn(),
}));

const mockDb = {
  insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
};

vi.mock("@/lib/db", () => ({
  executionEstimate: {},
  marketSnapshot: {},
}));

vi.mock("@/lib/chain", () => ({
  createArbitrumPublicClient: vi.fn(),
  createArbitrumWalletClient: vi.fn(),
}));

vi.mock("@/lib/chain/gas", () => ({
  estimateExecutionFeeWei: vi.fn().mockResolvedValue(50_000_000_000_000_000n), // 0.05 ETH
}));

import { fetchGmxTickers } from "@/lib/chain/protocols/gmx";
import type { ProtocolAdapter } from "@/lib/protocols";

const mockSimulateOrder = vi.fn().mockResolvedValue({ impactBps: 0n });
const mockAdapter = { simulateOrder: mockSimulateOrder } as unknown as ProtocolAdapter;

const IMPACT_SAMPLER_DEPS = {
  db: mockDb as never,
  publicClient: {} as never,
  walletClient: null as never,
  gmxOracleUrl: "https://arbitrum-api.gmxinfra.io",
  maxExecutionFeeWei: 10n ** 18n,
  adapter: mockAdapter,
  intervalMs: 5 * 60 * 1000,
};

describe("createImpactSampler", () => {
  it("sampleOnce inserts rows for both markets", async () => {
    const mockValues = vi.fn().mockResolvedValue(undefined);
    vi.mocked(mockDb.insert).mockReturnValue({ values: mockValues } as never);

    vi.mocked(fetchGmxTickers).mockResolvedValue([
      { tokenSymbol: "ETH", minPrice: 2000n * 10n ** 30n, maxPrice: 2010n * 10n ** 30n } as never,
      { tokenSymbol: "BTC", minPrice: 60000n * 10n ** 30n, maxPrice: 60100n * 10n ** 30n } as never,
    ]);

    const sampler = createImpactSampler(IMPACT_SAMPLER_DEPS);

    await sampler.sampleOnce();

    expect(mockSimulateOrder).toHaveBeenCalledTimes(2);
    expect(mockValues).toHaveBeenCalledTimes(2);
  });

  it("lets errors bubble when fetch or simulation fails", async () => {
    vi.mocked(fetchGmxTickers).mockRejectedValue(new Error("network error"));

    const sampler = createImpactSampler(IMPACT_SAMPLER_DEPS);

    await expect(sampler.sampleOnce()).rejects.toThrow("network error");
  });
});
