---
name: Coinbase Advanced Trade Adapter
overview: Implement Coinbase Advanced Trade API adapter using official SDK with thin wrapper for rate limiting and domain normalization.
todos:
  - id: install-sdk
    content: Install @coinbase-sample/advanced-trade-sdk-ts dependency
    status: completed
  - id: update-adr
    content: Update ADR-0010 to document SDK usage decision (classes allowed for official SDKs)
    status: completed
  - id: valibot-schemas
    content: Create Valibot schemas for Coinbase API response validation
    status: completed
  - id: normalizers
    content: Create normalizers for SDK types to domain types with Valibot validation
    status: completed
  - id: adapter-impl
    content: Implement ExchangeAdapter interface wrapping SDK with rate limiting
    status: completed
  - id: env-config
    content: Add Coinbase environment variables to env schema and .env.example
    status: completed
  - id: tests
    content: Add unit tests for normalizers and adapter
    status: completed
  - id: lifecycle-management
    content: Move plan to implemented/ directory after completion
    status: completed
  - id: lifecycle-management
    content: Move plan to implemented/ directory after completion
    status: pending
isProject: false
---

> **Note**: This plan is part of Phase 2 (Connectivity) in [MVP Roadmap](../../../active/0001-mvp/README.md).

# Coinbase Advanced Trade Adapter

## Overview

Implement a Coinbase Advanced Trade API adapter using the official SDK (`@coinbase-sample/advanced-trade-sdk-ts`) with a thin wrapper that integrates with our rate limiting infrastructure and normalizes responses to domain types with Valibot validation.

## Decision: Official SDK vs Custom Implementation

After evaluation, we chose to use the official Coinbase SDK because:

1. **Authentication complexity**: Coinbase uses ES256 (ECDSA) JWT tokens, not HMAC-SHA256. The SDK handles this correctly.
2. **Maintained by Coinbase**: Reduces drift risk as API evolves
3. **Battle-tested**: Authentication and API patterns already working
4. **Time savings**: Focus on integration rather than reimplementing HTTP client

**Trade-off**: The SDK uses classes, but CODE_GUIDELINES.md allows this for third-party libraries. We wrap it with our own factory function.

---

## Implementation Context

### Code Patterns to Follow

**Factory pattern** (from `src/lib/rate-limiter/request-policy.ts`):

```typescript
export const createCoinbaseAdapter = (config: CoinbaseAdapterConfig): ExchangeAdapter => {
  // SDK classes instantiated inside factory
  const credentials = new CoinbaseAdvTradeCredentials(config.apiKey, config.apiSecret);
  const client = new CoinbaseAdvTradeClient(credentials);
  
  // Rate limiting from existing infrastructure
  const policy = createRequestPolicy({
    exchange: "coinbase",
    rateLimits: COINBASE_RATE_LIMITS,
  });

  return {
    // Methods wrap SDK calls with rate limiting + normalization
  };
};
```

**Normalization pattern** (from ADR-0010):

```typescript
export const normalizeFundingRate = (product: unknown): FundingRate => {
  const parsed = v.parse(CoinbaseProductSchema, product);
  const perpetualDetails = parsed.futureProductDetails?.perpetualDetails;
  
  return {
    symbol: parsed.productId,
    rateBps: perpetualDetails?.fundingRate 
      ? parseRateToBps(perpetualDetails.fundingRate) 
      : 0n,
    nextFundingTime: perpetualDetails?.fundingTime 
      ? new Date(perpetualDetails.fundingTime) 
      : new Date(),
    timestamp: new Date(),
  };
};
```

### Relevant Types

From `src/adapters/types.ts`:
- `ExchangeAdapter` - Interface to implement (lines 250-278)
- `FundingRate` - Domain type with `rateBps: bigint` (lines 90-95)
- `Ticker`, `Balance`, `Order`, `Position` - Other domain types
- `fundingRateSchema` - Valibot schema (lines 197-202)

From `src/adapters/coinbase/rate-limits.ts`:
- `COINBASE_RATE_LIMITS` - Already configured

From `src/lib/rate-limiter/request-policy.ts`:
- `createRequestPolicy` - Unified rate limiting wrapper

### File Locations

```
src/adapters/coinbase/
├── rate-limits.ts          # EXISTS - Rate limit config
├── index.ts                # EXISTS - Re-exports (update)
├── schemas.ts              # NEW - Valibot schemas for SDK responses
├── normalizers.ts          # NEW - SDK types → domain types
├── normalizers.test.ts     # NEW - Normalizer tests
├── adapter.ts              # NEW - ExchangeAdapter implementation
└── adapter.test.ts         # NEW - Adapter tests
```

### Test Patterns

From existing tests in codebase:

```typescript
describe("normalizeFundingRate", () => {
  it("should convert funding rate string to basis points", () => {
    const sdkResponse = {
      productId: "BTC-PERP",
      futureProductDetails: {
        perpetualDetails: {
          fundingRate: "0.0001",  // 0.01% = 1 bps
          fundingTime: "2026-02-04T08:00:00Z",
        },
      },
    };

    const result = normalizeFundingRate(sdkResponse);

    expect(result.symbol).toBe("BTC-PERP");
    expect(result.rateBps).toBe(1n);
  });

  it("should throw on invalid response", () => {
    expect(() => normalizeFundingRate({})).toThrow();
  });
});
```

### Error Handling

Use existing `ExchangeError` from `src/adapters/errors.ts`:

```typescript
try {
  const product = await publicService.getProduct({ productId: symbol });
  return normalizeFundingRate(product);
} catch (error) {
  throw new ExchangeError(
    `Failed to fetch funding rate for ${symbol}`,
    "NETWORK_ERROR",
    "coinbase",
    error,
  );
}
```

---

## Tasks

### 1. Install SDK

```bash
pnpm add @coinbase-sample/advanced-trade-sdk-ts
```

### 2. Update ADR-0010

Add section documenting decision to allow official SDK classes:

```markdown
### 8. Official SDK Usage

When official SDKs are available (e.g., Coinbase, Binance), prefer using them over custom implementations:

- **Authentication**: SDKs handle complex auth (ES256 JWT, HMAC-SHA256) correctly
- **Maintenance**: SDK updates track API changes
- **Classes allowed**: Third-party SDK classes are acceptable per CODE_GUIDELINES.md

Wrap SDKs with factory functions to:
1. Integrate with rate limiting infrastructure
2. Add Valibot validation at boundaries
3. Normalize to domain types
```

### 3. Create Valibot Schemas

`src/adapters/coinbase/schemas.ts`:

```typescript
import * as v from "valibot";

/** Schema for Coinbase perpetual product details */
export const CoinbasePerpetualDetailsSchema = v.object({
  fundingRate: v.optional(v.string()),
  fundingTime: v.optional(v.string()),
  openInterest: v.optional(v.string()),
  maxLeverage: v.optional(v.string()),
});

/** Schema for Coinbase product response */
export const CoinbaseProductSchema = v.object({
  productId: v.string(),
  price: v.optional(v.string()),
  pricePercentageChange24h: v.optional(v.string()),
  volume24h: v.optional(v.string()),
  futureProductDetails: v.optional(v.object({
    perpetualDetails: v.optional(CoinbasePerpetualDetailsSchema),
  })),
});

/** Schema for Coinbase account */
export const CoinbaseAccountSchema = v.object({
  uuid: v.string(),
  name: v.string(),
  currency: v.string(),
  availableBalance: v.object({
    value: v.string(),
    currency: v.string(),
  }),
  hold: v.optional(v.object({
    value: v.string(),
    currency: v.string(),
  })),
});
```

### 4. Create Normalizers

`src/adapters/coinbase/normalizers.ts`:

```typescript
import * as v from "valibot";
import type { FundingRate, Balance, Ticker } from "../types";
import { CoinbaseProductSchema, CoinbaseAccountSchema } from "./schemas";

/** Parse decimal string to bigint basis points (1 bps = 0.0001 = 0.01%) */
export const parseRateToBps = (rate: string): bigint => {
  const decimal = parseFloat(rate);
  return BigInt(Math.round(decimal * 10000)); // 0.0001 → 1n
};

/** Parse decimal string to bigint with given scale */
export const parseDecimalToBigInt = (value: string, decimals: number): bigint => {
  const [whole, frac = ""] = value.split(".");
  const paddedFrac = frac.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole + paddedFrac);
};

export const normalizeFundingRate = (response: unknown): FundingRate => {
  const parsed = v.parse(CoinbaseProductSchema, response);
  const perpetualDetails = parsed.futureProductDetails?.perpetualDetails;

  return {
    symbol: parsed.productId,
    rateBps: perpetualDetails?.fundingRate
      ? parseRateToBps(perpetualDetails.fundingRate)
      : 0n,
    nextFundingTime: perpetualDetails?.fundingTime
      ? new Date(perpetualDetails.fundingTime)
      : new Date(),
    timestamp: new Date(),
  };
};

export const normalizeBalance = (response: unknown): Balance => {
  const parsed = v.parse(CoinbaseAccountSchema, response);
  const available = parseDecimalToBigInt(parsed.availableBalance.value, 8);
  const held = parsed.hold ? parseDecimalToBigInt(parsed.hold.value, 8) : 0n;

  return {
    asset: parsed.currency,
    availableBase: available,
    heldBase: held,
    totalBase: available + held,
  };
};
```

### 5. Implement Adapter

`src/adapters/coinbase/adapter.ts`:

```typescript
import {
  CoinbaseAdvTradeClient,
  CoinbaseAdvTradeCredentials,
  PublicService,
  AccountsService,
} from "@coinbase-sample/advanced-trade-sdk-ts";

import type { ExchangeAdapter, FundingRate, Balance, Ticker } from "../types";
import { ExchangeError } from "../errors";
import { createRequestPolicy } from "@/lib/rate-limiter";
import { COINBASE_RATE_LIMITS } from "./rate-limits";
import { normalizeFundingRate, normalizeBalance } from "./normalizers";

export interface CoinbaseAdapterConfig {
  apiKey: string;
  apiSecret: string;
}

export const createCoinbaseAdapter = (config: CoinbaseAdapterConfig): ExchangeAdapter => {
  const credentials = new CoinbaseAdvTradeCredentials(config.apiKey, config.apiSecret);
  const client = new CoinbaseAdvTradeClient(credentials);
  const publicService = new PublicService(client);
  const accountsService = new AccountsService(client);

  const policy = createRequestPolicy({
    exchange: "coinbase",
    rateLimits: COINBASE_RATE_LIMITS,
  });

  let connected = false;

  return {
    connect: async () => {
      // Verify credentials with a lightweight request
      await policy.execute(
        () => publicService.getServerTime({}),
        { endpoint: "/time" },
      );
      connected = true;
    },

    disconnect: async () => {
      connected = false;
    },

    isConnected: () => connected,

    getFundingRate: async (symbol: string): Promise<FundingRate> => {
      try {
        const result = await policy.execute(
          () => publicService.getProduct({ productId: symbol }),
          { endpoint: `/market/products/${symbol}` },
        );
        return normalizeFundingRate(result);
      } catch (error) {
        throw new ExchangeError(
          `Failed to fetch funding rate for ${symbol}`,
          "NETWORK_ERROR",
          "coinbase",
          error,
        );
      }
    },

    getBalances: async (): Promise<Balance[]> => {
      try {
        const result = await policy.execute(
          () => accountsService.listAccounts({}),
          { endpoint: "/accounts" },
        );
        return (result.accounts ?? []).map(normalizeBalance);
      } catch (error) {
        throw new ExchangeError(
          "Failed to fetch balances",
          "NETWORK_ERROR",
          "coinbase",
          error,
        );
      }
    },

    // MVP: Stub remaining methods - implement as needed
    getBalance: async (asset: string) => {
      const balances = await this.getBalances();
      const balance = balances.find((b) => b.asset === asset);
      if (!balance) {
        throw new ExchangeError(`Balance not found for ${asset}`, "UNKNOWN", "coinbase");
      }
      return balance;
    },

    getTicker: async (_symbol: string) => {
      throw new ExchangeError("Not implemented", "UNKNOWN", "coinbase");
    },

    getOrderBook: async (_symbol: string, _depth?: number) => {
      throw new ExchangeError("Not implemented", "UNKNOWN", "coinbase");
    },

    createOrder: async (_params) => {
      throw new ExchangeError("Not implemented", "UNKNOWN", "coinbase");
    },

    cancelOrder: async (_orderId: string) => {
      throw new ExchangeError("Not implemented", "UNKNOWN", "coinbase");
    },

    getOrder: async (_orderId: string) => {
      throw new ExchangeError("Not implemented", "UNKNOWN", "coinbase");
    },

    getOpenOrders: async (_symbol?: string) => {
      throw new ExchangeError("Not implemented", "UNKNOWN", "coinbase");
    },

    getPosition: async (_symbol: string) => {
      throw new ExchangeError("Not implemented", "UNKNOWN", "coinbase");
    },

    getPositions: async () => {
      throw new ExchangeError("Not implemented", "UNKNOWN", "coinbase");
    },

    subscribeTicker: (_symbol: string, _callback) => {
      // MVP: No WebSocket implementation yet
    },

    unsubscribeTicker: (_symbol: string) => {
      // MVP: No WebSocket implementation yet
    },
  };
};
```

### 6. Update Environment Config

Add to `src/lib/env/env.ts`:

```typescript
COINBASE_API_KEY: v.optional(v.string()),
COINBASE_API_SECRET: v.optional(v.string()),
```

Add to `.env.example`:

```bash
# Coinbase Advanced Trade API (CDP API Keys)
# Get keys from: https://portal.cdp.coinbase.com/
COINBASE_API_KEY=
COINBASE_API_SECRET=
```

### 7. Tests

`src/adapters/coinbase/normalizers.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { normalizeFundingRate, parseRateToBps, parseDecimalToBigInt } from "./normalizers";

describe("parseRateToBps", () => {
  it("should convert decimal rate to basis points", () => {
    expect(parseRateToBps("0.0001")).toBe(1n);   // 0.01% = 1 bps
    expect(parseRateToBps("0.001")).toBe(10n);   // 0.1% = 10 bps
    expect(parseRateToBps("0.01")).toBe(100n);   // 1% = 100 bps
    expect(parseRateToBps("-0.0005")).toBe(-5n); // -0.05% = -5 bps
  });
});

describe("normalizeFundingRate", () => {
  it("should normalize product response to FundingRate", () => {
    const response = {
      productId: "BTC-PERP",
      futureProductDetails: {
        perpetualDetails: {
          fundingRate: "0.0003",
          fundingTime: "2026-02-04T08:00:00.000Z",
        },
      },
    };

    const result = normalizeFundingRate(response);

    expect(result.symbol).toBe("BTC-PERP");
    expect(result.rateBps).toBe(3n);
    expect(result.nextFundingTime).toBeInstanceOf(Date);
  });

  it("should handle missing perpetual details", () => {
    const response = { productId: "BTC-USD" };

    const result = normalizeFundingRate(response);

    expect(result.symbol).toBe("BTC-USD");
    expect(result.rateBps).toBe(0n);
  });

  it("should throw on invalid response", () => {
    expect(() => normalizeFundingRate(null)).toThrow();
    expect(() => normalizeFundingRate({})).toThrow();
  });
});
```

---

## File Structure

```
src/adapters/coinbase/
├── rate-limits.ts          # EXISTS
├── index.ts                # UPDATE - Add adapter export
├── schemas.ts              # NEW
├── normalizers.ts          # NEW
├── normalizers.test.ts     # NEW
├── adapter.ts              # NEW
└── adapter.test.ts         # NEW
```

## Dependencies

```bash
pnpm add @coinbase-sample/advanced-trade-sdk-ts
```

## Validation

- [x] SDK installed and importable
- [x] ADR-0010 updated with SDK usage decision
- [x] Valibot schemas validate real API responses
- [x] Normalizers convert SDK types to domain types
- [x] Adapter integrates with rate limiter
- [x] `getFundingRate` returns valid `FundingRate`
- [x] `getBalances` returns valid `Balance[]`
- [x] Environment variables documented
- [x] Unit tests pass (`pnpm test:run`)
- [x] Type checking passes (`pnpm typecheck`)
- [x] Linting passes (`pnpm lint`)

## Follow-up Work (Out of Scope)

- WebSocket client for real-time tickers
- Order management (createOrder, cancelOrder)
- Position management for perpetuals
- Integration tests against Coinbase sandbox

## References

- [MVP Roadmap](../../../active/0001-mvp/README.md)
- [ADR-0010: Exchange Adapters](../../../../../adrs/0010-exchange-adapters.md)
- [Coinbase Advanced Trade SDK](https://github.com/coinbase-samples/advanced-sdk-ts)
- [Coinbase Advanced Trade API](https://docs.cdp.coinbase.com/advanced-trade/docs/welcome)
- [Coinbase API Authentication](https://docs.cdp.coinbase.com/advanced-trade/docs/rest-api-auth) (ES256 JWT)
