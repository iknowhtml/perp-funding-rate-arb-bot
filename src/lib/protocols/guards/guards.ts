/**
 * Type guards for adapter types using Valibot schemas.
 *
 * @see {@link ../../../../adrs/0010-exchange-adapters.md ADR-0010}
 */

import * as v from "valibot";

import {
  balanceSchema,
  createOrderParamsSchema,
  exchangeOrderSchema,
  fillSchema,
  fundingRateSchema,
  liquidityBalanceSchema,
  oiSkewSchema,
  openPositionParamsSchema,
  orderBookLevelSchema,
  orderBookSchema,
  perpPositionStateSchema,
  pnlSnapshotSchema,
  positionSchema,
  positionStateSchema,
  tickerSchema,
  txResultSchema,
} from "../schema";
import type {
  Balance,
  CreateOrderParams,
  ExchangeOrder,
  Fill,
  FundingRate,
  LiquidityBalance,
  OiSkew,
  OpenPositionParams,
  OrderBook,
  OrderBookLevel,
  PerpPositionState,
  PnlSnapshot,
  Position,
  PositionState,
  Ticker,
  TxResult,
} from "../types";

export const isBalance = (value: unknown): value is Balance => v.is(balanceSchema, value);

export const isExchangeOrder = (value: unknown): value is ExchangeOrder =>
  v.is(exchangeOrderSchema, value);

export const isFill = (value: unknown): value is Fill => v.is(fillSchema, value);

export const isPosition = (value: unknown): value is Position => v.is(positionSchema, value);

export const isTicker = (value: unknown): value is Ticker => v.is(tickerSchema, value);

export const isFundingRate = (value: unknown): value is FundingRate =>
  v.is(fundingRateSchema, value);

export const isOrderBookLevel = (value: unknown): value is OrderBookLevel =>
  v.is(orderBookLevelSchema, value);

export const isOrderBook = (value: unknown): value is OrderBook => v.is(orderBookSchema, value);

export const isCreateOrderParams = (value: unknown): value is CreateOrderParams =>
  v.is(createOrderParamsSchema, value);

export const isTxResult = (value: unknown): value is TxResult => v.is(txResultSchema, value);

export const isOpenPositionParams = (value: unknown): value is OpenPositionParams =>
  v.is(openPositionParamsSchema, value);

export const isLiquidityBalance = (value: unknown): value is LiquidityBalance =>
  v.is(liquidityBalanceSchema, value);

export const isOiSkew = (value: unknown): value is OiSkew => v.is(oiSkewSchema, value);

export const isPerpPositionState = (value: unknown): value is PerpPositionState =>
  v.is(perpPositionStateSchema, value);

export const isPositionState = (value: unknown): value is PositionState =>
  v.is(positionStateSchema, value);

export const isPnlSnapshot = (value: unknown): value is PnlSnapshot =>
  v.is(pnlSnapshotSchema, value);
