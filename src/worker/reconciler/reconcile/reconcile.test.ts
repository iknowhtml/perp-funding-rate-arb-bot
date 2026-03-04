import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Logger } from "@/lib/logger";
import type { ProtocolAdapter } from "@/lib/protocols";
import type { Balance, ExchangeOrder, Position } from "@/lib/protocols";
import { createStateStore } from "@/worker/state";

import type { ReconcilerConfig } from "../types";
import { runReconcile } from "./reconcile";

const GMX_MARKET = "0x47c031236e19d024b42f8AE6780E44A573170703";
const GMX_POOL = "0x4277f8f2c384827b5273592ff7cebd9f2c1ac258";

const DEFAULT_CONFIG: ReconcilerConfig = {
  intervalMs: 60_000,
  toleranceSizeBps: 50n,
  tolerancePriceBps: 100n,
  toleranceBalanceBps: 50n,
  perpSymbol: "BTC-USD-PERP",
  baseAsset: "BTC",
  quoteAsset: "USD",
  baseDecimals: 8,
  gmxMarket: GMX_MARKET,
  gmxPool: GMX_POOL,
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

const createMockProtocolAdapter = (
  positionState: Awaited<ReturnType<ProtocolAdapter["getPositionState"]>>,
  liquidityBalance: Awaited<ReturnType<ProtocolAdapter["getLiquidityBalance"]>>,
): ProtocolAdapter => ({
  getMarketsInfo: vi.fn().mockResolvedValue([]),
  getTickers: vi.fn().mockResolvedValue([]),
  getPositionState: vi.fn().mockResolvedValue(positionState),
  getLiquidityBalance: vi.fn().mockResolvedValue(liquidityBalance),
  simulateOrder: vi.fn().mockResolvedValue({ impactBps: 0n }),
  submitOrder: vi.fn().mockResolvedValue({ hash: "0x", success: true }),
});

describe("runReconcile", () => {
  let mockAdapter: ProtocolAdapter;
  let mockLogger: Logger;
  let stateStore: ReturnType<typeof createStateStore>;

  const _exchangeBalances: Balance[] = [
    makeBalance("BTC", 100_000_000n),
    makeBalance("USD", 5_000_000_000n),
  ];

  const exchangePosition: Position = makePosition();

  const _exchangeOrders: ExchangeOrder[] = [];

  beforeEach(() => {
    vi.useFakeTimers();

    mockAdapter = createMockProtocolAdapter(
      {
        ts: new Date(),
        market: GMX_MARKET,
        perpPosition: {
          sizeUsd: exchangePosition.sizeBase,
          entryPrice: exchangePosition.entryPriceQuote,
          pnlUsd: exchangePosition.unrealizedPnlQuote,
          liquidationPrice: exchangePosition.liquidationPriceQuote,
        },
        gmBalance: 0n,
        gmCostBasisUsd: 0n,
        gmMtmValueUsd: 0n,
      },
      { pool: GMX_POOL, balance: 0n },
    );

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
    // Pre-populate state to match GMX mock (one perp position, GM balance 0)
    stateStore.updateBalances([]);
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
    stateStore.updateBalances([
      { asset: `GM-${GMX_POOL}`, availableBase: 0n, heldBase: 0n, totalBase: 0n },
    ]);
    stateStore.updateTicker({
      symbol: "BTC-USD-PERP",
      bidPriceQuote: 50_000_000_000n,
      askPriceQuote: 50_001_000_000n,
      lastPriceQuote: 50_000_000_000n,
      volumeBase: 1_000_000_000n,
      timestamp: new Date(),
    });

    // GMX returns 1 BTC perp
    vi.mocked(mockAdapter.getPositionState).mockResolvedValue({
      ts: new Date(),
      market: GMX_MARKET,
      perpPosition: {
        sizeUsd: 100_000_000n,
        entryPrice: 50_000_000_000n,
        pnlUsd: 0n,
        liquidationPrice: null,
      },
      gmBalance: 0n,
      gmCostBasisUsd: 0n,
      gmMtmValueUsd: 0n,
    });

    const result = await runReconcile(mockAdapter, stateStore, DEFAULT_CONFIG, mockLogger);

    expect(result.positionInconsistencies.length).toBeGreaterThan(0);
    expect(result.consistent).toBe(false);
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it("should not report balance drift within tolerance", async () => {
    // GM balance slightly different but within 50 bps tolerance
    const stateBalance = {
      asset: `GM-${GMX_POOL}`,
      availableBase: 100_040_000n,
      heldBase: 0n,
      totalBase: 100_040_000n,
    };
    stateStore.updateBalances([stateBalance]);
    stateStore.updatePositions([exchangePosition]);

    vi.mocked(mockAdapter.getLiquidityBalance).mockResolvedValue({
      pool: GMX_POOL,
      balance: 100_000_000n,
    });

    const result = await runReconcile(mockAdapter, stateStore, DEFAULT_CONFIG, mockLogger);

    expect(result.balanceInconsistencies).toHaveLength(0);
  });

  it("should detect balance drift exceeding tolerance as warning", async () => {
    const stateBalance = {
      asset: `GM-${GMX_POOL}`,
      availableBase: 101_000_000n,
      heldBase: 0n,
      totalBase: 101_000_000n,
    };
    stateStore.updateBalances([stateBalance]);
    stateStore.updatePositions([exchangePosition]);

    vi.mocked(mockAdapter.getLiquidityBalance).mockResolvedValue({
      pool: GMX_POOL,
      balance: 100_000_000n,
    });

    const result = await runReconcile(mockAdapter, stateStore, DEFAULT_CONFIG, mockLogger);

    expect(result.balanceInconsistencies).toHaveLength(1);
    const b0 = result.balanceInconsistencies[0];
    expect(b0).toBeDefined();
    expect(b0!.severity).toBe("warning");
    expect(b0!.asset).toBe(`GM-${GMX_POOL}`);
    expect(result.consistent).toBe(false);
  });

  it("should detect critical balance drift", async () => {
    const stateBalance = {
      asset: `GM-${GMX_POOL}`,
      availableBase: 106_000_000n,
      heldBase: 0n,
      totalBase: 106_000_000n,
    };
    stateStore.updateBalances([stateBalance]);
    stateStore.updatePositions([exchangePosition]);

    vi.mocked(mockAdapter.getLiquidityBalance).mockResolvedValue({
      pool: GMX_POOL,
      balance: 100_000_000n,
    });

    const result = await runReconcile(mockAdapter, stateStore, DEFAULT_CONFIG, mockLogger);

    expect(result.balanceInconsistencies).toHaveLength(1);
    const b0Critical = result.balanceInconsistencies[0];
    expect(b0Critical).toBeDefined();
    expect(b0Critical!.severity).toBe("critical");
    expect(result.consistent).toBe(false);
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it("should update state from GMX truth", async () => {
    vi.mocked(mockAdapter.getPositionState).mockResolvedValue({
      ts: new Date(),
      market: GMX_MARKET,
      perpPosition: {
        sizeUsd: 300_000_000n,
        entryPrice: 50_000_000_000n,
        pnlUsd: 0n,
        liquidationPrice: null,
      },
      gmBalance: 0n,
      gmCostBasisUsd: 0n,
      gmMtmValueUsd: 0n,
    });
    vi.mocked(mockAdapter.getLiquidityBalance).mockResolvedValue({
      pool: GMX_POOL,
      balance: 0n,
    });

    await runReconcile(mockAdapter, stateStore, DEFAULT_CONFIG, mockLogger);

    const state = stateStore.getState();
    expect(state.positions.get("BTC-USD-PERP")?.sizeBase).toBe(300_000_000n);
  });

  it("should handle no position in state (flat)", async () => {
    vi.mocked(mockAdapter.getPositionState).mockResolvedValue({
      ts: new Date(),
      market: GMX_MARKET,
      perpPosition: null,
      gmBalance: 0n,
      gmCostBasisUsd: 0n,
      gmMtmValueUsd: 0n,
    });
    vi.mocked(mockAdapter.getLiquidityBalance).mockResolvedValue({
      pool: GMX_POOL,
      balance: 0n,
    });

    const result = await runReconcile(mockAdapter, stateStore, DEFAULT_CONFIG, mockLogger);

    expect(result.consistent).toBe(true);
    expect(result.positionInconsistencies).toHaveLength(0);
    expect(result.balanceInconsistencies).toHaveLength(0);
  });

  it("should handle no ticker in state", async () => {
    stateStore.updatePositions([exchangePosition]);
    stateStore.updateBalances([
      { asset: `GM-${GMX_POOL}`, availableBase: 0n, heldBase: 0n, totalBase: 0n },
    ]);

    const result = await runReconcile(mockAdapter, stateStore, DEFAULT_CONFIG, mockLogger);

    // Should not throw; result should be defined
    expect(result).toBeDefined();
    expect(result.correctedPosition).toBeDefined();
  });

  it("should only report drifted balances with multiple assets", async () => {
    vi.mocked(mockAdapter.getLiquidityBalance).mockResolvedValue({
      pool: GMX_POOL,
      balance: 100_000_000n,
    });

    stateStore.updateBalances([
      {
        asset: `GM-${GMX_POOL}`,
        availableBase: 101_000_000n,
        heldBase: 0n,
        totalBase: 101_000_000n,
      },
      makeBalance("USD", 5_000_000_000n),
    ]);
    stateStore.updatePositions([exchangePosition]);

    const result = await runReconcile(mockAdapter, stateStore, DEFAULT_CONFIG, mockLogger);

    expect(result.balanceInconsistencies).toHaveLength(1);
    const b0Multi = result.balanceInconsistencies[0];
    expect(b0Multi).toBeDefined();
    expect(b0Multi!.asset).toBe(`GM-${GMX_POOL}`);
  });

  it("should report both position and balance inconsistencies", async () => {
    stateStore.updatePositions([makePosition({ sizeBase: 200_000_000n })]);
    stateStore.updateBalances([
      {
        asset: `GM-${GMX_POOL}`,
        availableBase: 106_000_000n,
        heldBase: 0n,
        totalBase: 106_000_000n,
      },
    ]);
    stateStore.updateTicker({
      symbol: "BTC-USD-PERP",
      bidPriceQuote: 50_000_000_000n,
      askPriceQuote: 50_001_000_000n,
      lastPriceQuote: 50_000_000_000n,
      volumeBase: 1_000_000_000n,
      timestamp: new Date(),
    });

    vi.mocked(mockAdapter.getPositionState).mockResolvedValue({
      ts: new Date(),
      market: GMX_MARKET,
      perpPosition: {
        sizeUsd: 100_000_000n,
        entryPrice: 50_000_000_000n,
        pnlUsd: 0n,
        liquidationPrice: null,
      },
      gmBalance: 100_000_000n,
      gmCostBasisUsd: 0n,
      gmMtmValueUsd: 0n,
    });
    vi.mocked(mockAdapter.getLiquidityBalance).mockResolvedValue({
      pool: GMX_POOL,
      balance: 100_000_000n,
    });

    const result = await runReconcile(mockAdapter, stateStore, DEFAULT_CONFIG, mockLogger);

    expect(result.consistent).toBe(false);
    expect(result.positionInconsistencies.length).toBeGreaterThan(0);
    expect(result.balanceInconsistencies.length).toBeGreaterThan(0);
  });
});
