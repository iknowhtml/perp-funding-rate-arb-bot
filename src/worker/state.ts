/**
 * In-memory state store for bot state management.
 *
 * @see {@link ../../adrs/0001-bot-architecture.md ADR-0001: Bot Architecture}
 */

import type {
  Balance,
  ExchangeOrder,
  FundingRate,
  OrderBook,
  Position,
  Ticker,
} from "@/adapters/types";

/**
 * Bot state interface containing all market data, account data, and health tracking.
 */
export interface BotState {
  // Market data
  ticker: Ticker | null;
  orderBook: OrderBook | null;
  fundingRate: FundingRate | null;

  // Account data
  balances: Map<string, Balance>;
  positions: Map<string, Position>;
  openOrders: Map<string, ExchangeOrder>;

  // Health tracking
  lastTickerUpdate: Date | null;
  lastFundingUpdate: Date | null;
  lastAccountUpdate: Date | null;
  wsConnected: boolean;
}

/**
 * State store interface for managing bot state.
 */
export interface StateStore {
  getState(): Readonly<BotState>;
  updateTicker(ticker: Ticker): void;
  updateOrderBook(orderBook: OrderBook): void;
  updateFundingRate(fundingRate: FundingRate): void;
  updateBalances(balances: Balance[]): void;
  updatePositions(positions: Position[]): void;
  updateOrders(orders: ExchangeOrder[]): void;
  setWsConnected(connected: boolean): void;
  reset(): void;
}

/**
 * Create a new state store instance.
 */
export const createStateStore = (): StateStore => {
  let state: BotState = {
    ticker: null,
    orderBook: null,
    fundingRate: null,
    balances: new Map(),
    positions: new Map(),
    openOrders: new Map(),
    lastTickerUpdate: null,
    lastFundingUpdate: null,
    lastAccountUpdate: null,
    wsConnected: false,
  };

  return {
    getState: (): Readonly<BotState> => state,

    updateTicker: (ticker: Ticker): void => {
      state = {
        ...state,
        ticker,
        lastTickerUpdate: new Date(),
      };
    },

    updateOrderBook: (orderBook: OrderBook): void => {
      state = {
        ...state,
        orderBook,
      };
    },

    updateFundingRate: (fundingRate: FundingRate): void => {
      state = {
        ...state,
        fundingRate,
        lastFundingUpdate: new Date(),
      };
    },

    updateBalances: (balances: Balance[]): void => {
      const balancesMap = new Map<string, Balance>();
      for (const balance of balances) {
        balancesMap.set(balance.asset, balance);
      }
      state = {
        ...state,
        balances: balancesMap,
        lastAccountUpdate: new Date(),
      };
    },

    updatePositions: (positions: Position[]): void => {
      const positionsMap = new Map<string, Position>();
      for (const position of positions) {
        positionsMap.set(position.symbol, position);
      }
      state = {
        ...state,
        positions: positionsMap,
        lastAccountUpdate: new Date(),
      };
    },

    updateOrders: (orders: ExchangeOrder[]): void => {
      const ordersMap = new Map<string, ExchangeOrder>();
      for (const order of orders) {
        ordersMap.set(order.id, order);
      }
      state = {
        ...state,
        openOrders: ordersMap,
        lastAccountUpdate: new Date(),
      };
    },

    setWsConnected: (connected: boolean): void => {
      state = {
        ...state,
        wsConnected: connected,
      };
    },

    reset: (): void => {
      state = {
        ticker: null,
        orderBook: null,
        fundingRate: null,
        balances: new Map(),
        positions: new Map(),
        openOrders: new Map(),
        lastTickerUpdate: null,
        lastFundingUpdate: null,
        lastAccountUpdate: null,
        wsConnected: false,
      };
    },
  };
};
