# Code Guidelines

## Table of Contents

1. [General Principles](#1-general-principles)
2. [Naming Conventions](#2-naming-conventions)
3. [TypeScript Practices](#3-typescript-practices)
4. [Financial Math with BigInt](#4-financial-math-with-bigint)
5. [Validation with Valibot](#5-validation-with-valibot)
6. [Error Handling](#6-error-handling)
7. [Testing](#7-testing)
8. [Architecture Decision Records](#8-architecture-decision-records)

---

## 1. General Principles

1. **Safety First**: Prioritize correctness over cleverness
2. **Deterministic**: Logic should be testable and reproducible
3. **Auditable**: Every action should be traceable
4. **ADR-Driven**: Check `adrs/` for architectural decisions before implementing features

---

## 2. Naming Conventions

### Files and Directories

| Type | Convention | Example |
|------|------------|---------|
| Modules | kebab-case | `order-service.ts`, `risk-engine.ts` |
| Test files | `*.test.ts` | `order-service.test.ts` |
| Type files | kebab-case | `types.ts`, `schemas.ts` |
| Directories | kebab-case | `lib/`, `utils/` |

### Code

| Type | Convention | Example |
|------|------------|---------|
| Functions | camelCase + verb | `calculateFee`, `getUser` |
| Variables | camelCase | `fundingRate`, `spotPrice` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_RETRIES`, `DEFAULT_TIMEOUT_MS` |
| Types | PascalCase | `OrderStatus`, `UserConfig` |
| BigInt amounts | camelCase + unit suffix | `notionalCents`, `priceSats`, `rateBps` |
| Records | `<plural>By<Key>` | `ordersById`, `usersByEmail` |

### Function Prefixes

| Prefix | Use Case | Example |
|--------|----------|---------|
| `get*` | Retrieve data | `getUser`, `getBalance` |
| `calculate*` | Pure deterministic math | `calculateFee`, `calculateTotal` |
| `check*` | Return boolean | `checkIsValid`, `checkHasPermission` |
| `parse*` | Parse serialized data | `parseResponse`, `parseConfig` |
| `create*` | Construct new values | `createOrder`, `createClient` |
| `is*` | Type guards only | `isError`, `isValidOrder` |

---

## 3. TypeScript Practices

### Arrow Functions (Required)

**ALWAYS use `const` arrow functions** instead of `function` declarations:

```typescript
// ✅ Good
const calculateTotal = (items: Item[]): bigint =>
  items.reduce((sum, item) => sum + item.amount, 0n);

// ❌ Bad
function calculateTotal(items: Item[]): bigint {
  return items.reduce((sum, item) => sum + item.amount, 0n);
}
```

### Functional Programming Preference

- **Factory functions over classes**: `createClient(config)` not `new Client(config)`
- **Pure functions**: Minimize side effects, pass dependencies as arguments
- **Immutable data**: Avoid mutating objects; use spread syntax

### Never Use `any`

```typescript
// ✅ Good: Use unknown with validation
const parseResponse = (data: unknown): Order => v.parse(OrderSchema, data);

// ❌ Bad: any disables type checking
const parseResponse = (data: any): Order => data;
```

### Avoid Type Casts

**NEVER use `as Type` casting unless absolutely necessary (e.g., interacting with untyped 3rd party libraries).**

Instead, use:
1. **Valibot Validation**: Validate data at the boundary
2. **Type Guards**: Check types at runtime
3. **Type Inference**: Let TypeScript infer the type

```typescript
// ✅ Good: Valibot validation
const order = v.parse(OrderSchema, response);

// ✅ Good: Type guard
if (isErrorResponse(response)) {
  throw new ApiError(response.message);
}

// ❌ Bad: Type cast
const order = response as Order;

// ❌ Bad: Casting environment variables
const level = process.env.LOG_LEVEL as LogLevel; // Unsafe!
```

### Explicit Return Types for Exports

```typescript
// ✅ Good
export const formatAmount = (cents: bigint): string => {
  return `$${(cents / 100n).toString()}`;
};

// ❌ Bad: Inferred return type
export const formatAmount = (cents: bigint) => {
  return `$${(cents / 100n).toString()}`;
};
```

### Import Statements - No File Extensions

**NEVER use `.js` extensions in import statements.** TypeScript will resolve the correct files automatically.

```typescript
// ✅ Good: No extension
import { createClient } from "./client";
import type { Config } from "./types";
export { ExchangeError } from "./errors";

// ❌ Bad: .js extension
import { createClient } from "./client.js";
import type { Config } from "./types.js";
export { ExchangeError } from "./errors.js";
```

**Rationale:**
- TypeScript's module resolution handles file extensions automatically
- Keeps imports consistent with source file extensions (`.ts`)
- Reduces confusion between source (`.ts`) and compiled (`.js`) files
- Works correctly with `moduleResolution: "bundler"` in tsconfig.json

---

## 4. Financial Math with BigInt

### Core Principle

**ALWAYS use native `bigint` for monetary calculations.** Store amounts in smallest units (cents, satoshis, etc.).

### Unit Conventions

| Unit | Scale | Example |
|------|-------|---------|
| Cents | 10² | `$50,000.00` → `5000000n` |
| Satoshis | 10⁸ | `1 BTC` → `100000000n` |
| Basis Points (bps) | 10⁴ | `1%` → `100n`, `0.01%` → `1n` |

### Variable Naming with Units

```typescript
// ✅ Good: Unit suffix makes scale explicit
const notionalCents = 5000000n;      // $50,000.00
const priceSats = 5000000000000n;    // Price in satoshis
const fundingRateBps = 10n;          // 0.10% = 10 basis points
const leverageBps = 10000n;          // 1x leverage = 10000 bps

// ❌ Bad: Ambiguous scale
const notional = 50000;
const fundingRate = 0.001;
```

### Arithmetic Operations

```typescript
// ✅ Good: All operations in bigint
const feeCents = (notionalCents * feeRateBps) / 10000n;
const leverageBps = (notionalCents * 10000n) / equityCents;

// ❌ Bad: Mixing bigint and number
const fee = Number(notionalCents) * feeRate; // Precision loss!
```

### Formatting for Display

```typescript
export const formatCents = (cents: bigint): string => {
  const dollars = cents / 100n;
  const remainder = (cents % 100n).toString().padStart(2, "0");
  return `$${dollars.toLocaleString()}.${remainder}`;
};
```

### Parsing from Strings

```typescript
export const parseDecimalToBigInt = (s: string, scale: number): bigint => {
  const [whole, frac = ""] = s.split(".");
  const paddedFrac = frac.padEnd(scale, "0").slice(0, scale);
  return BigInt(whole + paddedFrac);
};
```

---

## 5. Validation with Valibot

### Core Principle

**ALWAYS use Valibot for type validation.** If you need to validate types at runtime, use Valibot schemas instead of manual type guards or type assertions.

```typescript
// ✅ Good: Use Valibot for validation
export const orderSchema = v.object({
  id: v.string(),
  quantityBase: bigintSchema,
  priceQuote: v.nullable(bigintSchema),
});

export const isOrder = (value: unknown): value is Order =>
  v.is(orderSchema, value);

// ❌ Bad: Manual type guard without Valibot
export const isOrder = (value: unknown): value is Order => {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj["id"] === "string" && typeof obj["quantityBase"] === "bigint";
};

// ❌ Bad: Type assertion without validation
const order = response as Order;
```

### Import Convention

```typescript
// ✅ Good: Namespace import
import * as v from "valibot";

// ❌ Bad: Named imports
import { object, string, parse } from "valibot";
```

### Schema Definition

```typescript
import * as v from "valibot";

export const ConfigSchema = v.object({
  maxRetries: v.pipe(v.number(), v.minValue(0), v.maxValue(5)),
  timeout: v.pipe(v.number(), v.minValue(1000)),
  enabled: v.boolean(),
});

export type Config = v.InferOutput<typeof ConfigSchema>;
```

### Type Guards

**Always use Valibot's `v.is()` for type guards:**

```typescript
export const isValidConfig = (data: unknown): data is Config =>
  v.is(ConfigSchema, data);
```

### Custom Validators

For types not natively supported by Valibot (e.g., `bigint`, `Date`), use `v.custom()`:

```typescript
const bigintSchema = v.custom<bigint>(
  (input) => typeof input === "bigint",
  "Expected bigint",
);

const dateSchema = v.custom<Date>(
  (input) => input instanceof Date,
  "Expected Date",
);
```

### Safe Parsing

```typescript
const result = v.safeParse(ConfigSchema, data);
if (!result.success) {
  logger.warn("Invalid config", { issues: result.issues });
  return null;
}
return result.output;
```

### When to Use Valibot

Use Valibot for:
- ✅ Validating data from external APIs
- ✅ Validating environment variables
- ✅ Validating user input
- ✅ Creating type guards (`is*` functions)
- ✅ Parsing serialized data (JSON, etc.)
- ✅ Validating configuration objects

**Never skip validation** - always validate data at boundaries (API responses, user input, config files).

---

## 6. Error Handling

### Custom Error Classes

```typescript
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "AppError";
  }
}
```

### Error Wrapping (ES2022)

```typescript
try {
  const result = await externalApi.call();
  return result;
} catch (error) {
  throw new AppError(
    `API call failed: ${error instanceof Error ? error.message : String(error)}`,
    "API_ERROR",
    error, // Preserve original error
  );
}
```

---

## 7. Testing

### Framework

Use **Vitest** for all testing.

### File Location

Colocate test files with source:

```
src/
├── lib/
│   ├── client.ts
│   └── client.test.ts  # ✅ Colocated
```

### Test Structure

```typescript
describe("formatCents", () => {
  it("should format positive amounts", () => {
    expect(formatCents(12345n)).toBe("$123.45");
  });

  it("should handle edge cases", () => {
    expect(formatCents(0n)).toBe("$0.00");
  });
});
```

### Running Tests

```bash
pnpm test:run      # Single run (CI/Cursor)
pnpm test          # Watch mode
pnpm test:coverage # With coverage
```

---

## 8. Architecture Decision Records

**Always check `adrs/` before implementing features.**

ADRs document architectural patterns and design decisions. Reference them in code:

```typescript
/**
 * Order state machine implementation.
 *
 * @see {@link ../../adrs/0003-state-machines.md ADR-0003: State Machines}
 */
export const transitionOrder = (order: Order, event: OrderEvent): Order => {
  // Implementation per ADR-0003
};
```

### Current ADRs

| ADR | Title | Status |
|-----|-------|--------|
| [0001](adrs/0001-bot-architecture.md) | Bot Architecture | Accepted |
| [0002](adrs/0002-hexagonal-inspired-architecture.md) | Hexagonal-Inspired Architecture | Accepted |
| [0003](adrs/0003-state-machines.md) | State Machines | Accepted |
| [0004](adrs/0004-exchange-adapters.md) | Exchange Adapters | Accepted |
| [0005](adrs/0005-validation-strategy.md) | Validation Strategy | Accepted |
| [0006](adrs/0006-backend-framework-hono.md) | Backend Framework — Hono | Accepted |
| [0007](adrs/0007-database-strategy.md) | Database Strategy | Accepted |
| [0008](adrs/0008-infrastructure-flyio.md) | Infrastructure — Fly.io | Accepted |
| [0009](adrs/0009-monitoring-observability.md) | Monitoring & Observability | Accepted |
| [0010](adrs/0010-dev-tooling.md) | Development Tooling | Accepted |
| [0011](adrs/0011-risk-management.md) | Risk Management Engine | Planned |
| [0012](adrs/0012-exchange-rate-limiting.md) | Exchange Rate Limiting & API Safety | Planned |
| [0013](adrs/0013-execution-safety-slippage.md) | Execution Safety & Slippage Modeling | Planned |
| [0014](adrs/0014-funding-rate-strategy.md) | Funding Rate Prediction & Strategy | Planned |
| [0015](adrs/0015-backtesting-simulation.md) | Backtesting & Simulation Framework | Planned |
| [0017](adrs/0017-task-scheduler.md) | Task Scheduler Implementation | Accepted |

See `adrs/` directory for full documentation.
