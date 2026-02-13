---
name: Adapter Factory
overview: Create factory function for instantiating exchange adapters based on configuration.
todos:
  - id: factory-function
    content: Implement createExchangeAdapter factory function
    status: completed
  - id: config-validation
    content: Add Valibot schemas for adapter configuration
    status: completed
  - id: paper-adapter-stub
    content: Create paper trading adapter stub (full implementation in Phase 4)
    status: completed
  - id: tests
    content: Add unit tests for factory function
    status: completed
  - id: lifecycle-management
    content: Move plan to implemented/ directory after completion (update todos, check validation boxes, update roadmap link, move file, delete from active/)
    status: completed
isProject: false
---

> **Note**: This plan is part of Phase 2 (Connectivity) in [MVP Roadmap](../../../active/0001-mvp/README.md).

# Adapter Factory

## Overview

Create a factory function that instantiates the appropriate exchange adapter based on configuration. This provides a clean abstraction for the rest of the application to use without worrying about exchange-specific details.

## Tasks

### 1. Factory Function

Create `src/adapters/index.ts`:

```typescript
import type { ExchangeAdapter } from "./types";
import { createCoinbaseAdapter } from "./coinbase";
// import { createBinanceAdapter } from "./binance";
// import { createBybitAdapter } from "./bybit";
import { createPaperAdapter } from "./paper";

export type ExchangeType = "coinbase" | "binance" | "bybit" | "paper";

export interface AdapterConfig {
  exchange: ExchangeType;
  apiKey?: string;
  apiSecret?: string;
  testnet?: boolean;
  // Paper trading specific
  initialBalances?: Record<string, bigint>;
}

export const createExchangeAdapter = (config: AdapterConfig): ExchangeAdapter => {
  switch (config.exchange) {
    case "coinbase":
      if (!config.apiKey || !config.apiSecret) {
        throw new Error("Coinbase adapter requires apiKey and apiSecret");
      }
      return createCoinbaseAdapter({
        apiKey: config.apiKey,
        apiSecret: config.apiSecret,
        sandbox: config.testnet ?? false,
      });

    case "binance":
      throw new Error("Binance adapter not yet implemented");

    case "bybit":
      throw new Error("Bybit adapter not yet implemented");

    case "paper":
      return createPaperAdapter({
        initialBalances: config.initialBalances ?? {},
      });

    default:
      throw new Error(`Unknown exchange: ${config.exchange}`);
  }
};
```

### 2. Configuration Validation

Create `src/adapters/config.ts`:

```typescript
import * as v from "valibot";

export const AdapterConfigSchema = v.variant("exchange", [
  // Coinbase config
  v.object({
    exchange: v.literal("coinbase"),
    apiKey: v.pipe(v.string(), v.minLength(1)),
    apiSecret: v.pipe(v.string(), v.minLength(1)),
    testnet: v.optional(v.boolean()),
  }),

  // Binance config
  v.object({
    exchange: v.literal("binance"),
    apiKey: v.pipe(v.string(), v.minLength(1)),
    apiSecret: v.pipe(v.string(), v.minLength(1)),
    testnet: v.optional(v.boolean()),
  }),

  // Bybit config
  v.object({
    exchange: v.literal("bybit"),
    apiKey: v.pipe(v.string(), v.minLength(1)),
    apiSecret: v.pipe(v.string(), v.minLength(1)),
    testnet: v.optional(v.boolean()),
  }),

  // Paper trading config
  v.object({
    exchange: v.literal("paper"),
    initialBalances: v.optional(v.record(v.string(), v.bigint())),
  }),
]);

export type AdapterConfig = v.InferOutput<typeof AdapterConfigSchema>;

export const parseAdapterConfig = (config: unknown): AdapterConfig => {
  return v.parse(AdapterConfigSchema, config);
};
```

### 3. Paper Trading Adapter Stub

Create `src/adapters/paper/adapter.ts`:

```typescript
import type { ExchangeAdapter, Balance, Order, Position } from "../types";

export interface PaperAdapterConfig {
  initialBalances: Record<string, bigint>;
}

export const createPaperAdapter = (config: PaperAdapterConfig): ExchangeAdapter => {
  const balances = new Map<string, Balance>();
  const orders = new Map<string, Order>();
  const positions = new Map<string, Position>();
  let connected = false;

  // Initialize balances
  for (const [asset, amount] of Object.entries(config.initialBalances)) {
    balances.set(asset, {
      asset,
      availableBase: amount,
      heldBase: 0n,
      totalBase: amount,
    });
  }

  return {
    connect: async () => {
      connected = true;
    },
    disconnect: async () => {
      connected = false;
    },
    isConnected: () => connected,

    getBalance: async (asset) => {
      return balances.get(asset) ?? {
        asset,
        availableBase: 0n,
        heldBase: 0n,
        totalBase: 0n,
      };
    },
    getBalances: async () => Array.from(balances.values()),

    // Stub implementations - full implementation in Phase 4
    createOrder: async () => {
      throw new Error("Paper trading createOrder not implemented yet");
    },
    cancelOrder: async () => {
      throw new Error("Paper trading cancelOrder not implemented yet");
    },
    getOrder: async () => null,
    getOpenOrders: async () => [],

    getPosition: async () => null,
    getPositions: async () => [],

    getTicker: async () => {
      throw new Error("Paper trading getTicker not implemented yet");
    },
    getFundingRate: async () => {
      throw new Error("Paper trading getFundingRate not implemented yet");
    },
    getOrderBook: async () => {
      throw new Error("Paper trading getOrderBook not implemented yet");
    },

    subscribeTicker: () => {
      // No-op for paper trading
    },
    unsubscribeTicker: () => {
      // No-op for paper trading
    },
  };
};
```

## File Structure

```
src/adapters/
├── index.ts              # Factory function and re-exports
├── config.ts             # Configuration validation schemas
├── types.ts              # ExchangeAdapter interface
├── errors.ts             # Error types
├── coinbase/             # Coinbase adapter (from 0003-coinbase-adapter)
├── paper/
│   ├── adapter.ts        # Paper trading adapter stub
│   └── index.ts          # Re-exports
└── index.test.ts         # Factory tests
```

## Dependencies

No new dependencies required.

## Validation

- [x] Factory creates correct adapter type
- [x] Configuration validation rejects invalid configs
- [x] Missing required fields throw appropriate errors
- [x] Paper adapter initializes with correct balances
- [x] Unit tests pass

## References

- [MVP Roadmap](../../../active/0001-mvp/README.md)
- [ADR-0010: Exchange Adapters](../../../../../adrs/0010-exchange-adapters.md)
- [ADR-0002: Hexagonal-Inspired Architecture](../../../../../adrs/0002-hexagonal-inspired-architecture.md) — Ports and adapters
