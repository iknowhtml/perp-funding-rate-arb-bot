/**
 * GMX protocol Valibot schemas for API and RPC boundary validation.
 *
 * @see {@link ../../../../../adrs/0019-on-chain-perps-pivot.md ADR-0019: On-Chain Perps Pivot}
 */

import { type Address, isAddress } from "viem";

import * as v from "valibot";

/** Valibot schema for address (0x-prefixed hex); validates at RPC boundary. */
export const addressSchema = v.pipe(
  v.string(),
  v.custom<Address>(
    (s: unknown) => typeof s === "string" && isAddress(s, { strict: false }),
    "Expected valid 0x address",
  ),
);

/** Valibot schema for a single market row from GET /markets/info (string amounts). */
export const rawMarketRowSchema = v.object({
  marketToken: v.string(),
  name: v.string(),
  openInterestLong: v.string(),
  openInterestShort: v.string(),
  fundingRateLong: v.optional(v.string(), "0"),
  fundingRateShort: v.optional(v.string(), "0"),
  borrowingRateLong: v.optional(v.string(), "0"),
  borrowingRateShort: v.optional(v.string(), "0"),
});

/** Valibot schema for GET /markets/info response. */
export const marketsInfoResponseSchema = v.object({
  markets: v.optional(v.array(rawMarketRowSchema), []),
});

/** Valibot schema for a single ticker row from GET /prices/tickers (string prices). */
export const rawTickerRowSchema = v.object({
  tokenSymbol: v.string(),
  minPrice: v.string(),
  maxPrice: v.string(),
});

/** Valibot schema for GET /prices/tickers response (array of ticker rows). */
export const tickersResponseSchema = v.array(rawTickerRowSchema);

/** Valibot schema for getAccountPositions raw return (validates at RPC boundary). */
export const gmxAccountPositionRawSchema = v.object({
  addresses: v.object({
    account: addressSchema,
    market: addressSchema,
    collateralToken: addressSchema,
  }),
  numbers: v.object({
    sizeInUsd: v.bigint(),
    sizeInTokens: v.bigint(),
    collateralAmount: v.bigint(),
    increasedAtTime: v.bigint(),
    decreasedAtTime: v.bigint(),
  }),
  flags: v.object({ isLong: v.boolean() }),
});

/** Valibot schema for array of account positions. */
export const gmxAccountPositionsArraySchema = v.array(gmxAccountPositionRawSchema);
