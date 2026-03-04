/**
 * Exchange adapter types, schemas, and guards.
 *
 * @see {@link ../../adrs/0010-exchange-adapters.md ADR-0010}
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
