/**
 * Unit tests for GMX read operations (positions, balances, market info).
 */

import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChainError } from "../errors";
import type { GmxAccountPositionRaw, GmxReadsDeps } from "../types";
import {
  compute4hMaFundingRateBps,
  getAccountPositions,
  getFundingRateForMarket,
  getGmBalance,
  getMarketsInfo,
  getOiSkewForMarket,
  getPositionState,
  getTickers,
  getTokenBalance,
} from "./reads";

vi.mock("@gmx-io/sdk/configs/contracts", () => ({
  getContract: (_chainId: number, name: string) =>
    name === "SyntheticsReader"
      ? "0x470fbC46bcC0f16532691Df360A07d8Bf5ee0789"
      : "0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8",
}));
vi.mock("../api", () => ({
  fetchGmxMarketsInfo: vi.fn(),
  fetchGmxTickers: vi.fn(),
}));

const mockPublicClient = {
  readContract: vi.fn(),
};

const deps: GmxReadsDeps = {
  publicClient: mockPublicClient as unknown as GmxReadsDeps["publicClient"],
};

const account = "0x1234567890123456789012345678901234567890" as Address;
const market = "0x70d95587d40A2caf56bd97485aB3Eec10Bee6336" as Address;

describe("getAccountPositions", () => {
  beforeEach(() => {
    vi.mocked(mockPublicClient.readContract).mockReset();
  });

  it("returns raw positions from Reader", async () => {
    const rawPositions: GmxAccountPositionRaw[] = [
      {
        addresses: {
          account,
          market,
          collateralToken: "0xaf88d065e77c8cc2239327c5edb3a432268e5831" as Address,
        },
        numbers: {
          sizeInUsd: 50_000_000_000n,
          sizeInTokens: 1_000_000n,
          collateralAmount: 50_000_000n,
          increasedAtTime: 1_700_000_000n,
          decreasedAtTime: 0n,
        },
        flags: { isLong: false },
      },
    ];
    mockPublicClient.readContract.mockResolvedValue(rawPositions);

    const result = await getAccountPositions(deps, account);

    expect(result).toEqual(rawPositions);
    expect(mockPublicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "getAccountPositions",
        args: ["0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8", account, 0n, 100n],
      }),
    );
  });

  it("throws ChainError RPC_ERROR when readContract fails", async () => {
    mockPublicClient.readContract.mockRejectedValue(new Error("RPC timeout"));

    await expect(getAccountPositions(deps, account)).rejects.toThrow(ChainError);
    await expect(getAccountPositions(deps, account)).rejects.toMatchObject({
      code: "RPC_ERROR",
      message: expect.stringContaining("getAccountPositions failed"),
    });
  });
});

describe("getTokenBalance", () => {
  beforeEach(() => {
    vi.mocked(mockPublicClient.readContract).mockReset();
  });

  it("returns ERC20 balance", async () => {
    mockPublicClient.readContract.mockResolvedValue(1_000_000n);
    const tokenAddress = "0xaf88d065e77c8cc2239327c5edb3a432268e5831" as Address;

    const balance = await getTokenBalance(deps, tokenAddress, account);

    expect(balance).toBe(1_000_000n);
    expect(mockPublicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "balanceOf",
        args: [account],
      }),
    );
  });

  it("throws ChainError RPC_ERROR when readContract fails", async () => {
    mockPublicClient.readContract.mockRejectedValue(new Error("RPC error"));
    const tokenAddress = "0xaf88d065e77c8cc2239327c5edb3a432268e5831" as Address;

    await expect(getTokenBalance(deps, tokenAddress, account)).rejects.toThrow(ChainError);
    await expect(getTokenBalance(deps, tokenAddress, account)).rejects.toMatchObject({
      code: "RPC_ERROR",
    });
  });
});

describe("getPositionState", () => {
  beforeEach(() => {
    vi.mocked(mockPublicClient.readContract).mockReset();
  });

  it("returns null when no position for market", async () => {
    mockPublicClient.readContract.mockResolvedValue([]);

    const result = await getPositionState(deps, account, market);

    expect(result).toBeNull();
  });

  it("returns PositionState when position exists for market", async () => {
    const rawPositions: GmxAccountPositionRaw[] = [
      {
        addresses: {
          account,
          market,
          collateralToken: "0xaf88d065e77c8cc2239327c5edb3a432268e5831" as Address,
        },
        numbers: {
          sizeInUsd: 50_000_000_000n,
          sizeInTokens: 1_000_000n,
          collateralAmount: 50_000_000n,
          increasedAtTime: 1_700_000_000n,
          decreasedAtTime: 0n,
        },
        flags: { isLong: false },
      },
    ];
    mockPublicClient.readContract.mockResolvedValue(rawPositions);

    const result = await getPositionState(deps, account, market);

    expect(result).not.toBeNull();
    if (result) {
      expect(result.market).toBe(market);
      expect(result.perpPosition?.sizeUsd).toBe(50_000_000_000n);
      expect(result.gmBalance).toBe(0n);
    }
  });
});

describe("getMarketsInfo", () => {
  it("returns markets from REST API", async () => {
    const { fetchGmxMarketsInfo } = await import("../api");
    vi.mocked(fetchGmxMarketsInfo).mockResolvedValue([
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

    const result = await getMarketsInfo("https://arbitrum-api.gmxinfra.io");

    expect(result).toHaveLength(1);
    const firstMarket = result[0];
    expect(firstMarket).toBeDefined();
    if (firstMarket) {
      expect(firstMarket.marketToken).toBe(market);
    }
  });

  it("throws ChainError when fetch fails", async () => {
    const { fetchGmxMarketsInfo } = await import("../api");
    vi.mocked(fetchGmxMarketsInfo).mockRejectedValue(new Error("HTTP 500"));

    await expect(getMarketsInfo("https://arbitrum-api.gmxinfra.io")).rejects.toThrow(ChainError);
    await expect(getMarketsInfo("https://arbitrum-api.gmxinfra.io")).rejects.toMatchObject({
      code: "RPC_ERROR",
    });
  });
});

describe("getTickers", () => {
  it("returns tickers from REST API", async () => {
    const { fetchGmxTickers } = await import("../api");
    vi.mocked(fetchGmxTickers).mockResolvedValue([
      { tokenSymbol: "ETH", minPrice: 3_000_000_000n, maxPrice: 3_100_000_000n },
    ]);

    const result = await getTickers("https://arbitrum-api.gmxinfra.io");

    expect(result).toHaveLength(1);
    const firstTicker = result[0];
    expect(firstTicker).toBeDefined();
    if (firstTicker) {
      expect(firstTicker.tokenSymbol).toBe("ETH");
    }
  });

  it("throws ChainError when fetch fails", async () => {
    const { fetchGmxTickers } = await import("../api");
    vi.mocked(fetchGmxTickers).mockRejectedValue(new Error("Network error"));

    await expect(getTickers("https://arbitrum-api.gmxinfra.io")).rejects.toThrow(ChainError);
  });
});

describe("getFundingRateForMarket", () => {
  it("returns funding rate when market exists", () => {
    const markets = [
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
    ];
    const result = getFundingRateForMarket(markets, market);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.fundingRateLong).toBe(10n);
      expect(result.fundingRateShort).toBe(20n);
    }
  });

  it("returns null when market not found", () => {
    const result = getFundingRateForMarket([], market);
    expect(result).toBeNull();
  });
});

describe("compute4hMaFundingRateBps", () => {
  it("returns average of samples", () => {
    expect(compute4hMaFundingRateBps([10n, 20n, 30n, 40n])).toBe(25n);
  });

  it("returns single sample when one element", () => {
    expect(compute4hMaFundingRateBps([12n])).toBe(12n);
  });

  it("returns 0n when no samples", () => {
    expect(compute4hMaFundingRateBps([])).toBe(0n);
  });
});

describe("getOiSkewForMarket", () => {
  it("returns OI skew when market exists", () => {
    const markets = [
      {
        marketToken: market,
        name: "ETH/USD",
        openInterestLong: 100_000n,
        openInterestShort: 50_000n,
        fundingRateLong: 10n,
        fundingRateShort: 20n,
        borrowingRateLong: 5n,
        borrowingRateShort: 5n,
      },
    ];
    const result = getOiSkewForMarket(markets, market);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.longOi).toBe(100_000n);
      expect(result.shortOi).toBe(50_000n);
    }
  });

  it("returns null when market not found", () => {
    const result = getOiSkewForMarket([], market);
    expect(result).toBeNull();
  });
});

describe("getGmBalance", () => {
  beforeEach(() => {
    vi.mocked(mockPublicClient.readContract).mockReset();
  });

  it("returns GM token balance via getTokenBalance", async () => {
    const gmTokenAddress = "0x4277f8f2c384827b5273592ff7cebd9f2c1ac258" as Address;
    mockPublicClient.readContract.mockResolvedValue(5_000_000n);

    const balance = await getGmBalance(deps, gmTokenAddress, account);

    expect(balance).toBe(5_000_000n);
    expect(mockPublicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "balanceOf",
        args: [account],
      }),
    );
  });
});
