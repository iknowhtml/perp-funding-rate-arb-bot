import { describe, expect, it, vi } from "vitest";

import type { ExchangeAdapter } from "@/adapters/types";
import type { Logger } from "@/lib/logger";
import type { StateStore } from "@/worker/state";

import { runStartupSequence } from "./startup";
import type { StartupDeps } from "./startup";

vi.mock("@/worker/reconciler", () => ({
  runReconcile: vi.fn(),
}));

const createMockLogger = (): Logger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

const createMockAdapter = (): ExchangeAdapter => ({}) as unknown as ExchangeAdapter;

const createMockStateStore = (): StateStore =>
  ({
    getState: vi.fn(),
    updateTicker: vi.fn(),
    updateOrderBook: vi.fn(),
    updateFundingRate: vi.fn(),
    updateBalances: vi.fn(),
    updatePositions: vi.fn(),
    updateOrders: vi.fn(),
    setWsConnected: vi.fn(),
    reset: vi.fn(),
  }) as unknown as StateStore;

const createStartupDeps = (overrides?: Partial<StartupDeps>): StartupDeps => ({
  adapter: createMockAdapter(),
  stateStore: createMockStateStore(),
  reconcilerConfig: {
    intervalMs: 60_000,
    toleranceSizeBps: 50n,
    tolerancePriceBps: 100n,
    toleranceBalanceBps: 50n,
    perpSymbol: "BTC-USD-PERP",
    baseAsset: "BTC",
    quoteAsset: "USD",
    baseDecimals: 8,
  },
  logger: createMockLogger(),
  ...overrides,
});

describe("runStartupSequence", () => {
  it("runs reconciliation and logs consistent state", async () => {
    const { runReconcile } = await import("@/worker/reconciler");
    (runReconcile as ReturnType<typeof vi.fn>).mockResolvedValue({
      consistent: true,
      balanceInconsistencies: [],
      positionInconsistencies: [],
      correctedPosition: {},
      timestamp: new Date(),
    });
    const logger = createMockLogger();
    const deps = createStartupDeps({ logger });

    await runStartupSequence(deps);

    expect(runReconcile).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith("Startup reconciliation complete", {
      consistent: true,
      balanceInconsistencies: 0,
      positionInconsistencies: 0,
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("logs warning when position inconsistencies exist", async () => {
    const { runReconcile } = await import("@/worker/reconciler");
    const inconsistencies = [
      { field: "spotQuantityBase", expected: 100n, actual: 99n, severity: "warning" as const },
    ];
    (runReconcile as ReturnType<typeof vi.fn>).mockResolvedValue({
      consistent: false,
      balanceInconsistencies: [],
      positionInconsistencies: inconsistencies,
      correctedPosition: {},
      timestamp: new Date(),
    });
    const logger = createMockLogger();
    const deps = createStartupDeps({ logger });

    await runStartupSequence(deps);

    expect(logger.info).toHaveBeenCalledWith("Startup reconciliation complete", {
      consistent: false,
      balanceInconsistencies: 0,
      positionInconsistencies: 1,
    });
    expect(logger.warn).toHaveBeenCalledWith("Startup: position inconsistencies detected", {
      inconsistencies,
    });
  });
});
