/**
 * Valibot schemas for Coinbase Advanced Trade API responses.
 *
 * These schemas validate API responses at runtime to catch API drift.
 *
 * @see {@link ../../../adrs/0010-exchange-adapters.md ADR-0010: Exchange Adapters}
 */

import * as v from "valibot";

/** Schema for Coinbase perpetual product details */
export const CoinbasePerpetualDetailsSchema = v.object({
  fundingRate: v.optional(v.string()),
  fundingTime: v.optional(v.string()),
  openInterest: v.optional(v.string()),
  maxLeverage: v.optional(v.string()),
});

/** Schema for Coinbase product response */
export const CoinbaseProductSchema = v.object({
  productId: v.string(),
  price: v.optional(v.string()),
  pricePercentageChange24h: v.optional(v.string()),
  volume24h: v.optional(v.string()),
  futureProductDetails: v.optional(
    v.object({
      perpetualDetails: v.optional(CoinbasePerpetualDetailsSchema),
    }),
  ),
});

/** Schema for Coinbase account balance */
export const CoinbaseAccountSchema = v.object({
  uuid: v.string(),
  name: v.string(),
  currency: v.string(),
  availableBalance: v.object({
    value: v.string(),
    currency: v.string(),
  }),
  hold: v.optional(
    v.object({
      value: v.string(),
      currency: v.string(),
    }),
  ),
});

/** Schema for Coinbase list accounts response */
export const CoinbaseListAccountsResponseSchema = v.object({
  accounts: v.optional(v.array(CoinbaseAccountSchema)),
});
