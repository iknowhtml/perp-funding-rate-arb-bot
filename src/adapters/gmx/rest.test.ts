import { describe, expect, it, vi } from "vitest";

import { fetchGmxMarketsInfo, fetchGmxTickers } from "./rest";

describe("fetchGmxTickers", () => {
  it("parses valid response", async () => {
    const mockTickers = [
      {
        tokenAddress: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
        tokenSymbol: "ETH",
        minPrice: "2046357312000000",
        maxPrice: "2046357312000000",
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTickers),
      }),
    );

    const result = await fetchGmxTickers("https://arbitrum-api.gmxinfra.io");
    expect(result).toHaveLength(1);
    expect(result[0].tokenSymbol).toBe("ETH");
    expect(result[0].minPrice).toBe(2046357312000000n);
  });

  it("handles empty response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      }),
    );

    const result = await fetchGmxTickers("https://arbitrum-api.gmxinfra.io");
    expect(result).toEqual([]);
  });

  it("handles network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    await expect(fetchGmxTickers("https://arbitrum-api.gmxinfra.io")).rejects.toThrow(
      "network error",
    );
  });

  it("handles HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      }),
    );

    await expect(fetchGmxTickers("https://arbitrum-api.gmxinfra.io")).rejects.toThrow(
      "GMX tickers fetch failed",
    );
  });
});

describe("fetchGmxMarketsInfo", () => {
  it("parses funding rates and OI", async () => {
    const mockMarkets = {
      markets: [
        {
          marketToken: "0x70d95587d40A2caf56bd97485aB3Eec10Bee6336",
          name: "ETH/USD [ETH-USDC]",
          openInterestLong: "12076359084583543586986342064761139868",
          openInterestShort: "12683005448449727372710622967549344436",
          fundingRateLong: "319512044237722857635168880000",
          fundingRateShort: "-304229324330671314627978172064",
          borrowingRateLong: "0",
          borrowingRateShort: "91292017714881990681797424000",
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockMarkets),
      }),
    );

    const result = await fetchGmxMarketsInfo("https://arbitrum-api.gmxinfra.io");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("ETH/USD [ETH-USDC]");
    expect(result[0].fundingRateLong).toBe(319512044237722857635168880000n);
    expect(result[0].openInterestShort).toBe(12683005448449727372710622967549344436n);
  });
});
