/**
 * GMX Oracle API client for market info and price tickers.
 * Used by data-collector and impact-sampler for Arbitrum GMX v2.
 *
 * @see {@link ../../adrs/0019-on-chain-perps-pivot.md ADR-0019: On-Chain Perps Pivot}
 */

export const ETH_USD_MARKET = "0x70d95587d40A2caf56bd97485aB3Eec10Bee6336";
export const BTC_USD_MARKET = "0x47c031236e19d024b42f8AE6780E44A573170703";

export interface GmxMarket {
  marketToken: string;
  name: string;
  openInterestLong: bigint;
  openInterestShort: bigint;
  fundingRateLong: bigint;
  fundingRateShort: bigint;
  borrowingRateLong: bigint;
  borrowingRateShort: bigint;
}

export interface GmxTicker {
  tokenSymbol: string;
  minPrice: bigint;
  maxPrice: bigint;
}

interface GmxMarketsInfoResponse {
  markets: Array<{
    marketToken: string;
    name: string;
    openInterestLong: string;
    openInterestShort: string;
    fundingRateLong: string;
    fundingRateShort: string;
    borrowingRateLong: string;
    borrowingRateShort: string;
  }>;
}

const parseMarket = (m: GmxMarketsInfoResponse["markets"][number]): GmxMarket => ({
  marketToken: m.marketToken,
  name: m.name,
  openInterestLong: BigInt(m.openInterestLong),
  openInterestShort: BigInt(m.openInterestShort),
  fundingRateLong: BigInt(m.fundingRateLong),
  fundingRateShort: BigInt(m.fundingRateShort),
  borrowingRateLong: BigInt(m.borrowingRateLong),
  borrowingRateShort: BigInt(m.borrowingRateShort),
});

const parseTicker = (t: {
  tokenSymbol: string;
  minPrice: string;
  maxPrice: string;
}): GmxTicker => ({
  tokenSymbol: t.tokenSymbol,
  minPrice: BigInt(t.minPrice),
  maxPrice: BigInt(t.maxPrice),
});

/**
 * Fetch market info (funding, OI, borrow rates) from GMX Oracle API.
 */
export const fetchGmxMarketsInfo = async (baseUrl: string): Promise<GmxMarket[]> => {
  const url = `${baseUrl.replace(/\/$/, "")}/markets/info`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GMX markets/info failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as GmxMarketsInfoResponse;
  return (data.markets ?? []).map(parseMarket);
};

/**
 * Fetch price tickers from GMX Oracle API.
 */
export const fetchGmxTickers = async (baseUrl: string): Promise<GmxTicker[]> => {
  const url = `${baseUrl.replace(/\/$/, "")}/prices/tickers`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GMX prices/tickers failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as Array<{
    tokenSymbol: string;
    minPrice: string;
    maxPrice: string;
  }>;
  return (data ?? []).map(parseTicker);
};
