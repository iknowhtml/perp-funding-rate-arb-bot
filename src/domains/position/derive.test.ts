import { describe, expect, it } from "vitest";

import type { Balance, Fill, Position } from "@/adapters/types";

import { derivePosition } from "./derive";
import type { PositionConfig } from "./types";

describe("derivePosition", () => {
  const baseConfig: PositionConfig = {
    perpSymbol: "BTC-USD",
    baseAsset: "BTC",
    quoteAsset: "USD",
    baseDecimals: 8,
  };

  it("should derive flat position when no exchange position and no balance", () => {
    const result = derivePosition(null, null, 50000000000n, [], baseConfig);

    expect(result.open).toBe(false);
    expect(result.side).toBeNull();
    expect(result.perpQuantityBase).toBe(0n);
    expect(result.spotQuantityBase).toBe(0n);
    expect(result.notionalQuote).toBe(0n);
    expect(result.unrealizedPnlQuote).toBe(0n);
    expect(result.source).toBe("derived");
  });

  it("should derive active LONG position with spot balance", () => {
    const perpPosition: Position = {
      symbol: "BTC-USD",
      side: "LONG",
      sizeBase: 100000000n, // 1 BTC
      entryPriceQuote: 40000000000n, // $40,000 entry
      markPriceQuote: 50000000000n, // $50,000 current
      liquidationPriceQuote: 30000000000n, // $30,000
      unrealizedPnlQuote: 10000000000n, // $10,000 profit
      leverageBps: 10000n, // 1x
      marginQuote: 40000000000n, // $40,000 margin
    };

    const spotBalance: Balance = {
      asset: "BTC",
      availableBase: 100000000n, // 1 BTC
      heldBase: 0n,
      totalBase: 100000000n,
    };

    const result = derivePosition(perpPosition, spotBalance, 50000000000n, [], baseConfig);

    expect(result.open).toBe(true);
    expect(result.side).toBe("LONG");
    expect(result.perpQuantityBase).toBe(100000000n);
    expect(result.spotQuantityBase).toBe(100000000n);
    expect(result.notionalQuote).toBe(50000000000n);
    expect(result.unrealizedPnlQuote).toBe(10000000000n);
    expect(result.marginUsedQuote).toBe(40000000000n);
    expect(result.liquidationPriceQuote).toBe(30000000000n);
    expect(result.liquidationDistanceBps).toBe(4000n); // 40% buffer
  });

  it("should derive active SHORT position", () => {
    const perpPosition: Position = {
      symbol: "BTC-USD",
      side: "SHORT",
      sizeBase: 100000000n, // 1 BTC
      entryPriceQuote: 50000000000n, // $50,000 entry
      markPriceQuote: 40000000000n, // $40,000 current
      liquidationPriceQuote: 60000000000n, // $60,000
      unrealizedPnlQuote: 10000000000n, // $10,000 profit
      leverageBps: 10000n, // 1x
      marginQuote: 50000000000n, // $50,000 margin
    };

    const result = derivePosition(perpPosition, null, 40000000000n, [], baseConfig);

    expect(result.open).toBe(true);
    expect(result.side).toBe("SHORT");
    expect(result.perpQuantityBase).toBe(100000000n);
    expect(result.spotQuantityBase).toBe(0n);
    expect(result.notionalQuote).toBe(40000000000n);
    expect(result.unrealizedPnlQuote).toBe(10000000000n);
    expect(result.liquidationPriceQuote).toBe(60000000000n);
    expect(result.liquidationDistanceBps).toBe(5000n); // 50% buffer
  });

  it("should apply pending fills to adjust position size", () => {
    const perpPosition: Position = {
      symbol: "BTC-USD",
      side: "LONG",
      sizeBase: 100000000n, // 1 BTC
      entryPriceQuote: 40000000000n,
      markPriceQuote: 50000000000n,
      liquidationPriceQuote: null,
      unrealizedPnlQuote: 0n,
      leverageBps: 10000n,
      marginQuote: 0n,
    };

    const pendingFills: Fill[] = [
      {
        id: "fill-1",
        orderId: "order-1",
        exchangeOrderId: "ex-1",
        symbol: "BTC-USD",
        side: "BUY",
        quantityBase: 50000000n, // 0.5 BTC
        priceQuote: 45000000000n,
        feeQuote: 0n,
        feeAsset: "USD",
        timestamp: new Date(),
      },
      {
        id: "fill-2",
        orderId: "order-2",
        exchangeOrderId: "ex-2",
        symbol: "BTC-USD",
        side: "SELL",
        quantityBase: 25000000n, // 0.25 BTC
        priceQuote: 48000000000n,
        feeQuote: 0n,
        feeAsset: "USD",
        timestamp: new Date(),
      },
    ];

    const result = derivePosition(perpPosition, null, 50000000000n, pendingFills, baseConfig);

    // Base size: 1 BTC, +0.5 BTC (BUY), -0.25 BTC (SELL) = 1.25 BTC
    expect(result.perpQuantityBase).toBe(125000000n);
    expect(result.open).toBe(true);
  });

  it("should ignore fills for different symbols", () => {
    const perpPosition: Position = {
      symbol: "BTC-USD",
      side: "LONG",
      sizeBase: 100000000n,
      entryPriceQuote: 40000000000n,
      markPriceQuote: 50000000000n,
      liquidationPriceQuote: null,
      unrealizedPnlQuote: 0n,
      leverageBps: 10000n,
      marginQuote: 0n,
    };

    const pendingFills: Fill[] = [
      {
        id: "fill-1",
        orderId: "order-1",
        exchangeOrderId: "ex-1",
        symbol: "ETH-USD", // Different symbol
        side: "BUY",
        quantityBase: 50000000n,
        priceQuote: 3000000000n,
        feeQuote: 0n,
        feeAsset: "USD",
        timestamp: new Date(),
      },
    ];

    const result = derivePosition(perpPosition, null, 50000000000n, pendingFills, baseConfig);

    // Should not be affected by ETH fill
    expect(result.perpQuantityBase).toBe(100000000n);
  });

  it("should handle position with null liquidation price", () => {
    const perpPosition: Position = {
      symbol: "BTC-USD",
      side: "LONG",
      sizeBase: 100000000n,
      entryPriceQuote: 40000000000n,
      markPriceQuote: 50000000000n,
      liquidationPriceQuote: null,
      unrealizedPnlQuote: 0n,
      leverageBps: 10000n,
      marginQuote: 0n,
    };

    const result = derivePosition(perpPosition, null, 50000000000n, [], baseConfig);

    expect(result.liquidationPriceQuote).toBeNull();
    expect(result.liquidationDistanceBps).toBe(10000n); // 100% buffer (no liquidation risk)
  });

  it("should calculate notional correctly for adjusted position size", () => {
    const perpPosition: Position = {
      symbol: "BTC-USD",
      side: "LONG",
      sizeBase: 100000000n, // 1 BTC
      entryPriceQuote: 40000000000n,
      markPriceQuote: 50000000000n,
      liquidationPriceQuote: null,
      unrealizedPnlQuote: 0n,
      leverageBps: 10000n,
      marginQuote: 0n,
    };

    const pendingFills: Fill[] = [
      {
        id: "fill-1",
        orderId: "order-1",
        exchangeOrderId: "ex-1",
        symbol: "BTC-USD",
        side: "BUY",
        quantityBase: 100000000n, // +1 BTC
        priceQuote: 45000000000n,
        feeQuote: 0n,
        feeAsset: "USD",
        timestamp: new Date(),
      },
    ];

    const result = derivePosition(perpPosition, null, 50000000000n, pendingFills, baseConfig);

    // Adjusted size: 1 BTC + 1 BTC = 2 BTC
    // Notional: (200000000 * 50000000000) / 100000000 = 100000000000
    expect(result.perpQuantityBase).toBe(200000000n);
    expect(result.notionalQuote).toBe(100000000000n);
  });
});
