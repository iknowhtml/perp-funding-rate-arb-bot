/**
 * GMX Oracle API client for market info and price tickers.
 * Used by data-collector and impact-sampler for Arbitrum GMX v2.
 *
 * GMX does not publish OpenAPI/Swagger specs for arbitrum-api.gmxinfra.io; /openapi.json
 * and /swagger.json return 404. Types and parsing are hand-maintained from the REST docs:
 * https://docs.gmx.io/docs/api/rest/
 *
 * @see {@link ../../../adrs/0019-on-chain-perps-pivot.md ADR-0019: On-Chain Perps Pivot}
 */

import * as v from "valibot";

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

/** Valibot schema for a single market row from GET /markets/info (string amounts). */
const rawMarketRowSchema = v.object({
  marketToken: v.string(),
  name: v.string(),
  openInterestLong: v.string(),
  openInterestShort: v.string(),
  fundingRateLong: v.string(),
  fundingRateShort: v.string(),
  borrowingRateLong: v.string(),
  borrowingRateShort: v.string(),
});

/** Valibot schema for GET /markets/info response. */
const marketsInfoResponseSchema = v.object({
  markets: v.optional(v.array(rawMarketRowSchema), []),
});

type RawMarketRow = v.InferOutput<typeof rawMarketRowSchema>;

/** Valibot schema for a single ticker row from GET /prices/tickers (string prices). */
const rawTickerRowSchema = v.object({
  tokenSymbol: v.string(),
  minPrice: v.string(),
  maxPrice: v.string(),
});

/** Valibot schema for GET /prices/tickers response (array of ticker rows). */
const tickersResponseSchema = v.array(rawTickerRowSchema);

type RawTickerRow = v.InferOutput<typeof rawTickerRowSchema>;

/**
 * Maps a validated raw market row to our GmxMarket type.
 * Converts string amounts to bigint for funding/OI/borrow rates.
 */
const parseMarket = (rawMarket: RawMarketRow): GmxMarket => ({
  marketToken: rawMarket.marketToken,
  name: rawMarket.name,
  openInterestLong: BigInt(rawMarket.openInterestLong),
  openInterestShort: BigInt(rawMarket.openInterestShort),
  fundingRateLong: BigInt(rawMarket.fundingRateLong),
  fundingRateShort: BigInt(rawMarket.fundingRateShort),
  borrowingRateLong: BigInt(rawMarket.borrowingRateLong),
  borrowingRateShort: BigInt(rawMarket.borrowingRateShort),
});

/**
 * Maps a validated raw ticker row to our GmxTicker type.
 * Converts string prices to bigint.
 */
const parseTicker = (rawTicker: RawTickerRow): GmxTicker => ({
  tokenSymbol: rawTicker.tokenSymbol,
  minPrice: BigInt(rawTicker.minPrice),
  maxPrice: BigInt(rawTicker.maxPrice),
});

/**
 * Fetch market info (funding, OI, borrow rates) from GMX Oracle API.
 * Response is validated with Valibot before mapping to GmxMarket[].
 *
 * No @gmx-io/sdk util is used here: the SDK's getMarketsInfo() returns hydrated MarketInfo
 * from multicall + tokens (different shape, chainId, and deps). The SDK's REST-based
 * fetchApiMarketsInfo + deserializeBigIntsInObject are internal and not part of the public
 * API. This module keeps a minimal REST client and parseMarket maps the public Oracle
 * response to our GmxMarket type.
 */
export const fetchGmxMarketsInfo = async (baseUrl: string): Promise<GmxMarket[]> => {
  const url = `${baseUrl.replace(/\/$/, "")}/markets/info`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GMX markets/info failed: ${res.status} ${res.statusText}`);
  }
  const json: unknown = await res.json();
  let data: v.InferOutput<typeof marketsInfoResponseSchema>;
  try {
    data = v.parse(marketsInfoResponseSchema, json);
  } catch (parseError) {
    const message = parseError instanceof Error ? parseError.message : String(parseError);
    throw new Error(`GMX API response validation failed (markets/info): ${message}`);
  }
  return data.markets.map(parseMarket);
};

/**
 * Fetch price tickers from GMX Oracle API.
 * Response is validated with Valibot before mapping to GmxTicker[].
 */
export const fetchGmxTickers = async (baseUrl: string): Promise<GmxTicker[]> => {
  const url = `${baseUrl.replace(/\/$/, "")}/prices/tickers`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GMX prices/tickers failed: ${res.status} ${res.statusText}`);
  }
  const json: unknown = await res.json();
  let data: v.InferOutput<typeof tickersResponseSchema>;
  try {
    data = v.parse(tickersResponseSchema, json);
  } catch (parseError) {
    const message = parseError instanceof Error ? parseError.message : String(parseError);
    throw new Error(`GMX API response validation failed (prices/tickers): ${message}`);
  }
  return data.map(parseTicker);
};
