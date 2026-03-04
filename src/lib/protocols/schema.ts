/**
 * Exchange adapter Valibot schemas for validation.
 *
 * @see {@link ../../../adrs/0010-exchange-adapters.md ADR-0010}
 * @see {@link ../../../adrs/0022-regime-based-gmx-arb.md ADR-0022}
 * @see {@link ../../../adrs/0021-on-chain-pnl-accounting.md ADR-0021}
 */

import * as v from "valibot";

export const orderSideSchema = v.picklist(["BUY", "SELL"] as const);

export const orderTypeSchema = v.picklist(["MARKET", "LIMIT", "STOP", "STOP_LIMIT"] as const);

export const exchangeOrderStatusSchema = v.picklist([
  "PENDING",
  "OPEN",
  "PARTIALLY_FILLED",
  "FILLED",
  "CANCELLED",
  "REJECTED",
  "EXPIRED",
] as const);

export const positionSideSchema = v.picklist(["LONG", "SHORT"] as const);

export const balanceSchema = v.object({
  asset: v.string(),
  availableBase: v.bigint(),
  heldBase: v.bigint(),
  totalBase: v.bigint(),
});

export const exchangeOrderSchema = v.object({
  id: v.string(),
  exchangeOrderId: v.string(),
  symbol: v.string(),
  side: orderSideSchema,
  type: orderTypeSchema,
  status: exchangeOrderStatusSchema,
  quantityBase: v.bigint(),
  filledQuantityBase: v.bigint(),
  priceQuote: v.nullable(v.bigint()),
  avgFillPriceQuote: v.nullable(v.bigint()),
  createdAt: v.date(),
  updatedAt: v.date(),
});

export const fillSchema = v.object({
  id: v.string(),
  orderId: v.string(),
  exchangeOrderId: v.string(),
  symbol: v.string(),
  side: orderSideSchema,
  quantityBase: v.bigint(),
  priceQuote: v.bigint(),
  feeQuote: v.bigint(),
  feeAsset: v.string(),
  timestamp: v.date(),
});

export const positionSchema = v.object({
  symbol: v.string(),
  side: positionSideSchema,
  sizeBase: v.bigint(),
  entryPriceQuote: v.bigint(),
  markPriceQuote: v.bigint(),
  liquidationPriceQuote: v.nullable(v.bigint()),
  unrealizedPnlQuote: v.bigint(),
  leverageBps: v.bigint(),
  marginQuote: v.bigint(),
});

export const tickerSchema = v.object({
  symbol: v.string(),
  bidPriceQuote: v.bigint(),
  askPriceQuote: v.bigint(),
  lastPriceQuote: v.bigint(),
  volumeBase: v.bigint(),
  timestamp: v.date(),
});

export const fundingRateSchema = v.object({
  symbol: v.string(),
  rateBps: v.bigint(),
  nextFundingTime: v.date(),
  timestamp: v.date(),
});

export const orderBookLevelSchema = v.object({
  priceQuote: v.bigint(),
  quantityBase: v.bigint(),
});

export const orderBookSchema = v.object({
  symbol: v.string(),
  bids: v.array(orderBookLevelSchema),
  asks: v.array(orderBookLevelSchema),
  timestamp: v.date(),
});

export const createOrderParamsSchema = v.object({
  symbol: v.string(),
  side: orderSideSchema,
  type: orderTypeSchema,
  quantityBase: v.bigint(),
  priceQuote: v.optional(v.bigint()),
  stopPriceQuote: v.optional(v.bigint()),
  timeInForce: v.optional(v.picklist(["GTC", "IOC", "FOK"] as const)),
  reduceOnly: v.optional(v.boolean()),
});

export const txResultSchema = v.object({
  hash: v.string(),
  success: v.boolean(),
});

export const openPositionParamsSchema = v.object({
  market: v.string(),
  sizeUsd: v.bigint(),
  acceptablePrice: v.bigint(),
});

export const liquidityBalanceSchema = v.object({
  pool: v.string(),
  balance: v.bigint(),
});

export const oiSkewSchema = v.object({
  longOi: v.bigint(),
  shortOi: v.bigint(),
});

export const perpPositionStateSchema = v.object({
  sizeUsd: v.bigint(),
  entryPrice: v.bigint(),
  pnlUsd: v.bigint(),
  liquidationPrice: v.nullable(v.bigint()),
});

export const positionStateSchema = v.object({
  ts: v.date(),
  market: v.string(),
  perpPosition: v.nullable(perpPositionStateSchema),
  gmBalance: v.bigint(),
  gmCostBasisUsd: v.bigint(),
  gmMtmValueUsd: v.bigint(),
});

export const pnlSnapshotSchema = v.object({
  ts: v.date(),
  tradeId: v.string(),
  perpFundingUsd: v.bigint(),
  perpFeesUsd: v.bigint(),
  gmValueChangeUsd: v.bigint(),
  gmFeeAccrualUsd: v.bigint(),
  gasUsd: v.bigint(),
  impactUsd: v.bigint(),
  netUsd: v.bigint(),
});
