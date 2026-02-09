/**
 * Adapter configuration validation schemas.
 *
 * @see {@link ../adrs/0010-exchange-adapters.md ADR-0010: Exchange Adapters}
 */

import * as v from "valibot";

export const AdapterConfigSchema = v.variant("exchange", [
  v.object({
    exchange: v.literal("coinbase"),
    apiKey: v.pipe(v.string(), v.minLength(1)),
    apiSecret: v.pipe(v.string(), v.minLength(1)),
  }),
  v.object({
    exchange: v.literal("binance"),
    apiKey: v.pipe(v.string(), v.minLength(1)),
    apiSecret: v.pipe(v.string(), v.minLength(1)),
  }),
  v.object({
    exchange: v.literal("bybit"),
    apiKey: v.pipe(v.string(), v.minLength(1)),
    apiSecret: v.pipe(v.string(), v.minLength(1)),
  }),
  v.object({
    exchange: v.literal("paper"),
    initialBalances: v.optional(v.record(v.string(), v.bigint())),
  }),
]);

export type AdapterConfig = v.InferOutput<typeof AdapterConfigSchema>;

export const parseAdapterConfig = (config: unknown): AdapterConfig =>
  v.parse(AdapterConfigSchema, config);

export const isAdapterConfig = (value: unknown): value is AdapterConfig =>
  v.is(AdapterConfigSchema, value);
