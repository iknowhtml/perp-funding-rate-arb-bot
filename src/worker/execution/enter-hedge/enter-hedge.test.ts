import { describe, expect, it, vi } from "vitest";

import type { ProtocolAdapter } from "@/adapters/types";
import type { ExchangeOrder } from "@/adapters/types";
import { DEFAULT_RISK_CONFIG, type RiskSnapshot } from "@/domains/risk";
import type { Logger } from "@/lib/logger";
import type { CircuitBreaker } from "@/lib/rate-limiter";

import { DEFAULT_EXECUTION_CONFIG, ExecutionError } from "../types";
import type { ExecutionConfig } from "../types";
import { executeEnterHedge } from "./enter-hedge";
import type { EnterHedgeDeps, EnterHedgeExecutionParams } from "./enter-hedge";

/** USDC scale factor: 10^6 */
const QUOTE_SCALE = 1_000_000n;

/** Create a mock filled order. */
const _createFilledOrder = (overrides?: Partial<ExchangeOrder>): ExchangeOrder => ({
  id: "order-1",
  exchangeOrderId: "exch-1",
  symbol: "BTC-USD",
  side: "BUY",
  type: "MARKET",
  status: "FILLED",
  quantityBase: 100000n,
  filledQuantityBase: 100000n,
  priceQuote: null,
  avgFillPriceQuote: 50000n * QUOTE_SCALE,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

/** Create a safe risk snapshot. */
const createSafeSnapshot = (): RiskSnapshot => ({
  equityQuote: 100_000n * QUOTE_SCALE,
  marginUsedQuote: 5_000n * QUOTE_SCALE,
  position: null,
  dailyPnlQuote: 0n,
  peakEquityQuote: 100_000n * QUOTE_SCALE,
});

const createMockLogger = (): Logger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

const createMockCircuitBreaker = (isOpen = false): CircuitBreaker => ({
  execute: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
  getState: vi.fn().mockReturnValue(isOpen ? "OPEN" : "CLOSED"),
  isOpen: vi.fn().mockReturnValue(isOpen),
  reset: vi.fn(),
  onStateChange: vi.fn().mockReturnValue(() => {}),
});

const createTestConfig = (): ExecutionConfig => ({
  ...DEFAULT_EXECUTION_CONFIG,
  orderFillTimeoutMs: 1000,
  fillPollIntervalMs: 10,
});

const createDefaultParams = (): EnterHedgeExecutionParams => ({
  sizeBase: 100000n,
  symbol: "BTC-USD",
  perpSymbol: "BTC-USD-PERP",
  intentId: "intent-1",
});

const createDefaultDeps = (overrides?: {
  adapter?: Partial<ProtocolAdapter>;
  isCircuitBreakerOpen?: boolean;
  riskSnapshot?: RiskSnapshot;
}): EnterHedgeDeps => {
  const adapter: ProtocolAdapter = {
    getMarketsInfo: vi.fn().mockResolvedValue([]),
    getTickers: vi.fn().mockResolvedValue([]),
    getPositionState: vi.fn().mockResolvedValue(null),
    getLiquidityBalance: vi.fn().mockResolvedValue({ pool: "default", balance: 0n }),
    simulateOrder: vi.fn().mockResolvedValue({ impactBps: 0n }),
    submitOrder: vi.fn().mockResolvedValue({ hash: "0x", success: true }),
    ...overrides?.adapter,
  };

  return {
    adapter,
    getRiskSnapshot: vi.fn().mockReturnValue(overrides?.riskSnapshot ?? createSafeSnapshot()),
    riskConfig: DEFAULT_RISK_CONFIG,
    executionConfig: {
      ...createTestConfig(),
      gmxMarketAddress: "0x47c031236e19d024b42f8AE6780E44A573170703",
    },
    circuitBreaker: createMockCircuitBreaker(overrides?.isCircuitBreakerOpen ?? false),
    logger: createMockLogger(),
  };
};

describe("executeEnterHedge", () => {
  it("should abort when circuit breaker is open", async () => {
    const deps = createDefaultDeps({ isCircuitBreakerOpen: true });
    const params = createDefaultParams();

    const result = await executeEnterHedge(params, deps);

    expect(result.success).toBe(false);
    expect(result.aborted).toBe(true);
    expect(result.reason).toBe("execution_circuit_breaker_open");
  });

  it("should abort when risk check fails at DANGER level", async () => {
    const dangerSnapshot: RiskSnapshot = {
      equityQuote: 100_000n * QUOTE_SCALE,
      marginUsedQuote: 5_000n * QUOTE_SCALE,
      position: {
        side: "SHORT",
        notionalQuote: 5_000n * QUOTE_SCALE,
        leverageBps: 5000n,
        markPriceQuote: 50_000n * QUOTE_SCALE,
        liquidationPriceQuote: 54_000n * QUOTE_SCALE, // < 20% buffer = DANGER
      },
      dailyPnlQuote: -600n * QUOTE_SCALE, // Exceeds max daily loss
      peakEquityQuote: 100_000n * QUOTE_SCALE,
    };

    const deps = createDefaultDeps({ riskSnapshot: dangerSnapshot });
    const params = createDefaultParams();

    const result = await executeEnterHedge(params, deps);

    expect(result.success).toBe(false);
    expect(result.aborted).toBe(true);
    expect(result.reason).toContain("Risk check failed");
  });

  it("should abort when risk action is BLOCK", async () => {
    const blockedSnapshot: RiskSnapshot = {
      equityQuote: 100_000n * QUOTE_SCALE,
      marginUsedQuote: 5_000n * QUOTE_SCALE,
      position: {
        side: "SHORT",
        notionalQuote: 15_000n * QUOTE_SCALE, // Exceeds max position
        leverageBps: 5000n,
        markPriceQuote: 50_000n * QUOTE_SCALE,
        liquidationPriceQuote: 75_000n * QUOTE_SCALE,
      },
      dailyPnlQuote: 0n,
      peakEquityQuote: 100_000n * QUOTE_SCALE,
    };

    const deps = createDefaultDeps({ riskSnapshot: blockedSnapshot });
    const params = createDefaultParams();

    const result = await executeEnterHedge(params, deps);

    expect(result.success).toBe(false);
    expect(result.aborted).toBe(true);
  });

  it("should execute successfully and return txResult (GMX path)", async () => {
    const deps = createDefaultDeps();
    const params = createDefaultParams();

    const result = await executeEnterHedge(params, deps);

    expect(result.success).toBe(true);
    expect(result.aborted).toBe(false);
    expect(result.txResult).toBeDefined();
    expect(result.txResult?.hash).toBe("0x");
    expect(result.txResult?.success).toBe(true);
    expect(deps.adapter.simulateOrder).toHaveBeenCalled();
    expect(deps.adapter.submitOrder).toHaveBeenCalled();
  });

  it("should throw ExecutionError when submitOrder fails", async () => {
    const deps = createDefaultDeps();
    vi.mocked(deps.adapter.submitOrder).mockRejectedValueOnce(new Error("Exchange unavailable"));
    const params = createDefaultParams();

    await expect(executeEnterHedge(params, deps)).rejects.toThrow(ExecutionError);
  });
});
