# Code Guidelines

## Table of Contents

1. [General Principles](#1-general-principles)
2. [Naming Conventions](#2-naming-conventions)
3. [TypeScript Practices](#3-typescript-practices)
4. [Financial Math with BigInt](#4-financial-math-with-bigint)
5. [Validation with Valibot](#5-validation-with-valibot)
6. [Error Handling](#6-error-handling)
7. [Testing](#7-testing)
8. [React](#8-react)
9. [Styling](#9-styling)
10. [Architecture Decision Records](#10-architecture-decision-records)

---

## 1. General Principles

1. **Safety First**: Prioritize correctness over cleverness
2. **Deterministic**: Logic should be testable and reproducible
3. **Auditable**: Every action should be traceable
4. **ADR-Driven**: Check `adrs/` for architectural decisions before implementing features
5. **Use library functions where possible**: Prefer existing utilities from the codebase and project dependencies (e.g. `viem`, Valibot, Node built-ins) over custom implementations. Before writing a small helper (e.g. `isHex`, date parsing, type guards), check whether the library already provides it.

---

## 2. Naming Conventions

### Files and Directories

| Type | Convention | Example |
|------|------------|---------|
| Modules | kebab-case | `diff-detector.ts`, `context-store.ts` |
| Test files | `*.test.ts` / `*.test.tsx` | `capture.test.ts`, `OverlayShell.test.tsx` |
| Type files | kebab-case | `types.ts`, `schemas.ts` |
| React components | PascalCase | `OverlayShell.tsx` |
| Directories | kebab-case | `lib/`, `components/` |

### Code

| Type | Convention | Example |
|------|------------|---------|
| Functions | camelCase + verb | `getFundingRate`, `getMarketInfo` |
| Variables | camelCase | `fundingRate`, `spotPrice` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_RETRIES`, `DEFAULT_DELAY_MS` |
| Types | PascalCase | `OrderStatus`, `CaptureResult` |
| BigInt amounts | camelCase + unit suffix | `durationMs`, `amountCents`, `rateBps` |
| Records | `<plural>By<Key>` | `ordersById`, `handlersByChannel` |

### Descriptive names (parameters and variables)

**Use clear, descriptive names for parameters and variables.** Avoid single-letter names (`m`, `t`, `p`, `r`, `d`, `i`, `j`) and cryptic shorthands (`prev`, `curr`, `ts`, `dt`, `tmp`, `val`, `msg`, `err`) when a fuller name is clearer.

- **Parameters:** Prefer names that convey meaning (e.g. `raw`, `item`, `previous`, `current`).
- **Locals:** Prefer descriptive names (e.g. `snapshotTime`, `errorMessage`, `previousRow`, `sourceLength`).
- **Schema/API-mandated short keys:** When the type or API requires a short property name (e.g. `ts`), use a descriptive local and assign to the key: `const snapshotTime = new Date(); return { ts: snapshotTime };`.

```typescript
// ✅ Good
const parseMarket = (raw: GmxMarketsInfoResponse["markets"][number]): GmxMarket => ({ ... });
items.find((item) => item.id === id);
const snapshotTime = new Date();
return { ts: snapshotTime, market, ... };
const errorMessage = err instanceof Error ? err.message : String(err);
const previousRow = Array.from({ length: targetLength + 1 }, (_, index) => index);
const currentRow = new Array<number>(targetLength + 1);

// ❌ Bad
const parseMarket = (r: GmxMarketsInfoResponse["markets"][number]): GmxMarket => ({ ... });
items.find((t) => t.id === id);
const ts = new Date();
return { ts, market, ... };
const msg = err instanceof Error ? err.message : String(err);
const prev = Array.from({ length: n + 1 }, (_, i) => i);
const curr = new Array(n + 1);
```

**Exceptions:** Idiomatic callbacks (e.g. `.sort((a, b) => ...)`, `.reduce((acc, value) => ...)`, React `(e) =>` for events) and very short loop indices in tight numeric code may use short names when the meaning is obvious. Prefer `index` or a descriptive name when it improves clarity.


**If a function is a React component** (used in JSX or passed to a `components` map), **name it like a component** (PascalCase). Do not use a `render` prefix.

```typescript
// ✅ Good: component name
const CodeBlock: Components["code"] = (props) => <SyntaxHighlighter ... />;
<ReactMarkdown components={{ code: CodeBlock }} />

// ❌ Bad: "render" prefix for something that is just a component
const renderCodeBlock = (props) => <SyntaxHighlighter ... />;
<ReactMarkdown components={{ code: renderCodeBlock }} />
```

**Use "render" only when it fits the role:** a callback that returns JSX in a specific context, not a standalone component.

- **Render props:** the prop is a function that "renders" with injected data: `render={(data) => <View data={data} />}` or `children={(state) => <div>{state.value}</div>`.
- **Item/row renderers:** callbacks that render one item in a list or table: `renderItem={(item) => <Row key={item.id}>...</Row>}`, `renderRow={(row) => ...}`.
- **Library APIs that expect a render callback:** e.g. a column definition `{ key: "name", render: (value) => <strong>{value}</strong> }`.

In those cases the name describes the role (render prop, item renderer), not a component identity.

### Omit explicit types when the type can be inferred

**Do not add explicit type annotations on variables when TypeScript can infer the type.** Let the compiler infer from the initializer or from usage.

```typescript
// ✅ Good
const previousRow = Array.from({ length: targetLength + 1 }, (_, index) => index);  // inferred number[]
const currentRow = new Array<number>(targetLength + 1);                            // inferred number[]
const items = getItems();                                                          // inferred from getItems()

// ❌ Bad: redundant type annotations
const previousRow: number[] = Array.from({ length: targetLength + 1 }, (_, index) => index);
const currentRow: number[] = new Array(targetLength + 1);
const items: Item[] = getItems();
```

**Exception:** Add an explicit type when it improves readability (e.g. complex union), when the initializer is `null`/`undefined` and you want a specific type, or when documenting the expected shape for other developers. Exported function **return types** should remain explicit (see [Explicit return types for exports](#explicit-return-types-for-exports)), except React components (see that section).

### Function Prefixes

| Prefix | Use Case | Example |
|--------|----------|---------|
| `get*` | Retrieve data | `getUser`, `getBalance`, `getFundingRate` |
| `calculate*` | Pure deterministic math | `calculateFee`, `calculateTotal` |
| `check*` | Return boolean | `checkIsValid`, `checkHasPermission` |
| `parse*` | Parse serialized data | `parseResponse`, `parseConfig` |
| `create*` | Construct new values | `createOrder`, `createClient` |
| `format*` | Format for display | `formatAmount`, `formatCents` |
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

### Parameter Destructuring

Choose destructuring based on readability and how many properties you use.

- **SHOULD** destructure when using **3+ properties** from an object parameter
- **SHOULD** use the object reference when using **1–2 properties**
- **SHOULD** use the object reference when the property name needs context for clarity
- **SHOULD** use the object reference in long function bodies or when the full object is needed
- **MUST** keep the same style within a module

```typescript
// ✅ Good: 3+ properties — destructure for clarity
transactions.map(({ txHash, action, amount, network }) =>
  formatRow(txHash, action, amount, network)
);

// ✅ Good: 1–2 properties — use object reference
transactions.map((tx) => tx.txHash);
transactions.map((tx) => tx.amount);

// ✅ Good: Property needs context
chains.map((chain) => chain.chainId); // clearer than destructuring to just `chainId`

// ✅ Good: Full object needed
transactions.map((tx) => ({ ...tx, status: "confirmed" }));
```

```typescript
// ❌ Bad: Destructuring when using only 1 property — unnecessary ceremony
transactions.map(({ txHash }) => txHash);

// ❌ Bad: Not destructuring when using many properties — repetitive
transactions.map((tx) =>
  formatRow(tx.txHash, tx.action, tx.amount, tx.network, tx.date)
);
```

### Never Use `any`

```typescript
// ✅ Good: Use unknown with validation
const parseResponse = (data: unknown): Order => v.parse(OrderSchema, data);

// ❌ Bad: any disables type checking
const parseResponse = (data: any): Order => data;
```

### Avoid Non-Null Assertion in Production

Do not use `!` (non-null assertion) in production code. It bypasses the type checker; if the value is actually null/undefined, you get a runtime error. Use narrowing (`if (x) { ... }`), type guards, or explicit checks instead. (In tests, `!` is only acceptable when the value is obviously defined by construction or in a documented test helper; see [Testing](#asserting-optional-values).)

### Avoid Type Casts

**NEVER use `as Type` casting unless absolutely necessary (e.g., interacting with untyped 3rd party libraries).**

Instead, use:
1. **Valibot Validation**: Validate data at the boundary
2. **Type Guards**: Check types at runtime
3. **Type Inference**: Let TypeScript infer the type
4. **Type the variable**: Prefer declaring the variable with an explicit type so the compiler checks the shape; avoid casting the whole object (e.g. `as unknown as Config`). If only one property is a mock or untyped, cast only that property.

```typescript
// ✅ Good: Valibot validation
const order = v.parse(OrderSchema, response);

// ✅ Good: Type guard
if (isErrorResponse(response)) {
  throw new ApiError(response.message);
}

// ❌ Bad: Type cast
const order = response as Order;

// ❌ Bad: Casting the whole object to satisfy a type
const config = { baseUrl, publicClient: mockClient, account } as unknown as Config;

// ✅ Good: Type the variable; cast only the property that needs it (e.g. test mock)
const config: Config = {
  baseUrl,
  publicClient: mockClient as Config["publicClient"],
  account,
};

// ❌ Bad: Casting environment variables
const level = process.env.LOG_LEVEL as LogLevel; // Unsafe!
```

### Explicit Return Types for Exports

**Exported functions should have an explicit return type.** This documents the contract and catches accidental return-type drift.

```typescript
// ✅ Good
export const formatAmount = (cents: bigint): string => `$${(cents / 100n).toString()}`;

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

### Asserting Optional Values

`expect(x).toBeDefined()` does not narrow the type in TypeScript. After asserting that an optional value is defined, narrow with an `if` block so you can use its properties without a non-null assertion (`!`):

```typescript
// ✅ Good: assert then narrow with if
const item = result.items[0];
expect(item).toBeDefined();
if (item) {
  expect(item.name).toBe("expected");
}

// ❌ Bad: toBeDefined doesn't narrow; ! bypasses type checking
expect(item).toBeDefined();
expect(item!.name).toBe("expected");
```

Use this for optional keys, array access (`result[0]`), and API-shaped values. **When `!` is acceptable in tests:** only when the value is obviously defined by construction in the test or in a documented test helper with a clear precondition. **Production code:** avoid `!`; use narrowing, type guards, or checks. The test exception does not apply outside `*.test.ts`.

### Running Tests

```bash
pnpm test:run      # Single run (CI/Cursor)
pnpm test          # Watch mode
pnpm test:coverage # With coverage
```