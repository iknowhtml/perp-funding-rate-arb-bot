/**
 * GMX Oracle API client for market info and price tickers.
 *
 * @see {@link ../../../../../../adrs/0019-on-chain-perps-pivot.md ADR-0019: On-Chain Perps Pivot}
 */

import * as v from "valibot";

import {
  marketsInfoResponseSchema,
  type rawMarketRowSchema,
  type rawTickerRowSchema,
  tickersResponseSchema,
} from "../schema";
import type { GmxMarket, GmxTicker } from "../types";

type RawMarketRow = v.InferOutput<typeof rawMarketRowSchema>;
type RawTickerRow = v.InferOutput<typeof rawTickerRowSchema>;

const parseMarket = (rawMarket: RawMarketRow): GmxMarket => ({
  marketToken: rawMarket.marketToken,
  name: rawMarket.name,
  openInterestLong: BigInt(rawMarket.openInterestLong),
  openInterestShort: BigInt(rawMarket.openInterestShort),
  fundingRateLong: BigInt(rawMarket.fundingRateLong ?? "0"),
  fundingRateShort: BigInt(rawMarket.fundingRateShort ?? "0"),
  borrowingRateLong: BigInt(rawMarket.borrowingRateLong ?? "0"),
  borrowingRateShort: BigInt(rawMarket.borrowingRateShort ?? "0"),
});

const parseTicker = (rawTicker: RawTickerRow): GmxTicker => ({
  tokenSymbol: rawTicker.tokenSymbol,
  minPrice: BigInt(rawTicker.minPrice),
  maxPrice: BigInt(rawTicker.maxPrice),
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
