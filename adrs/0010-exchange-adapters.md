# ADR 0010: Exchange Adapter Pattern

- **Status:** Accepted
- **Date:** 2026-02-04
- **Updated:** 2026-02-09
- **Owners:** -
- **Related:**
  - [ADR-0001: Bot Architecture](0001-bot-architecture.md)
  - [ADR-0012: State Machines](0012-state-machines.md)
  - [ADR-0016: Backtesting & Simulation](0016-backtesting-simulation.md)

## Context

The bot needs to:
- Support multiple exchanges (Binance, Bybit, etc.)
- Enable testing with mock/paper trading adapters
- Isolate exchange-specific quirks from core logic
- Handle WebSocket and REST API differences

## Decision

Use the Adapter pattern with a stable interface that hides exchange-specific implementation details.

### 1. Adapter Interface

```typescript
export interface ExchangeAdapter {
  // Market data
  subscribeSpotTicker(symbol: string): AsyncIterable<SpotTicker>;
  subscribePerpTicker(symbol: string): AsyncIterable<PerpTicker>;
  getFunding(symbol: string): Promise<FundingSnapshot>;
  
  // Trading
  placeSpotOrder(params: SpotOrderParams): Promise<OrderResult>;
  placePerpOrder(params: PerpOrderParams): Promise<OrderResult>;
  cancelOrder(orderId: string): Promise<CancelResult>;
  
  // Account state
  getBalances(): Promise<BalanceSnapshot>;
  getPositions(): Promise<PositionSnapshot[]>;
  getOpenOrders(): Promise<Order[]>;
  getFills(since: Date): Promise<Fill[]>;
  
  // Connection management
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
}
```

### 2. File Structure

```
src/adapters/
├── types.ts              # Shared adapter types
├── index.ts              # Factory function exports
├── binance/
│   ├── client.ts         # Raw Binance API client
│   ├── adapter.ts        # ExchangeAdapter implementation
│   ├── schemas.ts        # Valibot schemas for responses
│   ├── normalizers.ts    # Response normalization
│   └── adapter.test.ts
├── bybit/
│   └── ...
└── paper/
    ├── adapter.ts        # Paper trading adapter
    └── adapter.test.ts
```

### 3. Factory Pattern

```typescript
export type Exchange = "binance" | "bybit" | "paper";

export const createExchangeAdapter = (
  exchange: Exchange,
  config: ExchangeConfig,
): ExchangeAdapter => {
  switch (exchange) {
    case "binance":
      return createBinanceAdapter(config);
    case "bybit":
      return createBybitAdapter(config);
    case "paper":
      return createPaperAdapter(config);
    default:
      throw new Error(`Unknown exchange: ${exchange}`);
  }
};
```

### 4. Normalization with Valibot

Always validate and normalize exchange responses to domain types:

```typescript
import * as v from "valibot";

const BinanceFundingSchema = v.object({
  symbol: v.string(),
  lastFundingRate: v.string(),
  nextFundingTime: v.number(),
  predictedFundingRate: v.optional(v.string()),
});

export const normalizeFunding = (response: unknown): FundingSnapshot => {
  const parsed = v.parse(BinanceFundingSchema, response);
  return {
    symbol: parsed.symbol,
    fundingRateBps: parseRateToBps(parsed.lastFundingRate),
    nextFundingTime: new Date(parsed.nextFundingTime),
    timestamp: new Date(),
    source: "binance",
  };
};
```

### 5. Error Handling

```typescript
export class ExchangeError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly exchange: string,
    public readonly cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "ExchangeError";
  }
}
```

### 6. WebSocket + REST Strategy

- **Prefer WS** for real-time ticker/order updates
- **Use REST** as authoritative fallback for reconciliation
- Track connection state and staleness timestamps

### 7. Paper Trading Adapter (Delegating Pattern)

The paper adapter uses a **delegating pattern**: it wraps a real `ExchangeAdapter` (e.g., Coinbase) for market data reads and simulates execution locally. This avoids duplicating market data fetching and ensures paper trades fill against real bid/ask spreads.

```typescript
export interface PaperAdapter extends ExchangeAdapter {
  processFunding(): Promise<bigint>;
  getState(): Readonly<PaperState>;
}

export interface PaperAdapterConfig {
  marketDataSource: ExchangeAdapter; // Real adapter for market data
  initialBalances: Record<string, bigint>;
  simulation?: Partial<SimulationConfig>;
}

export const createPaperAdapter = (config: PaperAdapterConfig): PaperAdapter => {
  const state = createPaperState(config.initialBalances);
  const source = config.marketDataSource;

  return {
    // Market data: delegated to real adapter
    getTicker: (symbol) => source.getTicker(symbol),
    getFundingRate: (symbol) => source.getFundingRate(symbol),
    getOrderBook: (symbol, depth) => source.getOrderBook(symbol, depth),
    subscribeTicker: (symbol, cb) => source.subscribeTicker(symbol, cb),
    unsubscribeTicker: (symbol) => source.unsubscribeTicker(symbol),

    // Execution: simulated locally with slippage
    createOrder: async (params) => {
      const ticker = await source.getTicker(params.symbol);
      return simulateMarketOrder(state, params, ticker, simulation);
    },

    // Balances & positions: tracked in memory
    getBalance: async (asset) => state.balances.get(asset) ?? zeroBalance(asset),
    getPositions: async () => Array.from(state.positions.values()),
    // ... other methods
  };
};
```

The `marketDataSource` slot is pluggable, supporting three modes:
- **Live paper trading**: `marketDataSource` = real Coinbase adapter
- **Backtesting**: `marketDataSource` = ReplayAdapter serving historical data (see [ADR-0016](0016-backtesting-simulation.md))
- **Unit testing**: `marketDataSource` = mock adapter with `vi.fn()` stubs

### 8. Official SDK Usage

When official SDKs are available (e.g., Coinbase, Binance), prefer using them over custom implementations:

- **Authentication**: SDKs handle complex auth (ES256 JWT, HMAC-SHA256) correctly
- **Maintenance**: SDK updates track API changes, reducing drift risk
- **Classes allowed**: Third-party SDK classes are acceptable per CODE_GUIDELINES.md (type casts allowed for untyped 3rd party libraries)

Wrap SDKs with factory functions to:
1. Integrate with rate limiting infrastructure (`createRequestPolicy`)
2. Add Valibot validation at boundaries (catch API drift)
3. Normalize to domain types (SDK types → `ExchangeAdapter` types)

**Example** (Coinbase):

```typescript
import { CoinbaseAdvTradeClient, CoinbaseAdvTradeCredentials } from "@coinbase-sample/advanced-trade-sdk-ts";

export const createCoinbaseAdapter = (config: Config): ExchangeAdapter => {
  // SDK classes instantiated inside factory
  const credentials = new CoinbaseAdvTradeCredentials(config.apiKey, config.apiSecret);
  const client = new CoinbaseAdvTradeClient(credentials);
  
  // Rate limiting from existing infrastructure
  const policy = createRequestPolicy({
    exchange: "coinbase",
    rateLimits: COINBASE_RATE_LIMITS,
  });

  return {
    getFundingRate: async (symbol) => {
      const result = await policy.execute(
        () => publicService.getProduct({ productId: symbol }),
        { endpoint: `/market/products/${symbol}` },
      );
      return normalizeFundingRate(result); // Valibot validation + normalization
    },
    // ... other methods
  };
};
```

## Consequences

### Positive
- Exchange logic isolated from core strategy/risk engines
- Easy to add new exchanges without changing core code
- Testable with mock/paper adapters
- Consistent interface regardless of exchange quirks

### Negative
- Additional abstraction layer
- Need to maintain normalizers for each exchange
- May not expose all exchange-specific features

### Risks
- **API changes**: Mitigated by Valibot validation catching unexpected responses
- **Rate limiting**: Each adapter must implement rate limiting for its exchange

## References
- [ADR-0001: Bot Architecture](0001-bot-architecture.md) for how adapters fit in the system
- Binance API Documentation
- Bybit API Documentation
