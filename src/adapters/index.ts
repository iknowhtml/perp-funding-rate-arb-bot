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

export { ExchangeError } from "./errors";
export type { ExchangeErrorCode } from "./errors";

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
export { AdapterConfigSchema, isAdapterConfig, parseAdapterConfig } from "./config";
export type { AdapterConfig } from "./config";

// Exchange-specific rate limit configurations
export { COINBASE_RATE_LIMITS } from "./coinbase";
export {
  BINANCE_ENDPOINT_WEIGHTS,
  BINANCE_RATE_LIMITS,
  getBinanceEndpointWeight,
} from "./binance";
export { BYBIT_RATE_LIMITS } from "./bybit";

// Adapter factory functions
export { createCoinbaseAdapter } from "./coinbase";
export type { CoinbaseAdapterConfig } from "./coinbase";
export { createPaperAdapter } from "./paper";
export type { PaperAdapterConfig } from "./paper";
