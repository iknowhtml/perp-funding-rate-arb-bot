/**
 * Exchange adapter interface and shared domain types.
 *
 * @see {@link ../../adrs/0010-exchange-adapters.md ADR-0010: Exchange Adapters}
 */

import * as v from "valibot";

// Enums
export type OrderSide = "BUY" | "SELL";

export type OrderType = "MARKET" | "LIMIT" | "STOP" | "STOP_LIMIT";

export type ExchangeOrderStatus =
  | "PENDING"
  | "OPEN"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELLED"
  | "REJECTED"
  | "EXPIRED";

export type PositionSide = "LONG" | "SHORT";

// Exchange Types
export type Exchange = "coinbase" | "binance" | "bybit" | "paper";

// Domain Types
export interface Balance {
  asset: string;
  availableBase: bigint; // Available balance in base units
  heldBase: bigint; // Held in orders
  totalBase: bigint; // Total balance
}

export interface ExchangeOrder {
  id: string;
  exchangeOrderId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  status: ExchangeOrderStatus;
  quantityBase: bigint;
  filledQuantityBase: bigint;
  priceQuote: bigint | null; // null for market orders
  avgFillPriceQuote: bigint | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Fill {
  id: string;
  orderId: string;
  exchangeOrderId: string;
  symbol: string;
  side: OrderSide;
  quantityBase: bigint;
  priceQuote: bigint;
  feeQuote: bigint;
  feeAsset: string;
  timestamp: Date;
}

export interface Position {
  symbol: string;
  side: PositionSide;
  sizeBase: bigint;
  entryPriceQuote: bigint;
  markPriceQuote: bigint;
  liquidationPriceQuote: bigint | null;
  unrealizedPnlQuote: bigint;
  leverageBps: bigint;
  marginQuote: bigint;
}

export interface Ticker {
  symbol: string;
  bidPriceQuote: bigint;
  askPriceQuote: bigint;
  lastPriceQuote: bigint;
  volumeBase: bigint;
  timestamp: Date;
}

export interface FundingRate {
  symbol: string;
  rateBps: bigint; // Funding rate in basis points
  nextFundingTime: Date;
  timestamp: Date;
}

export interface OrderBook {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: Date;
}

export interface OrderBookLevel {
  priceQuote: bigint;
  quantityBase: bigint;
}

// Order Creation Parameters
export interface CreateOrderParams {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantityBase: bigint;
  priceQuote?: bigint; // Required for LIMIT, STOP_LIMIT orders
  stopPriceQuote?: bigint; // Required for STOP, STOP_LIMIT orders
  timeInForce?: "GTC" | "IOC" | "FOK"; // Good Till Cancel, Immediate Or Cancel, Fill Or Kill
  reduceOnly?: boolean; // For perpetuals
}

// Callback Types
export type TickerCallback = (ticker: Ticker) => void;

// Valibot Schemas
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

// Type Guards (using Valibot)
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

// Exchange Adapter Interface
export interface ExchangeAdapter {
  // Connection management
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Account
  getBalance(asset: string): Promise<Balance>;
  getBalances(): Promise<Balance[]>;

  // Orders
  createOrder(params: CreateOrderParams): Promise<ExchangeOrder>;
  cancelOrder(orderId: string): Promise<void>;
  getOrder(orderId: string): Promise<ExchangeOrder | null>;
  getOpenOrders(symbol?: string): Promise<ExchangeOrder[]>;

  // Positions (for perpetuals)
  getPosition(symbol: string): Promise<Position | null>;
  getPositions(): Promise<Position[]>;

  // Market data
  getTicker(symbol: string): Promise<Ticker>;
  getFundingRate(symbol: string): Promise<FundingRate>;
  getOrderBook(symbol: string, depth?: number): Promise<OrderBook>;

  // WebSocket subscriptions
  subscribeTicker(symbol: string, callback: TickerCallback): void;
  unsubscribeTicker(symbol: string): void;
}
