/**
 * Unit tests for GMX protocol adapter.
 */

import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type GmxProtocolAdapterConfig, createGmxProtocolAdapter } from "./adapter";
import {
  compute4hMaFundingRateBps,
  getFundingRateForMarket,
  getGmBalance,
  getMarketsInfo,
  getOiSkewForMarket,
  getPositionState,
  getTickers,
} from "./reads";

vi.mock("./reads", () => ({
  compute4hMaFundingRateBps: vi.fn(),
  getFundingRateForMarket: vi.fn(),
  getGmBalance: vi.fn(),
  getMarketsInfo: vi.fn(),
  getOiSkewForMarket: vi.fn(),
  getPositionState: vi.fn(),
  getTickers: vi.fn(),
}));

const baseUrl = "https://arbitrum-api.gmxinfra.io";
const account = "0x1234567890123456789012345678901234567890" as Address;
const market = "0x70d95587d40A2caf56bd97485aB3Eec10Bee6336" as Address;

describe("createGmxProtocolAdapter", () => {
  beforeEach(() => {
    vi.mocked(compute4hMaFundingRateBps).mockReset();
    vi.mocked(getFundingRateForMarket).mockReset();
    vi.mocked(getGmBalance).mockReset();
    vi.mocked(getMarketsInfo).mockReset();
    vi.mocked(getOiSkewForMarket).mockReset();
    vi.mocked(getPositionState).mockReset();
    vi.mocked(getTickers).mockReset();
  });

  it("returns adapter with getMarketsInfo and getTickers from REST", async () => {
    vi.mocked(getMarketsInfo).mockResolvedValue([
      {
        marketToken: market,
        name: "ETH/USD",
        openInterestLong: 1_000_000n,
        openInterestShort: 2_000_000n,
        fundingRateLong: 10n,
        fundingRateShort: 20n,
        borrowingRateLong: 5n,
        borrowingRateShort: 5n,
      },
    ]);
    vi.mocked(getTickers).mockResolvedValue([
      { tokenSymbol: "ETH", minPrice: 3_000_000_000n, maxPrice: 3_100_000_000n },
    ]);

    const config: GmxProtocolAdapterConfig = { baseUrl };
    const adapter = createGmxProtocolAdapter(config);

    const markets = await adapter.getMarketsInfo();
    expect(markets).toHaveLength(1);
    expect(getMarketsInfo).toHaveBeenCalledWith(baseUrl);

    const tickers = await adapter.getTickers();
    expect(tickers).toHaveLength(1);
    expect(getTickers).toHaveBeenCalledWith(baseUrl);
  });

  it("returns null for getPositionState when account not configured", async () => {
    const config: GmxProtocolAdapterConfig = { baseUrl };
    const adapter = createGmxProtocolAdapter(config);

    const result = await adapter.getPositionState(market);

    expect(result).toBeNull();
  });

  it("returns zero balance for getLiquidityBalance when account not configured", async () => {
    const config: GmxProtocolAdapterConfig = { baseUrl };
    const adapter = createGmxProtocolAdapter(config);

    const result = await adapter.getLiquidityBalance("0xpool");

    expect(result).toEqual({ pool: "0xpool", balance: 0n });
  });

  it("calls getPositionStateRead when publicClient and account configured", async () => {
    const mockPublicClient = { readContract: vi.fn() };
    vi.mocked(getPositionState).mockResolvedValue({
      ts: new Date(),
      market,
      perpPosition: {
        sizeUsd: 50_000_000_000n,
        entryPrice: 0n,
        pnlUsd: 0n,
        liquidationPrice: null,
      },
      gmBalance: 0n,
      gmCostBasisUsd: 0n,
      gmMtmValueUsd: 0n,
    });

    const config: GmxProtocolAdapterConfig = {
      baseUrl,
      publicClient: mockPublicClient as unknown as NonNullable<
        GmxProtocolAdapterConfig["publicClient"]
      >,
      account,
    };
    const adapter = createGmxProtocolAdapter(config);

    const result = await adapter.getPositionState(market);

    expect(getPositionState).toHaveBeenCalled();
    expect(result).not.toBeNull();
    if (result) {
      expect(result.market).toBe(market);
      expect(result.perpPosition?.sizeUsd).toBe(50_000_000_000n);
    }
  });

  it("getMaFundingRate returns raw long rate when no samples", async () => {
    vi.mocked(getMarketsInfo).mockResolvedValue([
      {
        marketToken: market,
        name: "ETH/USD",
        openInterestLong: 1_000_000n,
        openInterestShort: 2_000_000n,
        fundingRateLong: 15n,
        fundingRateShort: 25n,
        borrowingRateLong: 5n,
        borrowingRateShort: 5n,
      },
    ]);
    vi.mocked(getFundingRateForMarket).mockReturnValue({
      fundingRateLong: 15n,
      fundingRateShort: 25n,
    });

    const config: GmxProtocolAdapterConfig = { baseUrl };
    const adapter = createGmxProtocolAdapter(config);

    const rate = await adapter.getMaFundingRate(market);

    expect(rate).toBe(15n);
  });

  it("getMaFundingRate uses compute4hMaFundingRateBps when samples provided", async () => {
    vi.mocked(getMarketsInfo).mockResolvedValue([]);
    vi.mocked(compute4hMaFundingRateBps).mockReturnValue(12n);

    const config: GmxProtocolAdapterConfig = { baseUrl };
    const adapter = createGmxProtocolAdapter(config);

    const rate = await adapter.getMaFundingRate(market, [10n, 12n, 14n]);

    expect(compute4hMaFundingRateBps).toHaveBeenCalledWith([10n, 12n, 14n]);
    expect(rate).toBe(12n);
  });

  it("getOiSkew returns OI skew for market", async () => {
    vi.mocked(getMarketsInfo).mockResolvedValue([]);
    vi.mocked(getOiSkewForMarket).mockReturnValue({
      longOi: 100_000n,
      shortOi: 50_000n,
    });

    const config: GmxProtocolAdapterConfig = { baseUrl };
    const adapter = createGmxProtocolAdapter(config);

    const skew = await adapter.getOiSkew(market);

    expect(skew).toEqual({ longOi: 100_000n, shortOi: 50_000n });
  });

  it("simulateOrder returns zero impactBps", async () => {
    const config: GmxProtocolAdapterConfig = { baseUrl };
    const adapter = createGmxProtocolAdapter(config);

    const result = await adapter.simulateOrder({
      market,
      sizeUsd: 50_000_000_000n,
      acceptablePrice: 3_000_000_000n,
    });

    expect(result).toEqual({ impactBps: 0n });
  });

  it("submitOrder throws not yet implemented", async () => {
    const config: GmxProtocolAdapterConfig = { baseUrl };
    const adapter = createGmxProtocolAdapter(config);

    await expect(
      adapter.submitOrder({
        market,
        sizeUsd: 50_000_000_000n,
        acceptablePrice: 3_000_000_000n,
      }),
    ).rejects.toThrow("GMX submitOrder not yet implemented");
  });
});
