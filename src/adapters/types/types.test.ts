import { describe, expect, it } from "vitest";

import {
  isBalance,
  isCreateOrderParams,
  isExchangeOrder,
  isFill,
  isFundingRate,
  isLiquidityBalance,
  isOpenPositionParams,
  isOrderBook,
  isOrderBookLevel,
  isPerpPositionState,
  isPnlSnapshot,
  isPosition,
  isPositionState,
  isTicker,
  isTxResult,
} from "./types";

describe("type guards", () => {
  describe("isBalance", () => {
    it("should return true for valid balance", () => {
      const balance = {
        asset: "BTC",
        availableBase: 1000000n,
        heldBase: 500000n,
        totalBase: 1500000n,
      };
      expect(isBalance(balance)).toBe(true);
    });

    it("should return false for invalid balance", () => {
      expect(isBalance(null)).toBe(false);
      expect(isBalance({})).toBe(false);
      expect(isBalance({ asset: "BTC" })).toBe(false);
      expect(isBalance({ asset: "BTC", availableBase: 1000 })).toBe(false); // number instead of bigint
    });
  });

  describe("isExchangeOrder", () => {
    it("should return true for valid order", () => {
      const order = {
        id: "order-123",
        exchangeOrderId: "ex-456",
        symbol: "BTC-USD",
        side: "BUY" as const,
        type: "LIMIT" as const,
        status: "OPEN" as const,
        quantityBase: 1000000n,
        filledQuantityBase: 0n,
        priceQuote: 50000000000n,
        avgFillPriceQuote: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(isExchangeOrder(order)).toBe(true);
    });

    it("should return false for invalid order", () => {
      expect(isExchangeOrder(null)).toBe(false);
      expect(isExchangeOrder({})).toBe(false);
      expect(isExchangeOrder({ id: "order-123" })).toBe(false);
    });
  });

  describe("isFill", () => {
    it("should return true for valid fill", () => {
      const fill = {
        id: "fill-123",
        orderId: "order-123",
        exchangeOrderId: "ex-456",
        symbol: "BTC-USD",
        side: "BUY" as const,
        quantityBase: 1000000n,
        priceQuote: 50000000000n,
        feeQuote: 500000n,
        feeAsset: "USD",
        timestamp: new Date(),
      };
      expect(isFill(fill)).toBe(true);
    });

    it("should return false for invalid fill", () => {
      expect(isFill(null)).toBe(false);
      expect(isFill({})).toBe(false);
    });
  });

  describe("isPosition", () => {
    it("should return true for valid position", () => {
      const position = {
        symbol: "BTC-USD",
        side: "LONG" as const,
        sizeBase: 1000000n,
        entryPriceQuote: 50000000000n,
        markPriceQuote: 51000000000n,
        liquidationPriceQuote: 40000000000n,
        unrealizedPnlQuote: 1000000000n,
        leverageBps: 10000n,
        marginQuote: 5000000000n,
      };
      expect(isPosition(position)).toBe(true);
    });

    it("should return true for position with null liquidation price", () => {
      const position = {
        symbol: "BTC-USD",
        side: "LONG" as const,
        sizeBase: 1000000n,
        entryPriceQuote: 50000000000n,
        markPriceQuote: 51000000000n,
        liquidationPriceQuote: null,
        unrealizedPnlQuote: 1000000000n,
        leverageBps: 10000n,
        marginQuote: 5000000000n,
      };
      expect(isPosition(position)).toBe(true);
    });

    it("should return false for invalid position", () => {
      expect(isPosition(null)).toBe(false);
      expect(isPosition({})).toBe(false);
    });
  });

  describe("isTicker", () => {
    it("should return true for valid ticker", () => {
      const ticker = {
        symbol: "BTC-USD",
        bidPriceQuote: 49900000000n,
        askPriceQuote: 50100000000n,
        lastPriceQuote: 50000000000n,
        volumeBase: 1000000000n,
        timestamp: new Date(),
      };
      expect(isTicker(ticker)).toBe(true);
    });

    it("should return false for invalid ticker", () => {
      expect(isTicker(null)).toBe(false);
      expect(isTicker({})).toBe(false);
    });
  });

  describe("isFundingRate", () => {
    it("should return true for valid funding rate", () => {
      const fundingRate = {
        symbol: "BTC-USD",
        rateBps: 10n,
        nextFundingTime: new Date(),
        timestamp: new Date(),
      };
      expect(isFundingRate(fundingRate)).toBe(true);
    });

    it("should return false for invalid funding rate", () => {
      expect(isFundingRate(null)).toBe(false);
      expect(isFundingRate({})).toBe(false);
    });
  });

  describe("isOrderBook", () => {
    it("should return true for valid order book", () => {
      const orderBook = {
        symbol: "BTC-USD",
        bids: [
          { priceQuote: 49900000000n, quantityBase: 1000000n },
          { priceQuote: 49800000000n, quantityBase: 2000000n },
        ],
        asks: [
          { priceQuote: 50100000000n, quantityBase: 1000000n },
          { priceQuote: 50200000000n, quantityBase: 2000000n },
        ],
        timestamp: new Date(),
      };
      expect(isOrderBook(orderBook)).toBe(true);
    });

    it("should return false for invalid order book", () => {
      expect(isOrderBook(null)).toBe(false);
      expect(isOrderBook({})).toBe(false);
      expect(isOrderBook({ symbol: "BTC-USD" })).toBe(false);
    });
  });

  describe("isOrderBookLevel", () => {
    it("should return true for valid order book level", () => {
      const level = {
        priceQuote: 50000000000n,
        quantityBase: 1000000n,
      };
      expect(isOrderBookLevel(level)).toBe(true);
    });

    it("should return false for invalid order book level", () => {
      expect(isOrderBookLevel(null)).toBe(false);
      expect(isOrderBookLevel({})).toBe(false);
      expect(isOrderBookLevel({ priceQuote: 50000000000n })).toBe(false);
    });
  });

  describe("isCreateOrderParams", () => {
    it("should return true for valid market order params", () => {
      const params = {
        symbol: "BTC-USD",
        side: "BUY" as const,
        type: "MARKET" as const,
        quantityBase: 1000000n,
      };
      expect(isCreateOrderParams(params)).toBe(true);
    });

    it("should return true for valid limit order params", () => {
      const params = {
        symbol: "BTC-USD",
        side: "BUY" as const,
        type: "LIMIT" as const,
        quantityBase: 1000000n,
        priceQuote: 50000000000n,
        timeInForce: "GTC" as const,
      };
      expect(isCreateOrderParams(params)).toBe(true);
    });

    it("should return true for valid stop order params", () => {
      const params = {
        symbol: "BTC-USD",
        side: "BUY" as const,
        type: "STOP" as const,
        quantityBase: 1000000n,
        stopPriceQuote: 51000000000n,
      };
      expect(isCreateOrderParams(params)).toBe(true);
    });

    it("should return false for invalid params", () => {
      expect(isCreateOrderParams(null)).toBe(false);
      expect(isCreateOrderParams({})).toBe(false);
      expect(isCreateOrderParams({ symbol: "BTC-USD" })).toBe(false);
    });
  });

  describe("isTxResult", () => {
    it("should return true for valid TxResult", () => {
      expect(isTxResult({ hash: "0xabc", success: true })).toBe(true);
      expect(isTxResult({ hash: "0xdef", success: false })).toBe(true);
    });
    it("should return false for invalid TxResult", () => {
      expect(isTxResult(null)).toBe(false);
      expect(isTxResult({})).toBe(false);
      expect(isTxResult({ hash: "0x" })).toBe(false);
      expect(isTxResult({ success: true })).toBe(false);
    });
  });

  describe("isOpenPositionParams", () => {
    it("should return true for valid OpenPositionParams", () => {
      const params = {
        market: "0xMarket",
        sizeUsd: 1000000n,
        acceptablePrice: 50000000000n,
      };
      expect(isOpenPositionParams(params)).toBe(true);
    });
    it("should return false for invalid OpenPositionParams", () => {
      expect(isOpenPositionParams(null)).toBe(false);
      expect(isOpenPositionParams({})).toBe(false);
      expect(isOpenPositionParams({ market: "0x", sizeUsd: 1000n })).toBe(false);
      expect(isOpenPositionParams({ market: "0x", sizeUsd: 1000, acceptablePrice: 50n })).toBe(
        false,
      );
    });
  });

  describe("isLiquidityBalance", () => {
    it("should return true for valid LiquidityBalance", () => {
      expect(isLiquidityBalance({ pool: "default", balance: 1000000n })).toBe(true);
    });
    it("should return false for invalid LiquidityBalance", () => {
      expect(isLiquidityBalance(null)).toBe(false);
      expect(isLiquidityBalance({})).toBe(false);
      expect(isLiquidityBalance({ pool: "default" })).toBe(false);
      expect(isLiquidityBalance({ pool: "default", balance: 1000 })).toBe(false);
    });
  });

  describe("isPerpPositionState", () => {
    it("should return true for valid PerpPositionState", () => {
      const state = {
        sizeUsd: 1000000n,
        entryPrice: 50000000000n,
        pnlUsd: -10000n,
        liquidationPrice: 40000000000n,
      };
      expect(isPerpPositionState(state)).toBe(true);
      expect(isPerpPositionState({ ...state, liquidationPrice: null })).toBe(true);
    });
    it("should return false for invalid PerpPositionState", () => {
      expect(isPerpPositionState(null)).toBe(false);
      expect(isPerpPositionState({})).toBe(false);
      expect(isPerpPositionState({ sizeUsd: 1000n })).toBe(false);
      expect(isPerpPositionState({ sizeUsd: 1000n, entryPrice: 50n, pnlUsd: 0n })).toBe(false);
    });
  });

  describe("isPositionState", () => {
    it("should return true for valid PositionState", () => {
      const state = {
        ts: new Date(),
        market: "0xMarket",
        perpPosition: {
          sizeUsd: 1000000n,
          entryPrice: 50000000000n,
          pnlUsd: 0n,
          liquidationPrice: null,
        },
        gmBalance: 1000000n,
        gmCostBasisUsd: 50000000000n,
        gmMtmValueUsd: 51000000000n,
      };
      expect(isPositionState(state)).toBe(true);
      expect(isPositionState({ ...state, perpPosition: null })).toBe(true);
    });
    it("should return false for invalid PositionState", () => {
      expect(isPositionState(null)).toBe(false);
      expect(isPositionState({})).toBe(false);
      expect(isPositionState({ ts: new Date(), market: "0x" })).toBe(false);
    });
  });

  describe("isPnlSnapshot", () => {
    it("should return true for valid PnlSnapshot", () => {
      const snapshot = {
        ts: new Date(),
        tradeId: "trade-1",
        perpFundingUsd: 0n,
        perpFeesUsd: 1000n,
        gmValueChangeUsd: 5000n,
        gmFeeAccrualUsd: 0n,
        gasUsd: 2000n,
        impactUsd: 0n,
        netUsd: 2000n,
      };
      expect(isPnlSnapshot(snapshot)).toBe(true);
    });
    it("should return false for invalid PnlSnapshot", () => {
      expect(isPnlSnapshot(null)).toBe(false);
      expect(isPnlSnapshot({})).toBe(false);
      expect(isPnlSnapshot({ ts: new Date(), tradeId: "t" })).toBe(false);
      expect(isPnlSnapshot({ ts: new Date(), tradeId: "t", perpFundingUsd: 0 })).toBe(false);
    });
  });
});
