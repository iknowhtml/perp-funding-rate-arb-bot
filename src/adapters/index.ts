/**
 * Exchange adapter exports.
 *
 * @see {@link ../../adrs/0010-exchange-adapters.md ADR-0010: Exchange Adapters}
 */

export type {
  Balance,
  CreateOrderParams,
  Exchange,
  ExchangeAdapter,
  ExchangeOrder,
  ExchangeOrderStatus,
  Fill,
  FundingRate,
  LiquidityBalance,
  OpenPositionParams,
  OrderBook,
  OrderBookLevel,
  OrderSide,
  OrderType,
  OiSkew,
  PerpPositionState,
  PnlSnapshot,
  Position,
  PositionState,
  PositionSide,
  ProtocolAdapter,
  Ticker,
  TickerCallback,
  TxResult,
} from "./types";

export type { AdapterErrorCode, ExchangeErrorCode } from "./errors";
export { AdapterError, ExchangeError } from "./errors";

export {
  balanceSchema,
  createOrderParamsSchema,
  exchangeOrderSchema,
  exchangeOrderStatusSchema,
  fillSchema,
  fundingRateSchema,
  isBalance,
  isCreateOrderParams,
  isExchangeOrder,
  isFill,
  isFundingRate,
  isLiquidityBalance,
  isOpenPositionParams,
  isOrderBook,
  isOrderBookLevel,
  isOiSkew,
  isPerpPositionState,
  isPnlSnapshot,
  isPosition,
  isPositionState,
  isTicker,
  isTxResult,
  liquidityBalanceSchema,
  oiSkewSchema,
  openPositionParamsSchema,
  orderBookLevelSchema,
  orderBookSchema,
  orderSideSchema,
  orderTypeSchema,
  pnlSnapshotSchema,
  perpPositionStateSchema,
  positionSchema,
  positionStateSchema,
  positionSideSchema,
  tickerSchema,
  txResultSchema,
} from "./types";

// GMX protocol adapter (ADR-0019) — lives under lib/chain/protocols/gmx
export { createGmxAdapter } from "@/lib/chain/protocols/gmx";
export type { GmxProtocolAdapter, GmxProtocolAdapterConfig } from "@/lib/chain/protocols/gmx";

// Config validation (legacy AdapterConfig kept for env parsing if needed)
export type { AdapterConfig } from "./config";
export { AdapterConfigSchema, isAdapterConfig, parseAdapterConfig } from "./config";
