import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  Balance,
  ExchangeAdapter,
  ExchangeOrder,
  FundingRate,
  Position,
} from "@/adapters/types";
import type { Logger } from "@/lib/logger";
import { createStateStore } from "@/worker/state";

import { runReconcile } from "./reconcile";
import type { ReconcilerConfig } from "./types";

const DEFAULT_CONFIG: ReconcilerConfig = {
  intervalMs: 60_000,
  toleranceSizeBps: 50n,
  tolerancePriceBps: 100n,
  toleranceBalanceBps: 50n,
  perpSymbol: "BTC-USD-PERP",
  baseAsset: "BTC",
  quoteAsset: "USD",
  baseDecimals: 8,
};

const makeBalance = (asset: string, totalBase: bigint, availableBase?: bigint): Balance => ({
  asset,
  totalBase,
  availableBase: availableBase ?? totalBase,
  heldBase: 0n,
});

const makePosition = (overrides: Partial<Position> = {}): Position => ({
  symbol: "BTC-USD-PERP",
  side: "SHORT",
  sizeBase: 100_000_000n, // 1 BTC
  entryPriceQuote: 50_000_000_000n,
  markPriceQuote: 50_000_000_000n,
  liquidationPriceQuote: null,
  unrealizedPnlQuote: 0n,
  leverageBps: 10_000n,
  marginQuote: 50_000_000_000n,
  ...overrides,
});

describe("runReconcile", () => {
  let mockAdapter: ExchangeAdapter;
  let mockLogger: Logger;
  let stateStore: ReturnType<typeof createStateStore>;

  const exchangeBalances: Balance[] = [
    makeBalance("BTC", 100_000_000n),
    makeBalance("USD", 5_000_000_000n),
  ];

  const exchangePosition: Position = makePosition();

  const exchangeOrders: ExchangeOrder[] = [];

  beforeEach(() => {
    vi.useFakeTimers();

    mockAdapter = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      isConnected: vi.fn().mockReturnValue(true),
      getBalance: vi.fn(),
      getBalances: vi.fn().mockResolvedValue(exchangeBalances),
      createOrder: vi.fn(),
      cancelOrder: vi.fn(),
      getOrder: vi.fn(),
      getOpenOrders: vi.fn().mockResolvedValue(exchangeOrders),
      getPosition: vi.fn(),
      getPositions: vi.fn().mockResolvedValue([exchangePosition]),
      getTicker: vi.fn(),
      getFundingRate: vi.fn().mockResolvedValue({
        symbol: "BTC-USD-PERP",
        rateBps: 10n,
        nextFundingTime: new Date(),
        timestamp: new Date(),
      } as FundingRate),
      getOrderBook: vi.fn(),
      subscribeTicker: vi.fn(),
      unsubscribeTicker: vi.fn(),
    };

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    stateStore = createStateStore();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("should return consistent when state matches exchange", async () => {
    // Pre-populate state with same data the exchange will return
    stateStore.updateBalances(exchangeBalances);
    stateStore.updatePositions([exchangePosition]);
    stateStore.updateTicker({
      symbol: "BTC-USD-PERP",
      bidPriceQuote: 50_000_000_000n,
      askPriceQuote: 50_001_000_000n,
      lastPriceQuote: 50_000_000_000n,
      volumeBase: 1_000_000_000n,
      timestamp: new Date(),
    });

    const result = await runReconcile(mockAdapter, stateStore, DEFAULT_CONFIG, mockLogger);

    expect(result.consistent).toBe(true);
    expect(result.positionInconsistencies).toHaveLength(0);
    expect(result.balanceInconsistencies).toHaveLength(0);
    expect(mockLogger.debug).toHaveBeenCalledWith("Reconciliation complete: consistent");
    expect(mockLogger.warn).not.toHaveBeenCalled();
    expect(mockLogger.info).not.toHaveBeenCalled();
  });

  it("should detect position size mismatch", async () => {
    // State has different position size than exchange
    stateStore.updatePositions([
      makePosition({ sizeBase: 200_000_000n }), // 2 BTC in state
    ]);
    stateStore.updateBalances(exchangeBalances);
    stateStore.updateTicker({
      symbol: "BTC-USD-PERP",
      bidPriceQuote: 50_000_000_000n,
      askPriceQuote: 50_001_000_000n,
      lastPriceQuote: 50_000_000_000n,
      volumeBase: 1_000_000_000n,
      timestamp: new Date(),
    });

    // Exchange returns 1 BTC
    vi.mocked(mockAdapter.getPositions).mockResolvedValue([exchangePosition]);

    const result = await runReconcile(mockAdapter, stateStore, DEFAULT_CONFIG, mockLogger);

    expect(result.positionInconsistencies.length).toBeGreaterThan(0);
    expect(result.consistent).toBe(false);
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it("should not report balance drift within tolerance", async () => {
    // State balance slightly different but within 50 bps tolerance
    // 100_000_000 * 50 / 10000 = 500_000 threshold
    const stateBalance = makeBalance("BTC", 100_040_000n); // ~4 bps diff
    stateStore.updateBalances([stateBalance, makeBalance("USD", 5_000_000_000n)]);
    stateStore.updatePositions([exchangePosition]);

    const result = await runReconcile(mockAdapter, stateStore, DEFAULT_CONFIG, mockLogger);

    expect(result.balanceInconsistencies).toHaveLength(0);
  });

  it("should detect balance drift exceeding tolerance as warning", async () => {
    // State balance differs by > 50 bps but < 500 bps (critical threshold)
    // 100_000_000 * 100 / 10000 = 1_000_000 → 100 bps diff
    const stateBalance = makeBalance("BTC", 101_000_000n); // 100 bps diff
    stateStore.updateBalances([stateBalance, makeBalance("USD", 5_000_000_000n)]);
    stateStore.updatePositions([exchangePosition]);

    const result = await runReconcile(mockAdapter, stateStore, DEFAULT_CONFIG, mockLogger);

    expect(result.balanceInconsistencies).toHaveLength(1);
    expect(result.balanceInconsistencies[0].severity).toBe("warning");
    expect(result.balanceInconsistencies[0].asset).toBe("BTC");
    expect(result.consistent).toBe(false);
  });

  it("should detect critical balance drift", async () => {
    // State balance differs by > 500 bps (5%)
    // 100_000_000 * 600 / 10000 = 6_000_000 → 600 bps diff
    const stateBalance = makeBalance("BTC", 106_000_000n); // 600 bps diff
    stateStore.updateBalances([stateBalance, makeBalance("USD", 5_000_000_000n)]);
    stateStore.updatePositions([exchangePosition]);

    const result = await runReconcile(mockAdapter, stateStore, DEFAULT_CONFIG, mockLogger);

    expect(result.balanceInconsistencies).toHaveLength(1);
    expect(result.balanceInconsistencies[0].severity).toBe("critical");
    expect(result.consistent).toBe(false);
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it("should update state from REST truth", async () => {
    const newBalances: Balance[] = [
      makeBalance("BTC", 200_000_000n),
      makeBalance("USD", 10_000_000_000n),
    ];
    const newPositions: Position[] = [makePosition({ sizeBase: 300_000_000n })];
    const newOrders: ExchangeOrder[] = [
      {
        id: "order-1",
        exchangeOrderId: "ex-1",
        symbol: "BTC-USD-PERP",
        side: "BUY",
        type: "LIMIT",
        status: "OPEN",
        quantityBase: 50_000_000n,
        filledQuantityBase: 0n,
        priceQuote: 49_000_000_000n,
        avgFillPriceQuote: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    vi.mocked(mockAdapter.getBalances).mockResolvedValue(newBalances);
    vi.mocked(mockAdapter.getPositions).mockResolvedValue(newPositions);
    vi.mocked(mockAdapter.getOpenOrders).mockResolvedValue(newOrders);

    await runReconcile(mockAdapter, stateStore, DEFAULT_CONFIG, mockLogger);

    const state = stateStore.getState();
    expect(state.balances.get("BTC")?.totalBase).toBe(200_000_000n);
    expect(state.balances.get("USD")?.totalBase).toBe(10_000_000_000n);
    expect(state.positions.get("BTC-USD-PERP")?.sizeBase).toBe(300_000_000n);
    expect(state.openOrders.get("order-1")).toEqual(newOrders[0]);
  });

  it("should handle no position in state (flat)", async () => {
    // Empty state — no positions, no balances
    vi.mocked(mockAdapter.getPositions).mockResolvedValue([]);
    vi.mocked(mockAdapter.getBalances).mockResolvedValue([]);
    vi.mocked(mockAdapter.getOpenOrders).mockResolvedValue([]);

    const result = await runReconcile(mockAdapter, stateStore, DEFAULT_CONFIG, mockLogger);

    expect(result.consistent).toBe(true);
    expect(result.positionInconsistencies).toHaveLength(0);
    expect(result.balanceInconsistencies).toHaveLength(0);
  });

  it("should handle no ticker in state", async () => {
    // State has positions but no ticker (lastPriceQuote should default to 0n)
    stateStore.updatePositions([exchangePosition]);
    stateStore.updateBalances(exchangeBalances);
    // No ticker update — ticker is null

    const result = await runReconcile(mockAdapter, stateStore, DEFAULT_CONFIG, mockLogger);

    // Should not throw; result should be defined
    expect(result).toBeDefined();
    expect(result.correctedPosition).toBeDefined();
  });

  it("should only report drifted balances with multiple assets", async () => {
    // Exchange returns 3 balances, only BTC is drifted
    const multiBalances: Balance[] = [
      makeBalance("BTC", 100_000_000n),
      makeBalance("USD", 5_000_000_000n),
      makeBalance("ETH", 10_000_000_000n),
    ];
    vi.mocked(mockAdapter.getBalances).mockResolvedValue(multiBalances);

    // State has BTC drifted (> 50 bps), USD and ETH match
    stateStore.updateBalances([
      makeBalance("BTC", 101_000_000n), // 100 bps drift
      makeBalance("USD", 5_000_000_000n), // exact match
      makeBalance("ETH", 10_000_000_000n), // exact match
    ]);
    stateStore.updatePositions([exchangePosition]);

    const result = await runReconcile(mockAdapter, stateStore, DEFAULT_CONFIG, mockLogger);

    expect(result.balanceInconsistencies).toHaveLength(1);
    expect(result.balanceInconsistencies[0].asset).toBe("BTC");
  });

  it("should report both position and balance inconsistencies", async () => {
    // Position mismatch: state has 2 BTC, exchange has 1 BTC
    stateStore.updatePositions([makePosition({ sizeBase: 200_000_000n })]);
    // Balance mismatch: state has drifted BTC balance
    stateStore.updateBalances([
      makeBalance("BTC", 106_000_000n), // 600 bps drift → critical
      makeBalance("USD", 5_000_000_000n),
    ]);
    stateStore.updateTicker({
      symbol: "BTC-USD-PERP",
      bidPriceQuote: 50_000_000_000n,
      askPriceQuote: 50_001_000_000n,
      lastPriceQuote: 50_000_000_000n,
      volumeBase: 1_000_000_000n,
      timestamp: new Date(),
    });

    vi.mocked(mockAdapter.getPositions).mockResolvedValue([exchangePosition]);

    const result = await runReconcile(mockAdapter, stateStore, DEFAULT_CONFIG, mockLogger);

    expect(result.consistent).toBe(false);
    expect(result.positionInconsistencies.length).toBeGreaterThan(0);
    expect(result.balanceInconsistencies.length).toBeGreaterThan(0);
  });
});
