/**
 * Exchange adapter interface and shared domain types.
 *
 * @see {@link ../../../adrs/0010-exchange-adapters.md ADR-0010: Exchange Adapters}
 * @see {@link ../../../adrs/0022-regime-based-gmx-arb.md ADR-0022: Regime-Based GMX Arb}
 * @see {@link ../../../adrs/0021-on-chain-pnl-accounting.md ADR-0021: On-Chain P&L Accounting}
 */

import * as v from "valibot";

// --- On-chain / GMX domain types (ADR-0019, ADR-0022, ADR-0021) ---

/** Result of a submitted on-chain transaction. */
export interface TxResult {
  /** Transaction hash (0x-prefixed hex). */
  hash: string;
  /** Whether the transaction was broadcast successfully. */
  success: boolean;
}

/** Parameters for opening a short perp position on GMX. */
export interface OpenPositionParams {
  /** Market identifier (e.g. GMX market address). */
  market: string;
  /** Size in collateral/size units (bigint). */
  sizeUsd: bigint;
  /** Maximum acceptable execution price (slippage guard). */
  acceptablePrice: bigint;
}

/** GM liquidity balance (GM token / LP share). */
export interface LiquidityBalance {
  /** Pool or market identifier. */
  pool: string;
  /** Balance in smallest unit (bigint). */
  balance: bigint;
}

/** Open interest skew (long/short) for regime detection. Protocol-agnostic. */
export interface OiSkew {
  longOi: bigint;
  shortOi: bigint;
}

/** Perp position subset for position_state (ADR-0022 appendix). */
export interface PerpPositionState {
  sizeUsd: bigint;
  entryPrice: bigint;
  pnlUsd: bigint;
  liquidationPrice: bigint | null;
}

/**
 * Position state snapshot (ADR-0022 appendix).
 * ts, market, perp_position, gm_balance, gm_cost_basis, gm_mtm_value
 */
export interface PositionState {
  ts: Date;
  market: string;
  perpPosition: PerpPositionState | null;
  gmBalance: bigint;
  gmCostBasisUsd: bigint;
  gmMtmValueUsd: bigint;
}

/**
 * P&L snapshot (ADR-0022 appendix, ADR-0021).
 * ts, trade_id, perp_funding_usd, perp_fees_usd, gm_value_change_usd,
 * gm_fee_accrual_usd, gas_usd, impact_usd, net_usd
 * USD amounts in smallest unit (e.g. 6 decimals: 1_000_000 = $1).
 */
export interface PnlSnapshot {
  ts: Date;
  tradeId: string;
  perpFundingUsd: bigint;
  perpFeesUsd: bigint;
  gmValueChangeUsd: bigint;
  gmFeeAccrualUsd: bigint;
  gasUsd: bigint;
  impactUsd: bigint;
  netUsd: bigint;
}

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

// --- On-chain / GMX schemas (ADR-0022, ADR-0021) ---

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

/**
 * On-chain perpetual protocol adapter interface (ADR-0019).
 * Implementations (e.g. GmxProtocolAdapter) provide read/write operations for a single protocol.
 * No order book or WebSocket; uses REST + chain reads and transaction submission.
 *
 * @see {@link ../../../adrs/0019-on-chain-perps-pivot.md ADR-0019: On-Chain Perps Pivot}
 */
export interface ProtocolAdapter {
  /** Market info (funding, OI, borrow rates). Protocol-specific shape; use unknown[] for interface. */
  getMarketsInfo(): Promise<unknown[]>;
  /** Price tickers. Protocol-specific shape; use unknown[] for interface. */
  getTickers(): Promise<unknown[]>;
  /** Current position state for a market (perp + GM/liquidity balance). */
  getPositionState(market: string): Promise<PositionState | null>;
  /** Liquidity balance for a pool (e.g. GM tokens). */
  getLiquidityBalance(pool: string): Promise<LiquidityBalance>;
  /** Simulate open perp order (no tx). */
  simulateOrder(params: OpenPositionParams): Promise<{ impactBps: bigint }>;
  /** Submit open perp order; returns tx result when broadcast. */
  submitOrder(params: OpenPositionParams): Promise<TxResult>;
  /** MA funding rate for regime detection (e.g. 4h MA in bps). Optional; implement when protocol supports it. */
  getMaFundingRate?(market: string, samples?: bigint[]): Promise<bigint>;
  /** OI skew (long/short) for a market. Optional; implement when protocol supports it. */
  getOiSkew?(market: string): Promise<OiSkew | null>;
}

/**
 * CEX exchange adapter interface (deprecated).
 * @deprecated Removed in GMX pivot (ADR-0019). Worker uses ProtocolAdapter from @/adapters/types.
 */
export interface ExchangeAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getBalance(asset: string): Promise<Balance>;
  getBalances(): Promise<Balance[]>;
  createOrder(params: CreateOrderParams): Promise<ExchangeOrder>;
  cancelOrder(orderId: string): Promise<void>;
  getOrder(orderId: string): Promise<ExchangeOrder | null>;
  getOpenOrders(symbol?: string): Promise<ExchangeOrder[]>;
  getPosition(symbol: string): Promise<Position | null>;
  getPositions(): Promise<Position[]>;
  getTicker(symbol: string): Promise<Ticker>;
  getFundingRate(symbol: string): Promise<FundingRate>;
  getOrderBook(symbol: string, depth?: number): Promise<OrderBook>;
  subscribeTicker(symbol: string, callback: TickerCallback): void;
  unsubscribeTicker(symbol: string): void;
}
