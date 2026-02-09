import { describe, expect, it, vi } from "vitest";

import type { ExchangeAdapter } from "@/adapters/types";
import type { DerivedPosition } from "@/domains/position";
import { DEFAULT_RISK_CONFIG } from "@/domains/risk/config";
import type { RiskAssessment, RiskSnapshot } from "@/domains/risk/types";
import { DEFAULT_STRATEGY_CONFIG } from "@/domains/strategy/config";
import type { StrategyInput, TradingIntent } from "@/domains/strategy/types";
import type { Logger } from "@/lib/logger";
import type { CircuitBreaker } from "@/lib/rate-limiter/circuit-breaker";
import { DEFAULT_EXECUTION_CONFIG } from "@/worker/execution/types";
import { DEFAULT_FRESHNESS_CONFIG } from "@/worker/freshness";
import type { SerialQueue } from "@/worker/queue";
import type { StateStore } from "@/worker/state";
import type { HealthMonitor } from "@/worker/websocket/health-monitor";

import { evaluate } from "./evaluate";
import type { EvaluatorDeps } from "./evaluate";

vi.mock("@/domains/risk/evaluate", () => ({
  evaluateRisk: vi.fn(),
}));

vi.mock("@/domains/strategy/evaluate", () => ({
  evaluateStrategy: vi.fn(),
}));

const createMockLogger = (): Logger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

const createMockStateStore = (getStateReturn: unknown): StateStore =>
  ({
    getState: vi.fn().mockReturnValue(getStateReturn),
  }) as unknown as StateStore;

const createMockQueue = (): {
  queue: SerialQueue;
  enqueueCalls: Array<(signal: AbortSignal) => Promise<unknown>>;
} => {
  const enqueueCalls: Array<(signal: AbortSignal) => Promise<unknown>> = [];
  const queue: SerialQueue = {
    enqueue: vi.fn().mockImplementation((fn: (signal: AbortSignal) => Promise<unknown>) => {
      enqueueCalls.push(fn);
      return {
        id: `job-${enqueueCalls.length}`,
        promise: Promise.resolve(),
        cancel: vi.fn(),
        getStatus: vi.fn().mockReturnValue("pending"),
      };
    }),
    getStatus: vi.fn().mockReturnValue(null),
    getPendingCount: vi.fn().mockReturnValue(0),
    cancelAll: vi.fn(),
    waitForIdle: vi.fn().mockResolvedValue(undefined),
  };
  return { queue, enqueueCalls };
};

const createMockHealthMonitor = (isHealthy: boolean): HealthMonitor =>
  ({
    isHealthy: vi.fn().mockReturnValue(isHealthy),
  }) as unknown as HealthMonitor;

const createOpenDerivedPosition = (): DerivedPosition =>
  ({
    open: true,
    side: "SHORT",
    spotQuantityBase: 100000n,
    perpQuantityBase: 100000n,
    notionalQuote: 5_000_000_000_000n,
    entryTime: new Date(),
    entryPriceQuote: 50_000_000_000_000n,
    entryFundingRateBps: 10n,
    markPriceQuote: 50_000_000_000_000n,
    unrealizedPnlQuote: 0n,
    fundingAccruedQuote: 0n,
    marginUsedQuote: 500_000_000_000n,
    marginBufferBps: 2000n,
    liquidationPriceQuote: null,
    liquidationDistanceBps: 10000n,
    lastUpdated: new Date(),
    source: "rest",
  }) as DerivedPosition;

const createBaseDeps = (overrides?: Partial<EvaluatorDeps>): EvaluatorDeps => {
  const { queue } = createMockQueue();
  return {
    stateStore: createMockStateStore({}),
    executionQueue: queue,
    adapter: {} as ExchangeAdapter,
    healthMonitor: createMockHealthMonitor(true),
    freshnessConfig: DEFAULT_FRESHNESS_CONFIG,
    riskConfig: DEFAULT_RISK_CONFIG,
    strategyConfig: DEFAULT_STRATEGY_CONFIG,
    executionConfig: DEFAULT_EXECUTION_CONFIG,
    circuitBreaker: { isOpen: vi.fn().mockReturnValue(false) } as unknown as CircuitBreaker,
    logger: createMockLogger(),
    symbol: "BTC-USD",
    perpSymbol: "BTC-USD-PERP",
    baseDecimals: 8,
    getRiskSnapshot: vi.fn().mockReturnValue({
      equityQuote: 100_000n * 1_000_000n,
      marginUsedQuote: 5_000n * 1_000_000n,
      position: null,
      dailyPnlQuote: 0n,
      peakEquityQuote: 100_000n * 1_000_000n,
    } as RiskSnapshot),
    getStrategyInput: vi.fn().mockReturnValue(null),
    getDerivedPosition: vi.fn().mockReturnValue(null),
    ...overrides,
  };
};

describe("evaluate", () => {
  it("skips evaluation when execution queue has pending work", async () => {
    const { queue } = createMockQueue();
    (queue.getPendingCount as ReturnType<typeof vi.fn>).mockReturnValue(1);
    const logger = createMockLogger();
    const deps = createBaseDeps({
      executionQueue: queue,
      logger,
    });

    await evaluate(deps);

    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith("Skipping evaluation: execution in progress");
  });

  it("queues exit on EMERGENCY_EXIT when position is open", async () => {
    const { evaluateRisk } = await import("@/domains/risk/evaluate");
    const { queue, enqueueCalls } = createMockQueue();
    const position = createOpenDerivedPosition();
    const deps = createBaseDeps({
      executionQueue: queue,
      healthMonitor: createMockHealthMonitor(false),
      getDerivedPosition: vi.fn().mockReturnValue(position),
    });
    (deps.stateStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
      lastTickerUpdate: null,
      lastFundingUpdate: null,
      lastAccountUpdate: null,
      wsConnected: false,
    });

    await evaluate(deps);

    expect(queue.enqueue).toHaveBeenCalledTimes(1);
    expect(evaluateRisk).not.toHaveBeenCalled();
    const enqueuedFn = enqueueCalls[0];
    expect(enqueuedFn).toBeDefined();
  });

  it("queues exit on risk EXIT when position is open", async () => {
    const { evaluateRisk } = await import("@/domains/risk/evaluate");
    const { evaluateStrategy } = await import("@/domains/strategy/evaluate");
    const { queue } = createMockQueue();
    const position = createOpenDerivedPosition();
    const riskExit: RiskAssessment = {
      level: "DANGER",
      action: "EXIT",
      reasons: ["Daily loss exceeds maximum"],
      metrics: {
        notionalQuote: 5_000n * 1_000_000n,
        leverageBps: 5000n,
        marginUtilizationBps: 5000n,
        liquidationDistanceBps: 5000n,
        dailyPnlQuote: -600n * 1_000_000n,
        drawdownBps: 600n,
      },
    };
    (evaluateRisk as ReturnType<typeof vi.fn>).mockReturnValue(riskExit);
    const deps = createBaseDeps({
      executionQueue: queue,
      getDerivedPosition: vi.fn().mockReturnValue(position),
    });

    await evaluate(deps);

    expect(queue.enqueue).toHaveBeenCalledTimes(1);
    expect(evaluateStrategy).not.toHaveBeenCalled();
  });

  it("does not queue when risk is PAUSE", async () => {
    const { evaluateRisk } = await import("@/domains/risk/evaluate");
    const { evaluateStrategy } = await import("@/domains/strategy/evaluate");
    const { queue } = createMockQueue();
    (evaluateRisk as ReturnType<typeof vi.fn>).mockReturnValue({
      level: "WARNING",
      action: "PAUSE",
      reasons: ["Margin utilization approaching limit"],
      metrics: {},
    });
    const deps = createBaseDeps({ executionQueue: queue });

    await evaluate(deps);

    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(evaluateStrategy).not.toHaveBeenCalled();
  });

  it("does not queue when getStrategyInput returns null", async () => {
    const { evaluateRisk } = await import("@/domains/risk/evaluate");
    const { queue } = createMockQueue();
    (evaluateRisk as ReturnType<typeof vi.fn>).mockReturnValue({
      level: "SAFE",
      action: "ALLOW",
      reasons: [],
      metrics: {},
    });
    const deps = createBaseDeps({
      executionQueue: queue,
      getStrategyInput: vi.fn().mockReturnValue(null),
    });

    await evaluate(deps);

    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it("does not queue when strategy returns NOOP", async () => {
    const { evaluateRisk } = await import("@/domains/risk/evaluate");
    const { evaluateStrategy } = await import("@/domains/strategy/evaluate");
    const { queue } = createMockQueue();
    const strategyInput: StrategyInput = {
      fundingRate: {
        symbol: "BTC-USD",
        currentRateBps: 10n,
        predictedRateBps: 10n,
        nextFundingTime: new Date(),
        lastFundingTime: new Date(),
        markPriceQuote: 50_000_000_000_000n,
        indexPriceQuote: 50_000_000_000_000n,
        timestamp: new Date(),
        source: "exchange",
      },
      fundingHistory: [],
      position: null,
      equityQuote: 100_000n * 1_000_000n,
      marginUsedQuote: 5_000n * 1_000_000n,
    };
    (evaluateRisk as ReturnType<typeof vi.fn>).mockReturnValue({
      level: "SAFE",
      action: "ALLOW",
      reasons: [],
      metrics: {},
    });
    (evaluateStrategy as ReturnType<typeof vi.fn>).mockReturnValue({
      type: "NOOP",
    } as TradingIntent);
    const deps = createBaseDeps({
      executionQueue: queue,
      getStrategyInput: vi.fn().mockReturnValue(strategyInput),
    });

    await evaluate(deps);

    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it("queues enter when strategy returns ENTER_HEDGE", async () => {
    const { evaluateRisk } = await import("@/domains/risk/evaluate");
    const { evaluateStrategy } = await import("@/domains/strategy/evaluate");
    const { queue, enqueueCalls } = createMockQueue();
    const strategyInput: StrategyInput = {
      fundingRate: {
        symbol: "BTC-USD",
        currentRateBps: 10n,
        predictedRateBps: 10n,
        nextFundingTime: new Date(),
        lastFundingTime: new Date(),
        markPriceQuote: 50_000_000_000_000n,
        indexPriceQuote: 50_000_000_000_000n,
        timestamp: new Date(),
        source: "exchange",
      },
      fundingHistory: [],
      position: null,
      equityQuote: 100_000n * 1_000_000n,
      marginUsedQuote: 5_000n * 1_000_000n,
    };
    (evaluateRisk as ReturnType<typeof vi.fn>).mockReturnValue({
      level: "SAFE",
      action: "ALLOW",
      reasons: [],
      metrics: {},
    });
    (evaluateStrategy as ReturnType<typeof vi.fn>).mockReturnValue({
      type: "ENTER_HEDGE",
      params: {
        sizeQuote: 5_000_000_000_000n,
        expectedYieldBps: 50n,
        confidence: "MEDIUM",
      },
    } as TradingIntent);
    const deps = createBaseDeps({
      executionQueue: queue,
      getStrategyInput: vi.fn().mockReturnValue(strategyInput),
    });

    await evaluate(deps);

    expect(queue.enqueue).toHaveBeenCalledTimes(1);
    expect(enqueueCalls.length).toBe(1);
  });
});
