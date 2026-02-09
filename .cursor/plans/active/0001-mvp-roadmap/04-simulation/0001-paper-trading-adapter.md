---
name: Paper Trading Adapter
overview: Implement delegating paper trading adapter that wraps a real ExchangeAdapter for market data and simulates execution locally.
todos:
  - id: paper-types
    content: Create src/adapters/paper/types.ts (PaperState, SimulationConfig, PaperAdapter, PaperAdapterConfig with marketDataSource)
    status: pending
  - id: paper-state
    content: Create src/adapters/paper/state.ts + state.test.ts (createPaperState, balance/position update helpers, generateOrderId)
    status: pending
  - id: order-execution
    content: Create src/adapters/paper/execution.ts + execution.test.ts (simulateMarketOrder with slippage, partial fills, latency, error simulation)
    status: pending
  - id: funding-simulation
    content: Create src/adapters/paper/funding.ts + funding.test.ts (simulateFundingPayment using live rates from marketDataSource)
    status: pending
  - id: adapter-rewrite
    content: Rewrite src/adapters/paper/adapter.ts + adapter.test.ts (delegating adapter — market data from source, execution simulated locally)
    status: pending
  - id: exports-and-wiring
    content: Update src/adapters/paper/index.ts, src/adapters/index.ts, and src/adapters/config.ts with new exports
    status: pending
  - id: code-review
    content: Run code-reviewer subagent — verify typecheck, biome, and CODE_GUIDELINES.md compliance
    status: pending
  - id: lifecycle-management
    content: "Move plan to implemented/ (cp to implemented/, git rm -f from active/, verify deletion)"
    status: pending
isProject: false
---

> **Note**: This plan is part of Phase 4 (Simulation) in [MVP Roadmap](../README.md).

# Paper Trading Adapter

## Overview

Implement a **delegating paper trading adapter** that wraps a real `ExchangeAdapter` (e.g., Coinbase) for market data reads and simulates order execution, balances, and positions locally. This allows testing execution logic against live market conditions without risking real capital.

Reference: [ADR-0010: Exchange Adapters](../../../../../adrs/0010-exchange-adapters.md), [ADR-0016: Backtesting & Simulation](../../../../../adrs/0016-backtesting-simulation.md)

## Architecture: Delegating Adapter Pattern

```
                        ┌─────────────────────────────────┐
                        │         PaperAdapter             │
  caller ──────────────►│                                  │
  (worker/evaluator)    │  Market data reads:              │
                        │    getTicker ──────► marketData   │──► Real Coinbase
                        │    getFundingRate ─► marketData   │    Adapter
                        │    getOrderBook ──► marketData   │
                        │    subscribeTicker► marketData   │
                        │                                  │
                        │  Execution (simulated locally):  │
                        │    createOrder ───► SimState      │
                        │    cancelOrder ───► SimState      │
                        │    getBalance ────► SimState      │
                        │    getPosition ──► SimState      │
                        └─────────────────────────────────┘
```

### Method Delegation Map

| Method | Source | Why |
|--------|--------|-----|
| `getTicker` | `marketDataSource` (delegated) | Real-time market prices |
| `getFundingRate` | `marketDataSource` (delegated) | Real funding rates |
| `getOrderBook` | `marketDataSource` (delegated) | Real liquidity for slippage |
| `subscribeTicker` / `unsubscribeTicker` | `marketDataSource` (delegated) | Real WebSocket feeds |
| `connect` / `disconnect` | Both | Connect underlying source + init state |
| `createOrder` | Simulated | Fill against real price + simulated slippage |
| `cancelOrder` | Simulated | Modify internal order state |
| `getOrder` / `getOpenOrders` | Simulated | Read from in-memory order store |
| `getBalance` / `getBalances` | Simulated | Track simulated balances |
| `getPosition` / `getPositions` | Simulated | Track simulated positions |

### Key Advantages

- **Real market conditions**: Orders fill against live bid/ask spreads and real order book depth
- **No data pumping**: No need to manually inject prices; market data comes from the real adapter
- **Same interface**: Implements `ExchangeAdapter`, so worker code is agnostic
- **Testable in isolation**: Unit tests pass a mock adapter as `marketDataSource` with controlled prices
- **Backtesting-ready**: `marketDataSource` can be swapped for a future `ReplayAdapter` that serves historical data

### Forward Compatibility: Backtesting via ReplayAdapter

The `marketDataSource: ExchangeAdapter` slot is designed to be pluggable. This enables three modes with the same paper adapter code:

| Mode | `marketDataSource` | Data comes from |
|------|-------------------|-----------------|
| Live Paper Trading | `CoinbaseAdapter` | Real-time Coinbase API |
| Backtesting | `ReplayAdapter` (future) | Historical data in Postgres |
| Unit Testing | Mock adapter (`vi.fn()`) | Controlled test data |

The **ReplayAdapter** (to be built in plans 0003/0004) would implement `ExchangeAdapter` and:
- Load historical data from Postgres via `HistoricalDataLoader`
- Maintain an internal clock that advances through the replay timeline
- Serve `getTicker()`, `getFundingRate()`, `getOrderBook()` from the closest historical snapshot to the current replay time
- Expose a `tick(timestamp)` method to advance the replay cursor

This **simplifies plan 0004 (Backtesting Engine)** significantly. Instead of duplicating its own `simulateEntry`/`simulateExit`/balance/position tracking logic, the engine delegates all execution to the paper adapter and becomes a thin orchestration loop:

```
replayAdapter = createReplayAdapter({ dataLoader, startDate, endDate })
paperAdapter  = createPaperAdapter({ marketDataSource: replayAdapter, ... })

for each timestamp in timeline:
  replayAdapter.tick(timestamp)              // advance market data cursor
  ticker = await paperAdapter.getTicker(sym) // reads from replay
  intent = evaluateStrategy(ticker, ...)     // strategy logic
  if intent == ENTER:
    await paperAdapter.createOrder(params)   // paper handles fill + slippage
  if intent == EXIT:
    await paperAdapter.createOrder(params)   // paper handles close + PnL
  await paperAdapter.processFunding()        // paper uses replayed rates

results = calculateMetrics(paperAdapter.getState())
```

**Impact on downstream plans**:
- **Plan 0003** (Historical Data Ingestion): No changes needed -- still ingests to Postgres
- **Plan 0004** (Backtesting Engine): Significantly simplified -- add `ReplayAdapter`, remove duplicate simulation logic, delegate execution to paper adapter
- **Plan 0005** (Backtesting CLI): No changes needed -- orchestrates the engine

## Tasks

### 1. Paper Types (`src/adapters/paper/types.ts`)

Define paper-specific types. **Reuse existing domain types** from `src/adapters/types.ts`.

```typescript
import * as v from "valibot";

import type {
  Balance,
  ExchangeAdapter,
  ExchangeOrder,
  Fill,
  Position,
} from "../types";

// --- Paper State (uses existing domain types) ---

export interface PaperState {
  balances: Map<string, Balance>;
  positions: Map<string, Position>;
  orders: Map<string, ExchangeOrder>;
  fills: Fill[];
}

// --- Simulation Config ---

export const SimulationConfigSchema = v.object({
  baseSlippageBps: v.bigint(),
  slippageVolatilityBps: v.bigint(),
  fillProbability: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
  partialFillProbability: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
  latencyMs: v.object({
    min: v.pipe(v.number(), v.minValue(0)),
    max: v.pipe(v.number(), v.minValue(0)),
  }),
  errorRate: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
});

export type SimulationConfig = v.InferOutput<typeof SimulationConfigSchema>;

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  baseSlippageBps: 10n,
  slippageVolatilityBps: 5n,
  fillProbability: 0.99,
  partialFillProbability: 0.1,
  latencyMs: { min: 50, max: 200 },
  errorRate: 0.01,
};

// --- Paper Adapter (extends ExchangeAdapter with test helpers) ---

export interface PaperAdapter extends ExchangeAdapter {
  /** Process funding payments for all open positions using live rates. */
  processFunding(): Promise<bigint>;
  /** Get a readonly snapshot of the internal simulation state. */
  getState(): Readonly<PaperState>;
}

// --- Paper Adapter Config ---

export interface PaperAdapterConfig {
  /** Real adapter to delegate market data reads to (e.g., Coinbase). */
  marketDataSource: ExchangeAdapter;
  /** Initial simulated balances (e.g., { USDT: 1000000000n }). */
  initialBalances: Record<string, bigint>;
  /** Simulation parameters. Defaults to DEFAULT_SIMULATION_CONFIG. */
  simulation?: Partial<SimulationConfig>;
}
```

### 2. Paper State (`src/adapters/paper/state.ts`)

State management using existing domain types.

```typescript
import type { Balance, ExchangeOrder, Fill, OrderSide, Position } from "../types";

import type { PaperState } from "./types";

export const createPaperState = (
  initialBalances: Record<string, bigint>,
): PaperState => {
  const balances = new Map<string, Balance>();

  for (const [asset, amount] of Object.entries(initialBalances)) {
    balances.set(asset, {
      asset,
      availableBase: amount,
      heldBase: 0n,
      totalBase: amount,
    });
  }

  return {
    balances,
    positions: new Map(),
    orders: new Map(),
    fills: [],
  };
};

export const getOrCreateBalance = (state: PaperState, asset: string): Balance => {
  const existing = state.balances.get(asset);
  if (existing) return existing;

  const balance: Balance = {
    asset,
    availableBase: 0n,
    heldBase: 0n,
    totalBase: 0n,
  };
  state.balances.set(asset, balance);
  return balance;
};

export const updateBalancesForFill = (
  state: PaperState,
  quoteAsset: string,
  side: OrderSide,
  quantityBase: bigint,
  priceQuote: bigint,
  feeQuote: bigint,
): void => {
  const balance = getOrCreateBalance(state, quoteAsset);
  const costQuote = (quantityBase * priceQuote) / PRICE_SCALE + feeQuote;

  if (side === "BUY") {
    balance.availableBase -= costQuote;
    balance.totalBase -= costQuote;
  } else {
    balance.availableBase += costQuote - feeQuote;
    balance.totalBase += costQuote - feeQuote;
  }
};

export const updatePositionFromFill = (
  state: PaperState,
  symbol: string,
  side: OrderSide,
  quantityBase: bigint,
  priceQuote: bigint,
): void => {
  const existing = state.positions.get(symbol);
  const positionSide = side === "BUY" ? "LONG" : "SHORT";

  if (!existing) {
    // Open new position
    state.positions.set(symbol, {
      symbol,
      side: positionSide,
      sizeBase: quantityBase,
      entryPriceQuote: priceQuote,
      markPriceQuote: priceQuote,
      liquidationPriceQuote: null,
      unrealizedPnlQuote: 0n,
      leverageBps: 10000n, // 1x default
      marginQuote: (quantityBase * priceQuote) / PRICE_SCALE,
    });
    return;
  }

  if (existing.side === positionSide) {
    // Increase position — weighted average entry
    const totalSize = existing.sizeBase + quantityBase;
    const weightedEntry =
      (existing.entryPriceQuote * existing.sizeBase +
        priceQuote * quantityBase) /
      totalSize;

    existing.sizeBase = totalSize;
    existing.entryPriceQuote = weightedEntry;
    existing.markPriceQuote = priceQuote;
    existing.marginQuote = (totalSize * weightedEntry) / PRICE_SCALE;
  } else {
    // Reduce or flip position
    if (quantityBase >= existing.sizeBase) {
      const remaining = quantityBase - existing.sizeBase;
      if (remaining === 0n) {
        state.positions.delete(symbol);
      } else {
        existing.side = positionSide;
        existing.sizeBase = remaining;
        existing.entryPriceQuote = priceQuote;
        existing.markPriceQuote = priceQuote;
        existing.marginQuote = (remaining * priceQuote) / PRICE_SCALE;
        existing.unrealizedPnlQuote = 0n;
      }
    } else {
      existing.sizeBase -= quantityBase;
      existing.markPriceQuote = priceQuote;
      existing.marginQuote =
        (existing.sizeBase * existing.entryPriceQuote) / PRICE_SCALE;
    }
  }
};

/** Generate a unique paper order ID. */
export const generateOrderId = (): string =>
  `paper-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const PRICE_SCALE = 100000000n; // 10^8 for price precision
```

### 3. Order Execution (`src/adapters/paper/execution.ts`)

Simulated order execution with slippage, partial fills, latency, and error injection.

```typescript
import { ExchangeError } from "../errors";
import type { CreateOrderParams, ExchangeOrder, Fill, Ticker } from "../types";

import { generateOrderId, updateBalancesForFill, updatePositionFromFill } from "./state";
import type { PaperState, SimulationConfig } from "./types";

/** Simulate a market order against live market data. */
export const simulateMarketOrder = async (
  state: PaperState,
  params: CreateOrderParams,
  ticker: Ticker,
  config: SimulationConfig,
): Promise<ExchangeOrder> => {
  // 1. Simulate latency
  await simulateLatency(config);

  // 2. Check for simulated error
  if (shouldSimulateError(config)) {
    throw new ExchangeError("Simulated API error", "NETWORK_ERROR", "paper");
  }

  // 3. Calculate fill price with slippage (against real bid/ask)
  const basePriceQuote =
    params.side === "BUY" ? ticker.askPriceQuote : ticker.bidPriceQuote;
  const slippageBps = calculateSlippageBps(config);
  const fillPriceQuote = applySlippage(basePriceQuote, slippageBps, params.side);

  // 4. Determine fill quantity (full or partial)
  const fillQuantityBase = calculateFillQuantity(params.quantityBase, config);

  // 5. Check balance sufficiency
  // (simplified: check quote asset for buys)
  // Full validation in implementation

  // 6. Update state
  const feeQuote = 0n; // Paper trading: zero fees by default
  updateBalancesForFill(state, "USDT", params.side, fillQuantityBase, fillPriceQuote, feeQuote);
  updatePositionFromFill(state, params.symbol, params.side, fillQuantityBase, fillPriceQuote);

  // 7. Record fill
  const now = new Date();
  const orderId = generateOrderId();
  const fillId = `fill-${orderId}`;

  const fill: Fill = {
    id: fillId,
    orderId,
    exchangeOrderId: orderId,
    symbol: params.symbol,
    side: params.side,
    quantityBase: fillQuantityBase,
    priceQuote: fillPriceQuote,
    feeQuote,
    feeAsset: "USDT",
    timestamp: now,
  };
  state.fills.push(fill);

  // 8. Build ExchangeOrder
  const status = fillQuantityBase === params.quantityBase ? "FILLED" : "PARTIALLY_FILLED";
  const order: ExchangeOrder = {
    id: orderId,
    exchangeOrderId: orderId,
    symbol: params.symbol,
    side: params.side,
    type: params.type,
    status,
    quantityBase: params.quantityBase,
    filledQuantityBase: fillQuantityBase,
    priceQuote: params.priceQuote ?? null,
    avgFillPriceQuote: fillPriceQuote,
    createdAt: now,
    updatedAt: now,
  };
  state.orders.set(orderId, order);

  return order;
};

/** Random slippage in bps: base + random * volatility. */
export const calculateSlippageBps = (config: SimulationConfig): bigint => {
  const volatility = Number(config.slippageVolatilityBps);
  const randomComponent = BigInt(Math.floor(Math.random() * volatility));
  return config.baseSlippageBps + randomComponent;
};

/** Apply slippage to price. BUY pays more, SELL receives less. */
export const applySlippage = (
  priceQuote: bigint,
  slippageBps: bigint,
  side: "BUY" | "SELL",
): bigint => {
  const adjustment = (priceQuote * slippageBps) / 10000n;
  return side === "BUY" ? priceQuote + adjustment : priceQuote - adjustment;
};

/** Determine fill quantity — full or partial based on config probability. */
export const calculateFillQuantity = (
  quantityBase: bigint,
  config: SimulationConfig,
): bigint => {
  if (Math.random() < config.partialFillProbability) {
    const fillPct = BigInt(Math.floor(Math.random() * 50 + 50)); // 50-100%
    return (quantityBase * fillPct) / 100n;
  }
  return quantityBase;
};

/** Simulate network latency. */
export const simulateLatency = async (config: SimulationConfig): Promise<void> => {
  const ms =
    config.latencyMs.min +
    Math.random() * (config.latencyMs.max - config.latencyMs.min);
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

/** Check if we should inject a simulated error. */
export const shouldSimulateError = (config: SimulationConfig): boolean =>
  Math.random() < config.errorRate;
```

### 4. Funding Simulation (`src/adapters/paper/funding.ts`)

Uses **live funding rates** from the delegated market data source.

```typescript
import type { ExchangeAdapter } from "../types";

import { getOrCreateBalance } from "./state";
import type { PaperState } from "./types";

/** Calculate and apply funding payment for a symbol using live rate. */
export const simulateFundingPayment = async (
  state: PaperState,
  symbol: string,
  marketDataSource: ExchangeAdapter,
): Promise<bigint> => {
  const position = state.positions.get(symbol);
  if (!position || position.sizeBase === 0n) {
    return 0n;
  }

  // Fetch live funding rate
  const fundingRate = await marketDataSource.getFundingRate(symbol);

  // Funding = notional * funding rate
  // notional = sizeBase * markPrice
  const notionalQuote =
    (position.sizeBase * position.markPriceQuote) / PRICE_SCALE;
  const paymentQuote = (notionalQuote * fundingRate.rateBps) / 10000n;

  // Short receives positive funding, Long pays
  const fundingPnlQuote = position.side === "SHORT" ? paymentQuote : -paymentQuote;

  // Update quote balance
  const balance = getOrCreateBalance(state, "USDT");
  balance.availableBase += fundingPnlQuote;
  balance.totalBase += fundingPnlQuote;

  return fundingPnlQuote;
};

const PRICE_SCALE = 100000000n;
```

### 5. Full Adapter (`src/adapters/paper/adapter.ts` — REWRITE)

Delegating adapter: market data from `marketDataSource`, execution simulated locally.

```typescript
import type { ExchangeAdapter } from "../types";

import { simulateMarketOrder, simulateLatency } from "./execution";
import { simulateFundingPayment } from "./funding";
import { createPaperState, generateOrderId } from "./state";
import type { PaperAdapter, PaperAdapterConfig, SimulationConfig } from "./types";
import { DEFAULT_SIMULATION_CONFIG } from "./types";

export const createPaperAdapter = (config: PaperAdapterConfig): PaperAdapter => {
  const state = createPaperState(config.initialBalances);
  const simulation: SimulationConfig = {
    ...DEFAULT_SIMULATION_CONFIG,
    ...config.simulation,
  };
  const source = config.marketDataSource;
  let connected = false;

  return {
    // --- Connection (delegates to source) ---
    connect: async (): Promise<void> => {
      if (!source.isConnected()) {
        await source.connect();
      }
      connected = true;
    },
    disconnect: async (): Promise<void> => {
      connected = false;
      // Don't disconnect source — caller may still use it
    },
    isConnected: (): boolean => connected && source.isConnected(),

    // --- Market data (delegated to source) ---
    getTicker: (symbol) => source.getTicker(symbol),
    getFundingRate: (symbol) => source.getFundingRate(symbol),
    getOrderBook: (symbol, depth) => source.getOrderBook(symbol, depth),
    subscribeTicker: (symbol, cb) => source.subscribeTicker(symbol, cb),
    unsubscribeTicker: (symbol) => source.unsubscribeTicker(symbol),

    // --- Balances (simulated) ---
    getBalance: async (asset) => {
      return state.balances.get(asset) ?? {
        asset, availableBase: 0n, heldBase: 0n, totalBase: 0n,
      };
    },
    getBalances: async () => Array.from(state.balances.values()),

    // --- Orders (simulated) ---
    createOrder: async (params) => {
      const ticker = await source.getTicker(params.symbol);
      return simulateMarketOrder(state, params, ticker, simulation);
    },
    cancelOrder: async (orderId) => {
      const order = state.orders.get(orderId);
      if (!order) {
        throw new ExchangeError("Order not found", "ORDER_NOT_FOUND", "paper");
      }
      order.status = "CANCELLED";
      order.updatedAt = new Date();
    },
    getOrder: async (orderId) => state.orders.get(orderId) ?? null,
    getOpenOrders: async (symbol) => {
      const open = ["PENDING", "OPEN", "PARTIALLY_FILLED"];
      return Array.from(state.orders.values()).filter(
        (o) => open.includes(o.status) && (!symbol || o.symbol === symbol),
      );
    },

    // --- Positions (simulated) ---
    getPosition: async (symbol) => state.positions.get(symbol) ?? null,
    getPositions: async () => Array.from(state.positions.values()),

    // --- Paper-specific helpers ---
    processFunding: async () => {
      let totalQuote = 0n;
      for (const symbol of state.positions.keys()) {
        totalQuote += await simulateFundingPayment(state, symbol, source);
      }
      return totalQuote;
    },
    getState: () => state,
  };
};
```

### 6. Exports and Wiring

**`src/adapters/paper/index.ts`**:

```typescript
export { createPaperAdapter } from "./adapter";
export type { PaperAdapter, PaperAdapterConfig, PaperState, SimulationConfig } from "./types";
export { DEFAULT_SIMULATION_CONFIG } from "./types";
```

**`src/adapters/index.ts`** — add `PaperAdapter`, `SimulationConfig`, `DEFAULT_SIMULATION_CONFIG`.

**`src/adapters/config.ts`** — the paper variant already supports `initialBalances`. No schema change needed since `marketDataSource` is a runtime dependency, not serializable config.

## File Structure

```
src/adapters/paper/
├── types.ts              # PaperState, SimulationConfig, PaperAdapter, PaperAdapterConfig
├── state.ts              # createPaperState, balance/position update helpers
├── state.test.ts         # State management tests
├── execution.ts          # simulateMarketOrder, slippage, latency, errors
├── execution.test.ts     # Execution simulation tests
├── funding.ts            # simulateFundingPayment
├── funding.test.ts       # Funding simulation tests
├── adapter.ts            # createPaperAdapter (delegating adapter)
├── adapter.test.ts       # Full adapter integration tests
└── index.ts              # Re-exports
```

## Usage Example

```typescript
// Worker startup: create real Coinbase adapter + paper wrapper
const coinbase = createCoinbaseAdapter({ apiKey, apiSecret });

const paper = createPaperAdapter({
  marketDataSource: coinbase,
  initialBalances: { USDT: 1000000000n }, // $10,000
  simulation: { baseSlippageBps: 5n, errorRate: 0 },
});

await paper.connect(); // connects underlying Coinbase adapter

// Worker uses paper adapter — same interface as real adapter
const ticker = await paper.getTicker("BTC-PERP");   // → live Coinbase data
const order = await paper.createOrder(params);        // → simulated fill
const balance = await paper.getBalance("USDT");       // → simulated balance
const funding = await paper.processFunding();          // → uses live rates
```

## Implementation Context

### Code Patterns
- Factory pattern: `createPaperAdapter(config)` returns `PaperAdapter` — see `src/adapters/coinbase/adapter.ts`
- Closure-based state: all state captured in factory closure, no classes
- Error handling: `throw new ExchangeError(message, code, "paper")` — see `src/adapters/errors.ts`

### Relevant Types (from `src/adapters/types.ts`)
- `ExchangeAdapter` (17 methods) — lines 246-274
- `Balance`, `ExchangeOrder`, `Fill`, `Position`, `Ticker`, `FundingRate`, `OrderBook` — lines 29-102
- `CreateOrderParams` — lines 105-114
- `OrderSide`, `OrderType`, `ExchangeOrderStatus`, `PositionSide` — lines 10-23

### Test Patterns (from `src/adapters/coinbase/adapter.test.ts`)
- Vitest with `describe`/`it`, `vi.fn()`, `vi.useFakeTimers()`
- Inline factories: `createMockOrder(overrides?: Partial<ExchangeOrder>)`
- Mock market data source: `{ getTicker: vi.fn().mockResolvedValue(...) } as unknown as ExchangeAdapter`
- Arrange-Act-Assert structure
- `beforeEach(() => vi.clearAllMocks())`

### Error Handling
- Use `ExchangeError` from `src/adapters/errors.ts`
- Codes: `INSUFFICIENT_BALANCE`, `ORDER_NOT_FOUND`, `INVALID_ORDER`, `RATE_LIMITED`, `NETWORK_ERROR`
- Always pass `"paper"` as the exchange name

## Dependencies

No new dependencies required.

## Validation

- [ ] Paper adapter implements full ExchangeAdapter interface
- [ ] Market data methods delegate to marketDataSource correctly
- [ ] Order execution simulates slippage against live bid/ask
- [ ] Partial fills work correctly
- [ ] API errors simulated at configured rate
- [ ] Funding payments use live rates from marketDataSource
- [ ] Balances and positions updated correctly after fills
- [ ] Position reduce/close/flip logic works
- [ ] cancelOrder, getOrder, getOpenOrders work correctly
- [ ] Unit tests pass for state, execution, funding, and adapter
- [ ] Typecheck passes
- [ ] Biome passes

## References

- [MVP Roadmap](../README.md)
- [ADR-0010: Exchange Adapters](../../../../../adrs/0010-exchange-adapters.md)
- [ADR-0016: Backtesting & Simulation](../../../../../adrs/0016-backtesting-simulation.md)
