/**
 * Exchange adapter exports.
 *
 * @see {@link ../adrs/0010-exchange-adapters.md ADR-0010: Exchange Adapters}
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
  OrderBook,
  OrderBookLevel,
  OrderSide,
  OrderType,
  Position,
  PositionSide,
  Ticker,
  TickerCallback,
} from "./types";

export type { ExchangeErrorCode } from "./errors";
export { ExchangeError } from "./errors";

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
  isOrderBook,
  isOrderBookLevel,
  isPosition,
  isTicker,
  orderBookLevelSchema,
  orderBookSchema,
  orderSideSchema,
  orderTypeSchema,
  positionSchema,
  positionSideSchema,
  tickerSchema,
} from "./types";

// Factory function
export { createExchangeAdapter } from "./factory";

// Config validation
export type { AdapterConfig } from "./config";
export { AdapterConfigSchema, isAdapterConfig, parseAdapterConfig } from "./config";

// Adapter factory functions
export type { PaperAdapterConfig } from "./paper";
export { createPaperAdapter } from "./paper";
