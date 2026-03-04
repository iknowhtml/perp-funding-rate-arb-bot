/**
 * Exchange adapter interface and shared domain types.
 *
 * @see {@link ../../../docs/adrs/0010-exchange-adapters.md ADR-0010: Exchange Adapters}
 * @see {@link ../../../docs/adrs/0022-regime-based-gmx-arb.md ADR-0022: Regime-Based GMX Arb}
 * @see {@link ../../../docs/adrs/0021-on-chain-pnl-accounting.md ADR-0021: On-Chain P&L Accounting}
 */

import type { Address } from "viem";

/** Result of a submitted on-chain transaction. */
export interface TxResult {
  hash: string;
  success: boolean;
}

/** Parameters for opening a short perp position on GMX. */
export interface OpenPositionParams {
  market: Address;
  positionSizeUsd: bigint;
  acceptablePriceUsd: bigint;
}

/** GM liquidity balance (GM token / LP share). */
export interface LiquidityBalance {
  pool: string;
  balance: bigint;
}

/** Open interest skew (long/short) for regime detection. */
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

/** Position state snapshot (ADR-0022 appendix). */
export interface PositionState {
  ts: Date;
  market: string;
  perpPosition: PerpPositionState | null;
  gmBalance: bigint;
  gmCostBasisUsd: bigint;
  gmMtmValueUsd: bigint;
}

/** P&L snapshot (ADR-0022, ADR-0021). */
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

export type Exchange = "coinbase" | "binance" | "bybit" | "paper";

export interface Balance {
  asset: string;
  availableBase: bigint;
  heldBase: bigint;
  totalBase: bigint;
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
  priceQuote: bigint | null;
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
  rateBps: bigint;
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

export interface CreateOrderParams {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantityBase: bigint;
  priceQuote?: bigint;
  stopPriceQuote?: bigint;
  timeInForce?: "GTC" | "IOC" | "FOK";
  reduceOnly?: boolean;
}

export type TickerCallback = (ticker: Ticker) => void;

/**
 * On-chain perpetual protocol adapter interface (ADR-0019).
 *
 * @see {@link ../../../docs/adrs/0019-on-chain-perps-pivot.md ADR-0019: On-Chain Perps Pivot}
 */
export interface ProtocolAdapter {
  getMarketsInfo(): Promise<unknown[]>;
  getTickers(): Promise<unknown[]>;
  getPositionState(market: string): Promise<PositionState | null>;
  getLiquidityBalance(pool: string): Promise<LiquidityBalance>;
  simulateOrder(params: OpenPositionParams): Promise<{ impactBps: bigint }>;
  submitOrder(params: OpenPositionParams): Promise<TxResult>;
  getMaFundingRate?(market: string, samples?: bigint[]): Promise<bigint>;
  getOiSkew?(market: string): Promise<OiSkew | null>;
}

/**
 * CEX exchange adapter interface (deprecated).
 * @deprecated Removed in GMX pivot (ADR-0019). Worker uses ProtocolAdapter from @/lib/protocols.
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
