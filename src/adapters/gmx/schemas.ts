import * as v from "valibot";

const bigintFromString = v.pipe(
  v.string(),
  v.transform((s) => BigInt(s)),
);

export const tickerSchema = v.object({
  tokenAddress: v.string(),
  tokenSymbol: v.string(),
  minPrice: bigintFromString,
  maxPrice: bigintFromString,
});

export const marketInfoSchema = v.object({
  marketToken: v.string(),
  name: v.string(),
  openInterestLong: bigintFromString,
  openInterestShort: bigintFromString,
  fundingRateLong: bigintFromString,
  fundingRateShort: bigintFromString,
  borrowingRateLong: bigintFromString,
  borrowingRateShort: bigintFromString,
});

export const tickersResponseSchema = v.array(tickerSchema);
export const marketsInfoResponseSchema = v.object({
  markets: v.array(marketInfoSchema),
});

export type Ticker = v.InferOutput<typeof tickerSchema>;
export type MarketInfo = v.InferOutput<typeof marketInfoSchema>;
