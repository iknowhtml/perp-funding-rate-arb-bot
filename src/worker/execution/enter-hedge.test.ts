import { describe, expect, it, vi } from "vitest";

import type { ExchangeAdapter, ExchangeOrder, OrderBook } from "@/adapters/types";
import { DEFAULT_RISK_CONFIG } from "@/domains/risk/config";
import type { RiskSnapshot } from "@/domains/risk/types";
import type { Logger } from "@/lib/logger/logger";
import type { CircuitBreaker } from "@/lib/rate-limiter/circuit-breaker";

import { executeEnterHedge } from "./enter-hedge";
import type { EnterHedgeDeps, EnterHedgeExecutionParams } from "./enter-hedge";
import { DEFAULT_EXECUTION_CONFIG, ExecutionError } from "./types";
import type { ExecutionConfig } from "./types";

/** USDC scale factor: 10^6 */
const QUOTE_SCALE = 1_000_000n;

/** Create a mock filled order. */
const createFilledOrder = (overrides?: Partial<ExchangeOrder>): ExchangeOrder => ({
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

/** Create a mock order book with reasonable liquidity. */
const createMockOrderBook = (): OrderBook => ({
  symbol: "BTC-USD",
  bids: [
    { priceQuote: 49900n * QUOTE_SCALE, quantityBase: 1000000n },
    { priceQuote: 49800n * QUOTE_SCALE, quantityBase: 1000000n },
  ],
  asks: [
    { priceQuote: 50100n * QUOTE_SCALE, quantityBase: 1000000n },
    { priceQuote: 50200n * QUOTE_SCALE, quantityBase: 1000000n },
  ],
  timestamp: new Date(),
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
  adapter?: Partial<ExchangeAdapter>;
  isCircuitBreakerOpen?: boolean;
  riskSnapshot?: RiskSnapshot;
}): EnterHedgeDeps => {
  const perpOrder = createFilledOrder({
    id: "perp-1",
    symbol: "BTC-USD-PERP",
    side: "SELL",
  });
  const spotOrder = createFilledOrder({
    id: "spot-1",
    symbol: "BTC-USD",
    side: "BUY",
  });

  const adapter = {
    createOrder: vi.fn().mockResolvedValueOnce(perpOrder).mockResolvedValueOnce(spotOrder),
    getOrder: vi.fn().mockResolvedValueOnce(perpOrder).mockResolvedValueOnce(spotOrder),
    getOrderBook: vi.fn().mockResolvedValue(createMockOrderBook()),
    ...overrides?.adapter,
  } as unknown as ExchangeAdapter;

  return {
    adapter,
    getRiskSnapshot: vi.fn().mockReturnValue(overrides?.riskSnapshot ?? createSafeSnapshot()),
    riskConfig: DEFAULT_RISK_CONFIG,
    executionConfig: createTestConfig(),
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

  it("should abort when slippage validation fails", async () => {
    // Create thin order book that won't pass slippage check
    const thinBook: OrderBook = {
      symbol: "BTC-USD",
      bids: [{ priceQuote: 49900n * QUOTE_SCALE, quantityBase: 10n }],
      asks: [{ priceQuote: 50100n * QUOTE_SCALE, quantityBase: 10n }],
      timestamp: new Date(),
    };

    const deps = createDefaultDeps({
      adapter: { getOrderBook: vi.fn().mockResolvedValue(thinBook) },
    });
    const params = createDefaultParams();

    const result = await executeEnterHedge(params, deps);

    expect(result.success).toBe(false);
    expect(result.aborted).toBe(true);
    // Should fail on either slippage or liquidity
    expect(result.reason).toBeDefined();
  });

  it("should execute successfully with filled orders", async () => {
    const deps = createDefaultDeps();
    const params = createDefaultParams();

    const result = await executeEnterHedge(params, deps);

    expect(result.success).toBe(true);
    expect(result.aborted).toBe(false);
    expect(result.perpOrder).toBeDefined();
    expect(result.spotOrder).toBeDefined();
    expect(result.drift).toBeDefined();
    expect(result.slippageEstimate).toBeDefined();
  });

  it("should throw ExecutionError when order placement fails", async () => {
    const deps = createDefaultDeps();
    // Make the circuit breaker's execute throw
    vi.mocked(deps.circuitBreaker.execute).mockRejectedValueOnce(new Error("Exchange unavailable"));
    const params = createDefaultParams();

    await expect(executeEnterHedge(params, deps)).rejects.toThrow(ExecutionError);
  });
});
