/**
 * Protocol and adapter exports: types, schemas, guards, config, errors, GMX.
 *
 * @see {@link ../../docs/adrs/0010-exchange-adapters.md ADR-0010: Exchange Adapters}
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
} from "./schema";

export {
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
} from "./guards";

export type { AdapterConfig } from "./config";
export { AdapterConfigSchema, isAdapterConfig, parseAdapterConfig } from "./config";

export { createGmxAdapter } from "@/lib/chain/protocols/gmx";
export type { GmxProtocolAdapter, GmxProtocolAdapterConfig } from "@/lib/chain/protocols/gmx";
