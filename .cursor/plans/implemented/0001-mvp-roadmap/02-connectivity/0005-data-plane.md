---
name: Data Plane
overview: Implement the data plane for managing WebSocket streams and REST polling to maintain in-memory state.
todos:
  - id: state-store
    content: Implement in-memory state store
    status: pending
  - id: ws-handlers
    content: Implement WebSocket message handlers
    status: pending
  - id: rest-polling
    content: Implement REST polling for periodic data refresh
    status: pending
  - id: state-updates
    content: Implement state update logic with validation
    status: pending
  - id: tests
    content: Add unit tests for data plane
    status: pending
  - id: lifecycle-management
    content: Move plan to implemented/ directory after completion (update todos, check validation boxes, update roadmap link, move file, delete from active/)
    status: pending
isProject: false
---

> **Note**: This plan is part of Phase 2 (Connectivity) in [MVP Roadmap](../../../active/0001-mvp-roadmap/README.md).

# Data Plane

## Overview

Implement the data plane that manages real-time data streams and maintains in-memory state. The data plane receives WebSocket messages (ticker, mark price, order book) and REST polling data (funding rate, account state) to keep the bot's state current.

## Tasks

### 1. In-Memory State Store

Create `src/worker/state.ts`:

```typescript
export interface BotState {
  // Market data
  ticker: TickerState | null;
  orderBook: OrderBookState | null;
  fundingRate: FundingRateState | null;

  // Account data
  balances: Map<string, Balance>;
  positions: Map<string, Position>;
  openOrders: Map<string, Order>;

  // Health tracking
  lastTickerUpdate: Date | null;
  lastFundingUpdate: Date | null;
  lastAccountUpdate: Date | null;
  wsConnected: boolean;
}

export interface StateStore {
  getState(): Readonly<BotState>;
  updateTicker(ticker: TickerState): void;
  updateFundingRate(fundingRate: FundingRateState): void;
  updateBalances(balances: Balance[]): void;
  updatePositions(positions: Position[]): void;
  updateOrders(orders: Order[]): void;
  setWsConnected(connected: boolean): void;
  reset(): void;
}

export const createStateStore = (): StateStore => {
  // Implementation...
};
```

### 2. WebSocket Message Handlers

Create `src/worker/data-plane.ts`:

```typescript
export interface DataPlaneConfig {
  adapter: ExchangeAdapter;
  stateStore: StateStore;
  logger: Logger;
  symbols: string[];
}

export interface DataPlane {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
}

export const createDataPlane = (config: DataPlaneConfig): DataPlane => {
  const handleTickerMessage = (message: TickerMessage): void => {
    const ticker: TickerState = {
      symbol: message.product_id,
      bidPriceQuote: parseDecimalToBigInt(message.best_bid, 8),
      askPriceQuote: parseDecimalToBigInt(message.best_ask, 8),
      lastPriceQuote: parseDecimalToBigInt(message.price, 8),
      volume24hBase: parseDecimalToBigInt(message.volume_24h, 8),
      timestamp: new Date(message.time),
    };

    config.stateStore.updateTicker(ticker);
    config.logger.debug("Ticker updated", { symbol: ticker.symbol });
  };

  // ... other handlers
};
```

### 3. REST Polling

Periodic polling for data not available via WebSocket:

```typescript
const startFundingRatePolling = (intervalMs: number): NodeJS.Timeout => {
  const poll = async (): Promise<void> => {
    try {
      for (const symbol of config.symbols) {
        const fundingRate = await config.adapter.getFundingRate(symbol);
        config.stateStore.updateFundingRate({
          symbol,
          rateBps: fundingRate.rateBps,
          nextFundingTime: fundingRate.nextFundingTime,
          timestamp: new Date(),
        });
      }
    } catch (error) {
      config.logger.error("Funding rate poll failed", error as Error);
    }
  };

  // Poll immediately, then at interval
  void poll();
  return setInterval(() => {
    void poll();
  }, intervalMs);
};

const startAccountPolling = (intervalMs: number): NodeJS.Timeout => {
  const poll = async (): Promise<void> => {
    try {
      const [balances, positions, orders] = await Promise.all([
        config.adapter.getBalances(),
        config.adapter.getPositions(),
        config.adapter.getOpenOrders(),
      ]);

      config.stateStore.updateBalances(balances);
      config.stateStore.updatePositions(positions);
      config.stateStore.updateOrders(orders);
    } catch (error) {
      config.logger.error("Account poll failed", error as Error);
    }
  };

  void poll();
  return setInterval(() => {
    void poll();
  }, intervalMs);
};
```

### 4. State Update Logic

State updates with staleness detection using per-source thresholds:

Create `src/worker/freshness.ts`:

```typescript
import * as v from "valibot";

/**
 * Configuration for state freshness thresholds.
 * Each data source has its own staleness threshold based on update cadence.
 * 
 * - tickerStaleMs: WebSocket ticker updates (continuous)
 * - fundingStaleMs: REST funding rate polls (30s interval per ADR-0001)
 * - accountStaleMs: REST account polls (30s interval per ADR-0001)
 */
export const FreshnessConfigSchema = v.object({
  tickerStaleMs: v.pipe(
    v.number(),
    v.minValue(1000),
    v.maxValue(60000),
  ),
  fundingStaleMs: v.pipe(
    v.number(),
    v.minValue(1000),
    v.maxValue(300000),
  ),
  accountStaleMs: v.pipe(
    v.number(),
    v.minValue(1000),
    v.maxValue(300000),
  ),
});

export type FreshnessConfig = v.InferOutput<typeof FreshnessConfigSchema>;

/**
 * Default freshness thresholds derived from polling cadences.
 * See ADR-0001: Bot Architecture for update intervals.
 */
export const DEFAULT_FRESHNESS_CONFIG: FreshnessConfig = {
  tickerStaleMs: 5_000,      // 5s - WebSocket should be very fresh
  fundingStaleMs: 60_000,    // 60s - 30s REST poll + buffer
  accountStaleMs: 45_000,    // 45s - 30s REST poll + buffer
};

/**
 * Check if state is fresh based on per-source staleness thresholds.
 * Each data source is checked independently with its own threshold.
 */
export const isStateFresh = (
  state: BotState,
  config: FreshnessConfig,
): boolean => {
  const now = Date.now();

  const tickerFresh = state.lastTickerUpdate
    ? now - state.lastTickerUpdate.getTime() < config.tickerStaleMs
    : false;

  const fundingFresh = state.lastFundingUpdate
    ? now - state.lastFundingUpdate.getTime() < config.fundingStaleMs
    : false;

  const accountFresh = state.lastAccountUpdate
    ? now - state.lastAccountUpdate.getTime() < config.accountStaleMs
    : false;

  return tickerFresh && fundingFresh && accountFresh && state.wsConnected;
};
```

## File Structure

```
src/worker/
├── state.ts              # In-memory state store
├── state.test.ts         # State store tests
├── freshness.ts          # Freshness config and staleness detection
├── freshness.test.ts     # Freshness tests
├── data-plane.ts         # Data plane implementation
├── data-plane.test.ts    # Data plane tests
└── index.ts              # Re-exports
```

## Dependencies

```bash
# Already installed
# valibot (for FreshnessConfig validation)
```

## Validation

- [ ] State store updates correctly from WebSocket messages
- [ ] REST polling fetches data at correct intervals
- [ ] FreshnessConfig validated with Valibot schema at startup
- [ ] State freshness detection uses per-source thresholds (no magic multipliers)
- [ ] Stale data is detected and flagged correctly per data source
- [ ] All updates are logged appropriately
- [ ] Unit tests pass

## References

- [MVP Roadmap](../../../active/0001-mvp-roadmap/README.md)
- [ADR-0001: Bot Architecture](../../../../../adrs/0001-bot-architecture.md) — Data plane design
- [ADR-0008: Monitoring & Observability](../../../../../adrs/0008-monitoring-observability.md) — Health status
