---
name: Exchange Adapter Interface
overview: Define the core ExchangeAdapter interface and shared types per ADR-0010 (Exchange Adapters).
todos:
  - id: adapter-interface
    content: Define ExchangeAdapter interface with all required methods
    status: completed
  - id: shared-types
    content: Define shared types (Order, Fill, Position, Balance, etc.)
    status: completed
  - id: error-types
    content: Define ExchangeError class and error handling patterns
    status: completed
  - id: tests
    content: Add unit tests for type guards and validation
    status: completed
  - id: lifecycle-management
    content: Move plan to implemented/ directory after completion (update todos, check validation boxes, update roadmap link, move file, delete from active/)
    status: completed
isProject: false
---

> **Note**: This plan is part of Phase 2 (Connectivity) in [MVP Roadmap](../../active/0001-mvp-roadmap/README.md).

# Exchange Adapter Interface

## Overview

Define the core `ExchangeAdapter` interface that all exchange implementations must follow. This provides a unified API for interacting with different exchanges (Coinbase, Binance, Bybit, Paper Trading) while abstracting away exchange-specific details.

## Tasks

### 1. Define ExchangeAdapter Interface

Create `src/adapters/types.ts` with the core interface:

```typescript
export interface ExchangeAdapter {
  // Connection management
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Account
  getBalance(asset: string): Promise<Balance>;
  getBalances(): Promise<Balance[]>;

  // Orders
  createOrder(params: CreateOrderParams): Promise<Order>;
  cancelOrder(orderId: string): Promise<void>;
  getOrder(orderId: string): Promise<Order | null>;
  getOpenOrders(symbol?: string): Promise<Order[]>;

  // Positions (for perpetuals)
  getPosition(symbol: string): Promise<Position | null>;
  getPositions(): Promise<Position[]>;

  // Market data
  getTicker(symbol: string): Promise<Ticker>;
  getFundingRate(symbol: string): Promise<FundingRate>;
  getOrderBook(symbol: string, depth?: number): Promise<OrderBook>;

  // WebSocket subscriptions
  subscribeTicker(symbol: string, callback: TickerCallback): void;
  unsubscribeTicker(symbol: string): void;
}
```

### 2. Define Shared Types

Define domain types that normalize exchange-specific responses:

```typescript
// Financial amounts use bigint (see CODE_GUIDELINES.md)
export interface Balance {
  asset: string;
  availableBase: bigint; // Available balance in base units
  heldBase: bigint;      // Held in orders
  totalBase: bigint;     // Total balance
}

export interface Order {
  id: string;
  exchangeOrderId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  quantityBase: bigint;
  filledQuantityBase: bigint;
  priceQuote: bigint | null;  // null for market orders
  avgFillPriceQuote: bigint | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Position {
  symbol: string;
  side: PositionSide;
  sizeBase: bigint;
  entryPriceQuote: bigint;
  markPriceQuote: bigint;
  liquidationPriceQuote: bigint | null;
  unrealizedPnlQuote: bigint;
  leverageBps: bigint;
  marginQuote: bigint;
}
```

### 3. Define Error Types

Create `src/adapters/errors.ts`:

```typescript
export class ExchangeError extends Error {
  constructor(
    message: string,
    public readonly code: ExchangeErrorCode,
    public readonly exchange: string,
    public readonly cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "ExchangeError";
  }
}

export type ExchangeErrorCode =
  | "AUTHENTICATION_FAILED"
  | "RATE_LIMITED"
  | "INSUFFICIENT_BALANCE"
  | "ORDER_NOT_FOUND"
  | "INVALID_ORDER"
  | "NETWORK_ERROR"
  | "UNKNOWN";
```

## File Structure

```
src/adapters/
├── types.ts          # ExchangeAdapter interface and domain types
├── errors.ts         # ExchangeError class and error codes
├── index.ts          # Re-exports
└── types.test.ts     # Type guard tests
```

## Dependencies

No new dependencies required. Uses existing:
- `valibot` for validation schemas

## Validation

- [x] ExchangeAdapter interface is complete and documented
- [x] All domain types use bigint for financial amounts
- [x] Error types cover common exchange error scenarios
- [x] Type guards work correctly (using Valibot schemas)
- [x] Unit tests pass

## References

- [MVP Roadmap](../../active/0001-mvp-roadmap/README.md)
- [ADR-0010: Exchange Adapters](../../../../adrs/0010-exchange-adapters.md)
- [ADR-0002: Hexagonal-Inspired Architecture](../../../../adrs/0002-hexagonal-inspired-architecture.md)
- [CODE_GUIDELINES.md](../../../../CODE_GUIDELINES.md) — BigInt for financial math
