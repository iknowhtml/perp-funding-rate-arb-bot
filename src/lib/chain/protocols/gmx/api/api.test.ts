import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BTC_USD_MARKET } from "../types";
import { fetchGmxMarketsInfo, fetchGmxTickers } from "./api";

const BASE_URL = "https://arbitrum-api.gmxinfra.io";

describe("GMX API client", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("fetchGmxMarketsInfo", () => {
    it("should return GmxMarket[] when response is valid", async () => {
      const validMarkets = {
        markets: [
          {
            marketToken: BTC_USD_MARKET,
            name: "BTC/USD [ETH]",
            openInterestLong: "1000000000000",
            openInterestShort: "2000000000000",
            fundingRateLong: "100",
            fundingRateShort: "200",
            borrowingRateLong: "50",
            borrowingRateShort: "60",
          },
        ],
      };
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(validMarkets),
      });

      const result = await fetchGmxMarketsInfo(BASE_URL);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        marketToken: BTC_USD_MARKET,
        name: "BTC/USD [ETH]",
        openInterestLong: 1000000000000n,
        openInterestShort: 2000000000000n,
        fundingRateLong: 100n,
        fundingRateShort: 200n,
        borrowingRateLong: 50n,
        borrowingRateShort: 60n,
      });
    });

    it("should throw when response shape is invalid", async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ markets: [{ marketToken: "0x", name: "X" }] }), // missing required fields
      });

      await expect(fetchGmxMarketsInfo(BASE_URL)).rejects.toThrow(
        "GMX API response validation failed (markets/info)",
      );
    });

    it("should throw when HTTP response is not ok", async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
      });

      await expect(fetchGmxMarketsInfo(BASE_URL)).rejects.toThrow(
        "GMX markets/info failed: 502 Bad Gateway",
      );
    });
  });

  describe("fetchGmxTickers", () => {
    it("should return GmxTicker[] when response is valid", async () => {
      const validTickers = [
        { tokenSymbol: "BTC", minPrice: "95000000000000", maxPrice: "96000000000000" },
      ];
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(validTickers),
      });

      const result = await fetchGmxTickers(BASE_URL);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        tokenSymbol: "BTC",
        minPrice: 95000000000000n,
        maxPrice: 96000000000000n,
      });
    });

    it("should throw when response shape is invalid", async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ tokenSymbol: "BTC" }]), // missing minPrice, maxPrice
      });

      await expect(fetchGmxTickers(BASE_URL)).rejects.toThrow(
        "GMX API response validation failed (prices/tickers)",
      );
    });

    it("should throw when HTTP response is not ok", async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
      });

      await expect(fetchGmxTickers(BASE_URL)).rejects.toThrow(
        "GMX prices/tickers failed: 503 Service Unavailable",
      );
    });
  });
});
