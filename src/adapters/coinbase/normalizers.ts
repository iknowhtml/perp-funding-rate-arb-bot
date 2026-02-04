/**
 * Normalizers for converting Coinbase SDK types to domain types.
 *
 * All normalizers validate input with Valibot schemas to catch API drift.
 *
 * @see {@link ../../../adrs/0010-exchange-adapters.md ADR-0010: Exchange Adapters}
 */

import * as v from "valibot";

import type { Balance, FundingRate } from "../types";
import {
  CoinbaseAccountSchema,
  CoinbaseListAccountsResponseSchema,
  CoinbaseProductSchema,
} from "./schemas";

/** Parse decimal string to bigint basis points (1 bps = 0.0001 = 0.01%) */
export const parseRateToBps = (rate: string): bigint => {
  const decimal = Number.parseFloat(rate);
  return BigInt(Math.round(decimal * 10000)); // 0.0001 → 1n
};

/** Parse decimal string to bigint with given scale */
export const parseDecimalToBigInt = (value: string, decimals: number): bigint => {
  const [whole, frac = ""] = value.split(".");
  const paddedFrac = frac.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole + paddedFrac);
};

/**
 * Normalize Coinbase product response to FundingRate domain type.
 *
 * @param response - Raw Coinbase product response (validated with Valibot)
 * @returns Normalized FundingRate with rateBps as bigint
 */
export const normalizeFundingRate = (response: unknown): FundingRate => {
  const parsed = v.parse(CoinbaseProductSchema, response);
  const perpetualDetails = parsed.futureProductDetails?.perpetualDetails;

  return {
    symbol: parsed.productId,
    rateBps: perpetualDetails?.fundingRate ? parseRateToBps(perpetualDetails.fundingRate) : 0n,
    nextFundingTime: perpetualDetails?.fundingTime
      ? new Date(perpetualDetails.fundingTime)
      : new Date(),
    timestamp: new Date(),
  };
};

/**
 * Normalize Coinbase account response to Balance domain type.
 *
 * @param response - Raw Coinbase account response (validated with Valibot)
 * @returns Normalized Balance with amounts as bigint
 */
export const normalizeBalance = (response: unknown): Balance => {
  const parsed = v.parse(CoinbaseAccountSchema, response);
  const available = parseDecimalToBigInt(parsed.availableBalance.value, 8);
  const held = parsed.hold ? parseDecimalToBigInt(parsed.hold.value, 8) : 0n;

  return {
    asset: parsed.currency,
    availableBase: available,
    heldBase: held,
    totalBase: available + held,
  };
};

/**
 * Normalize Coinbase list accounts response to Balance array.
 *
 * @param response - Raw Coinbase list accounts response (validated with Valibot)
 * @returns Array of normalized Balance objects
 */
export const normalizeBalances = (response: unknown): Balance[] => {
  const parsed = v.parse(CoinbaseListAccountsResponseSchema, response);
  return (parsed.accounts ?? []).map(normalizeBalance);
};
