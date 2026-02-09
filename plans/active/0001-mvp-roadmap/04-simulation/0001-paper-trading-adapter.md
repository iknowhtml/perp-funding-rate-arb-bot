---
name: Paper Trading Adapter
overview: Implement full paper trading adapter for testing execution logic without real capital.
todos:
  - id: paper-state
    content: Implement paper trading state management (balances, positions, orders)
    status: pending
  - id: order-execution
    content: Implement simulated order execution with configurable slippage
    status: pending
  - id: partial-fills
    content: Implement partial fill simulation
    status: pending
  - id: error-simulation
    content: Implement API error and latency simulation
    status: pending
  - id: funding-simulation
    content: Implement funding rate payment simulation
    status: pending
  - id: tests
    content: Add unit tests for paper adapter
    status: pending
  - id: lifecycle-management
    content: Move plan to implemented/ directory after completion (update todos, check validation boxes, update roadmap link, move file, delete from active/)
    status: pending
isProject: false
---

> **Note**: This plan is part of Phase 4 (Simulation) in [MVP Roadmap](../README.md).

# Paper Trading Adapter

## Overview

Implement a full paper trading adapter that implements the `ExchangeAdapter` interface and simulates realistic market conditions. This allows testing execution logic without risking real capital.

Reference: [ADR-0010: Exchange Adapters](../../../../../adrs/0010-exchange-adapters.md), [ADR-0016: Backtesting & Simulation](../../../../../adrs/0016-backtesting-simulation.md)

## Tasks

### 1. Paper Trading State

Create `src/adapters/paper/state.ts`:

```typescript
export interface PaperState {
  balances: Map<string, PaperBalance>;
  positions: Map<string, PaperPosition>;
  orders: Map<string, PaperOrder>;
  fills: PaperFill[];
  prices: Map<string, bigint>;
  fundingRates: Map<string, bigint>;
}

export interface PaperBalance {
  asset: string;
  availableBase: bigint;
  heldBase: bigint;
  totalBase: bigint;
}

export interface PaperPosition {
  symbol: string;
  side: "LONG" | "SHORT";
  sizeBase: bigint;
  entryPriceCents: bigint;
  marginUsedCents: bigint;
  unrealizedPnLCents: bigint;
  liquidationPriceCents: bigint;
}

export interface PaperOrder {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT";
  quantity: bigint;
  price?: bigint;
  status: "PENDING" | "FILLED" | "PARTIALLY_FILLED" | "CANCELLED";
  filledQuantity: bigint;
  createdAt: Date;
}

export const createPaperState = (
  initialBalances: Record<string, bigint>,
): PaperState => {
  const balances = new Map<string, PaperBalance>();
  
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
    prices: new Map(),
    fundingRates: new Map(),
  };
};
```

### 2. Order Execution Simulation

Create `src/adapters/paper/execution.ts`:

```typescript
export interface SimulationConfig {
  baseSlippageBps: bigint;
  slippageVolatilityBps: bigint;
  fillProbability: number; // 0.0 - 1.0
  partialFillProbability: number;
  latencyMs: { min: number; max: number };
  errorRate: number; // 0.0 - 1.0
}

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  baseSlippageBps: 10n,
  slippageVolatilityBps: 5n,
  fillProbability: 0.99,
  partialFillProbability: 0.1,
  latencyMs: { min: 50, max: 200 },
  errorRate: 0.01,
};

export const simulateMarketOrder = async (
  state: PaperState,
  order: PaperOrder,
  config: SimulationConfig,
): Promise<OrderResult> => {
  // 1. Simulate latency
  const latency = config.latencyMs.min + 
    Math.random() * (config.latencyMs.max - config.latencyMs.min);
  await sleep(latency);

  // 2. Check for simulated error
  if (Math.random() < config.errorRate) {
    throw new ExchangeError("EXCHANGE_ERROR", "Simulated API error");
  }

  // 3. Get price with slippage
  const basePrice = state.prices.get(order.symbol) ?? 0n;
  const slippage = calculateRandomSlippage(config);
  const fillPrice = order.side === "BUY"
    ? basePrice + (basePrice * slippage) / 10000n
    : basePrice - (basePrice * slippage) / 10000n;

  // 4. Determine fill amount
  const fillAmount = Math.random() < config.partialFillProbability
    ? (order.quantity * BigInt(Math.floor(Math.random() * 50 + 50))) / 100n
    : order.quantity;

  // 5. Update balances and position
  updateBalancesFromFill(state, order, fillPrice, fillAmount);
  updatePositionFromFill(state, order, fillPrice, fillAmount);

  // 6. Record fill
  const fill: PaperFill = {
    id: `fill-${Date.now()}`,
    orderId: order.id,
    quantity: fillAmount,
    price: fillPrice,
    timestamp: new Date(),
  };
  state.fills.push(fill);

  return {
    orderId: order.id,
    status: fillAmount === order.quantity ? "FILLED" : "PARTIALLY_FILLED",
    filledQuantity: fillAmount,
    averagePrice: fillPrice,
  };
};
```

### 3. Partial Fill Simulation

```typescript
export const simulatePartialFill = (
  order: PaperOrder,
  fillPercentage: number,
): { filledQuantity: bigint; remainingQuantity: bigint } => {
  const fillPct = Math.max(0, Math.min(100, fillPercentage));
  const filledQuantity = (order.quantity * BigInt(Math.floor(fillPct))) / 100n;
  const remainingQuantity = order.quantity - filledQuantity;

  return { filledQuantity, remainingQuantity };
};
```

### 4. Error and Latency Simulation

```typescript
export const simulateLatency = async (config: SimulationConfig): Promise<void> => {
  const latency = config.latencyMs.min + 
    Math.random() * (config.latencyMs.max - config.latencyMs.min);
  await sleep(latency);
};

export const shouldSimulateError = (config: SimulationConfig): boolean => {
  return Math.random() < config.errorRate;
};

export const simulateRateLimitError = (): never => {
  throw new ExchangeError("RATE_LIMITED", "Simulated rate limit");
};

export const simulateTimeoutError = (): never => {
  throw new ExchangeError("TIMEOUT", "Simulated timeout");
};
```

### 5. Funding Rate Payment Simulation

```typescript
export const simulateFundingPayment = (
  state: PaperState,
  symbol: string,
): bigint => {
  const position = state.positions.get(symbol);
  const fundingRate = state.fundingRates.get(symbol) ?? 0n;

  if (!position || position.sizeBase === 0n) {
    return 0n;
  }

  // Funding = position size * funding rate
  // Short position receives funding when rate is positive
  const payment = (position.sizeBase * fundingRate) / 10000n;
  const fundingPnL = position.side === "SHORT" ? payment : -payment;

  // Update USDT balance
  const usdtBalance = state.balances.get("USDT");
  if (usdtBalance) {
    usdtBalance.availableBase += fundingPnL;
    usdtBalance.totalBase += fundingPnL;
  }

  return fundingPnL;
};
```

### 6. Full Paper Adapter

Create `src/adapters/paper/adapter.ts`:

```typescript
export interface PaperAdapterConfig {
  initialBalances: Record<string, bigint>;
  simulation: SimulationConfig;
}

export const createPaperAdapter = (config: PaperAdapterConfig): ExchangeAdapter => {
  const state = createPaperState(config.initialBalances);
  let connected = false;

  return {
    connect: async () => {
      await simulateLatency(config.simulation);
      connected = true;
    },

    disconnect: async () => {
      connected = false;
    },

    isConnected: () => connected,

    getBalance: async (asset) => {
      await simulateLatency(config.simulation);
      return state.balances.get(asset) ?? {
        asset,
        availableBase: 0n,
        heldBase: 0n,
        totalBase: 0n,
      };
    },

    getBalances: async () => {
      await simulateLatency(config.simulation);
      return Array.from(state.balances.values());
    },

    createOrder: async (params) => {
      const order: PaperOrder = {
        id: `paper-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        ...params,
        status: "PENDING",
        filledQuantity: 0n,
        createdAt: new Date(),
      };
      state.orders.set(order.id, order);
      
      return simulateMarketOrder(state, order, config.simulation);
    },

    getPosition: async (symbol) => {
      await simulateLatency(config.simulation);
      return state.positions.get(symbol) ?? null;
    },

    getPositions: async () => {
      await simulateLatency(config.simulation);
      return Array.from(state.positions.values());
    },

    getFundingRate: async (symbol) => {
      await simulateLatency(config.simulation);
      const rate = state.fundingRates.get(symbol) ?? 0n;
      return {
        symbol,
        rateBps: rate,
        nextFundingTime: new Date(Date.now() + 8 * 60 * 60 * 1000),
      };
    },

    getTicker: async (symbol) => {
      await simulateLatency(config.simulation);
      const price = state.prices.get(symbol) ?? 0n;
      return {
        symbol,
        bidPriceQuote: price - 1n,
        askPriceQuote: price + 1n,
        lastPriceQuote: price,
        volume24hBase: 1000000n,
        timestamp: new Date(),
      };
    },

    // Methods for testing: set prices and funding rates
    setPrices: (prices: Record<string, bigint>) => {
      for (const [symbol, price] of Object.entries(prices)) {
        state.prices.set(symbol, price);
      }
    },

    setFundingRates: (rates: Record<string, bigint>) => {
      for (const [symbol, rate] of Object.entries(rates)) {
        state.fundingRates.set(symbol, rate);
      }
    },

    processFunding: () => {
      let totalFunding = 0n;
      for (const symbol of state.positions.keys()) {
        totalFunding += simulateFundingPayment(state, symbol);
      }
      return totalFunding;
    },
  };
};
```

## File Structure

```
src/adapters/paper/
├── types.ts              # Paper adapter types
├── state.ts              # State management
├── state.test.ts
├── execution.ts          # Order execution simulation
├── execution.test.ts
├── funding.ts            # Funding simulation
├── funding.test.ts
├── adapter.ts            # Full adapter implementation
├── adapter.test.ts
└── index.ts              # Re-exports
```

## Dependencies

No new dependencies required.

## Validation

- [ ] Paper adapter implements ExchangeAdapter interface
- [ ] Order execution simulates slippage correctly
- [ ] Partial fills work correctly
- [ ] API errors simulated at configured rate
- [ ] Funding payments calculated correctly
- [ ] Balances and positions updated correctly
- [ ] Unit tests pass

## References

- [MVP Roadmap](../README.md)
- [ADR-0010: Exchange Adapters](../../../../../adrs/0010-exchange-adapters.md)
- [ADR-0016: Backtesting & Simulation](../../../../../adrs/0016-backtesting-simulation.md)
