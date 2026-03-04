/**
 * Unit tests for GMX protocol adapter.
 */

import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type GmxProtocolAdapterConfig, createGmxProtocolAdapter } from "./adapter";

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));
import {
  compute4hMaFundingRateBps,
  getExecutionPriceFromReader,
  getFundingRateForMarket,
  getGmBalance,
  getMarketsInfo,
  getOiSkewForMarket,
  getPositionState,
  getTickers,
} from "./reads";

vi.mock("./reads", () => ({
  compute4hMaFundingRateBps: vi.fn(),
  getExecutionPriceFromReader: vi.fn(),
  getFundingRateForMarket: vi.fn(),
  getGmBalance: vi.fn(),
  getMarketsInfo: vi.fn(),
  getOiSkewForMarket: vi.fn(),
  getPositionState: vi.fn(),
  getTickers: vi.fn(),
}));

const baseUrl = "https://arbitrum-api.gmxinfra.io";
const account: Address = "0x1234567890123456789012345678901234567890";
const market: Address = "0x70d95587d40A2caf56bd97485aB3Eec10Bee6336";

const mockPublicClient = { readContract: vi.fn() };

const minimalConfig = (
  overrides?: Partial<GmxProtocolAdapterConfig>,
): GmxProtocolAdapterConfig => ({
  baseUrl,
  publicClient: mockPublicClient as unknown as NonNullable<
    GmxProtocolAdapterConfig["publicClient"]
  >,
  account,
  chainId: 42161,
  ...overrides,
});

describe("createGmxProtocolAdapter", () => {
  beforeEach(() => {
    vi.mocked(compute4hMaFundingRateBps).mockReset();
    vi.mocked(getExecutionPriceFromReader).mockReset();
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

    const config = minimalConfig();
    const adapter = createGmxProtocolAdapter(config);

    const markets = await adapter.getMarketsInfo();
    expect(markets).toHaveLength(1);
    expect(getMarketsInfo).toHaveBeenCalledWith(baseUrl);

    const tickers = await adapter.getTickers();
    expect(tickers).toHaveLength(1);
    expect(getTickers).toHaveBeenCalledWith(baseUrl);
  });

  it("throws when account is not provided", () => {
    expect(() =>
      createGmxProtocolAdapter({
        ...minimalConfig(),
        account: undefined as unknown as Address,
      }),
    ).toThrow("account is required");
  });

  it("throws when publicClient is not provided", () => {
    expect(() =>
      createGmxProtocolAdapter({
        ...minimalConfig(),
        publicClient: undefined as unknown as NonNullable<GmxProtocolAdapterConfig["publicClient"]>,
      }),
    ).toThrow("publicClient is required");
  });

  it("calls getPositionStateRead when publicClient and account configured", async () => {
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

    const config = minimalConfig();
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

    const config = minimalConfig();
    const adapter = createGmxProtocolAdapter(config);

    const rate = await adapter.getMaFundingRate(market);

    expect(rate).toBe(15n);
  });

  it("getMaFundingRate uses compute4hMaFundingRateBps when samples provided", async () => {
    vi.mocked(getMarketsInfo).mockResolvedValue([]);
    vi.mocked(compute4hMaFundingRateBps).mockReturnValue(12n);

    const config = minimalConfig();
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

    const config = minimalConfig();
    const adapter = createGmxProtocolAdapter(config);

    const skew = await adapter.getOiSkew(market);

    expect(skew).toEqual({ longOi: 100_000n, shortOi: 50_000n });
  });

  it("simulateOrder returns impactBps from Reader when publicClient provided", async () => {
    vi.mocked(getTickers).mockResolvedValue([
      { tokenSymbol: "ETH", minPrice: 3000n * 10n ** 30n, maxPrice: 3010n * 10n ** 30n },
    ] as never);
    vi.mocked(getExecutionPriceFromReader).mockResolvedValue({
      executionPrice: 2995n * 10n ** 30n,
      priceImpactUsd: -50n * 10n ** 30n, // -50 USD in 30 decimals => 10 bps for 50k size
    });

    const adapter = createGmxProtocolAdapter(minimalConfig());

    const result = await adapter.simulateOrder({
      market,
      positionSizeUsd: 50_000n * 10n ** 30n,
      acceptablePriceUsd: 3000n * 10n ** 30n,
    });

    expect(getExecutionPriceFromReader).toHaveBeenCalledWith(
      expect.objectContaining({
        market,
        price: { min: 3000n * 10n ** 30n, max: 3010n * 10n ** 30n },
        positionSizeUsd: 50_000n * 10n ** 30n,
        isLong: false,
      }),
    );
    expect(result.impactBps).toBe(10n); // |priceImpactUsd| 50e30, sizeUsd 50_000e30 => 50*10000/50000 = 10 bps
  });

  it("submitOrder throws not yet implemented", async () => {
    const config = minimalConfig();
    const adapter = createGmxProtocolAdapter(config);

    await expect(
      adapter.submitOrder({
        market,
        positionSizeUsd: 50_000_000_000n,
        acceptablePriceUsd: 3_000_000_000n,
      }),
    ).rejects.toThrow("GMX submitOrder not yet implemented");
  });
});
