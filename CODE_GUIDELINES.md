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

### No single-letter parameter names

**Use descriptive parameter names.** Do not use single-letter shorthands like `m`, `t`, `p`, `r`, `d` for parameters.

```typescript
// ✅ Good
const parseMarket = (rawMarket: GmxMarketsInfoResponse["markets"][number]): GmxMarket => ({ ... });
items.find((item) => item.id === id);

// ❌ Bad
const parseMarket = (m: GmxMarketsInfoResponse["markets"][number]): GmxMarket => ({ ... });
items.find((t) => t.id === id);
```

**Exception:** Idiomatic callbacks where the meaning is obvious are acceptable: e.g. `.sort((a, b) => ...)`, `.reduce((acc, value) => ...)`, or framework conventions like Hono's `(c) =>` for context.

### No abbreviated variable names

**Use descriptive variable names.** Do not use abbreviated names like `ts`, `dt`, `tmp`, `val`, `msg`, `err` (as variable names) when a clearer name is available.

```typescript
// ✅ Good
const snapshotTime = new Date();
return { ts: snapshotTime, market, ... };
const errorMessage = err instanceof Error ? err.message : String(err);

// ❌ Bad
const ts = new Date();
return { ts, market, ... };
const msg = err instanceof Error ? err.message : String(err);
```

**Exception:** When the type or API mandates a short property name (e.g. `ts` in a schema), use a descriptive local variable and assign to the short key: `const snapshotTime = new Date(); return { ts: snapshotTime };`. Loop variables like `i`, `j` in simple loops are acceptable; prefer `index` or descriptive names when it improves clarity.

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

---

## 8. React

*These rules apply when the project includes a React UI (e.g. Vite + React or Electron renderer).*

### 8.0 React Imports

- MUST use `import type { ... } from "react"` for type-only symbols (e.g. `ReactNode`, `ReactElement`, `PropsWithChildren`, `ComponentPropsWithoutRef`, `ButtonHTMLAttributes`).
- MUST NOT use the global `React.` namespace for types (e.g. `React.PropsWithChildren`, `React.ReactElement`). Use named type imports instead.
- Runtime imports from `"react"` (e.g. `useState`, `useEffect`, `useMemo`, `forwardRef`) remain normal value imports: `import { useState } from "react"`.

```tsx
// ✅ Good: type-only imports for React types
import type { ReactNode, ReactElement, PropsWithChildren } from "react";
import { useState, useEffect } from "react";

// ❌ Bad: global React namespace for types
function Layout({ children }: React.PropsWithChildren) {}
const Component = (): React.ReactElement => <div />;
```

### Core Rules

- MUST use functional components and hooks, not classes
- MUST name components in PascalCase and define `<ComponentName>Props`
- MUST define props interface immediately before the component
- SHOULD keep components presentational; data fetching goes in hooks or an API layer

### 8.1 Component Props

Define the props interface immediately before the component for better readability and maintainability:

```tsx
// ✅ Good: Props defined immediately before component
export interface OrdersListProps {
  orders: Order[];
  isLoading?: boolean;
}

export const OrdersList = ({
  orders,
  isLoading = false,
}: OrdersListProps) => {
  if (isLoading) return <Skeleton />;

  return (
    <ul className="divide-white/10 w-full divide-y">
      {orders.map((order) => (
        <OrderItem key={order.id} order={order} />
      ))}
    </ul>
  );
};
```

```tsx
// ❌ Bad: All prop types at the top — hard to find which component uses which
export interface OrdersListProps {
  orders: Order[];
}
export interface OrderItemProps {
  order: Order;
}

// ... 50 lines later ...

export const OrdersList = ({ orders }: OrdersListProps) => {
  // Where was OrdersListProps defined again?
};
```

### 8.2 Component Namespacing (Compound Components)

Use component namespacing when there are **3 or more** related sub-components for a single component family. This keeps related components co-located and provides a clean API.

- MUST use namespacing when there are 3+ related sub-components
- MUST define prop types immediately before their associated component definition

```tsx
// ✅ Good: Compound component with namespacing
import type { PropsWithChildren } from "react";

export type OrderCardProps = PropsWithChildren;

export const OrderCard = ({ children }: OrderCardProps) => {
  return <div className="rounded-xl bg-[#222529] p-4">{children}</div>;
};

type OrderCardHeaderProps = {
  orderId: string;
  market: string;
};

const Header = ({ orderId, market }: OrderCardHeaderProps) => {
  return (
    <div className="flex items-center justify-between">
      <span className="text-white/70 font-mono text-sm">{orderId.slice(0, 10)}...</span>
      <span className="text-white/50 text-xs">{market}</span>
    </div>
  );
};

OrderCard.Header = Header;

type OrderCardFooterProps = PropsWithChildren;

const Footer = ({ children }: OrderCardFooterProps) => {
  return <div className="border-white/10 mt-3 border-t pt-3">{children}</div>;
};

OrderCard.Footer = Footer;
```

```tsx
// ❌ Bad: Separate exports without namespacing for 3+ related components
export const OrderCard = ({ children }) => <div>{children}</div>;
export const OrderCardHeader = ({ orderId }) => <div>{orderId}</div>;
export const OrderCardFooter = ({ children }) => <div>{children}</div>;
```

### 8.3 Conditional Rendering

Use **early returns** for loading, error, and empty states. Avoid deeply nested inline conditionals.

```tsx
// ✅ Good: Early returns — clear, flat, easy to follow
const OrdersPage = () => {
  const { data: orders, isLoading, error } = useOrders();

  if (isLoading) return <Skeleton />;
  if (error) return <ErrorMessage error={error} />;
  if (!orders?.length) return <EmptyState />;

  return <OrdersList orders={orders} />;
};
```

```tsx
// ❌ Bad: Deeply nested inline conditionals — hard to follow
const OrdersPage = () => {
  const { data: orders, isLoading, error } = useOrders();

  return (
    <div>
      {isLoading && <div>Loading...</div>}
      {error && <div>Error: {error.message}</div>}
      {!isLoading && !error && (!orders || orders.length === 0) && (
        <div>No orders yet</div>
      )}
      {!isLoading && !error && orders && orders.length > 0 && (
        <ul>
          {orders.map((order) => (
            <li key={order.id}>{order.side}</li>
          ))}
        </ul>
      )}
    </div>
  );
};
```

### 8.4 Hooks

- MUST name hooks `useXxx` and return typed values
- SHOULD prefer custom hooks over inline logic for reusable data fetching or state
- MUST keep hooks domain-specific or truly generic

```typescript
// ✅ Good: Custom hook wrapping data fetch
export const useOrders = (marketId?: string) => {
  return useQuery({
    queryKey: ["orders", marketId],
    queryFn: () => fetchOrders(marketId),
    staleTime: 60 * 1000,
  });
};

// ✅ Good: Custom hook with derived state
export const useSortedOrders = (marketId?: string) => {
  const { data: orders, ...rest } = useOrders(marketId);

  const sortedOrders = useMemo(
    () =>
      orders?.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [orders]
  );

  return { data: sortedOrders, ...rest };
};
```

---

## 9. Styling

*These rules apply when the project uses Tailwind CSS (e.g. React UI with Tailwind).*

### Core Rules

- MUST use Tailwind CSS for styling (utility-first approach)
- SHOULD use Radix UI for accessible, unstyled primitives when building complex UI
- SHOULD use CVA (Class Variance Authority) for component variants
- MUST follow responsive design principles when building for multiple viewports
- SHOULD use `cn()` (clsx + tailwind-merge) for conditional class composition

### 9.1 Tailwind Utility-First Approach

Apply Tailwind classes directly in JSX. Keep styling close to the markup.

```tsx
// ✅ Good: Direct Tailwind utilities
<header className="w-full h-16 bg-[#222529] shadow-md flex items-center px-8 py-3">
  <div className="flex items-center gap-2">
    <Logo />
    <h1 className="text-lg font-semibold text-white">App</h1>
  </div>
</header>

// ✅ Good: Responsive utilities
<div className="w-full max-w-5xl mx-auto px-4 md:px-8 lg:px-12">
  {children}
</div>

// ✅ Good: State-based styling
<button className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50">
  Submit
</button>
```

### 9.2 Conditional Classes with `cn()`

Use a `cn()` utility (combining `clsx` and `tailwind-merge`) for conditional and merged classes:

```typescript
// lib/utils.ts (or equivalent)
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]): string => {
  return twMerge(clsx(inputs));
};
```

```tsx
// ✅ Good: Conditional classes with cn()
import { cn } from "@/lib/utils";

export interface MarketBadgeProps {
  market: string;
  isActive?: boolean;
}

export const MarketBadge = ({ market, isActive = false }: MarketBadgeProps) => {
  return (
    <span
      className={cn(
        "rounded-full px-3 py-1 text-xs font-medium",
        isActive ? "bg-blue-600 text-white" : "bg-white/10 text-white/70"
      )}
    >
      {market}
    </span>
  );
};
```

```tsx
// ❌ Bad: String concatenation for conditional classes
<span className={`rounded-full px-3 py-1 text-xs font-medium ${isActive ? "bg-blue-600 text-white" : "bg-white/10 text-white/70"}`}>
  {market}
</span>

// ❌ Bad: Ternary inside template literal (hard to read, no merge)
<div className={`base-class ${error ? "border-red-500" : "border-white/10"}`} />
```

### 9.3 Size Shorthand

- MUST use `size-n` when height and width are the same value, instead of `h-n w-n`

```tsx
// ✅ Good: size-n for equal height and width
<div className="size-12" />           {/* 48px × 48px */}
<button className="size-8" />         {/* 32px × 32px */}
<img className="size-16 rounded-full" /> {/* 64px × 64px circle */}

// ✅ Good: Different values — use h-n and w-n
<div className="h-12 w-full" />
<button className="h-8 w-24" />
```

```tsx
// ❌ Bad: Redundant when values are the same
<div className="h-12 w-12" />         {/* Should use size-12 */}
<button className="h-8 w-8" />        {/* Should use size-8 */}
```

### 9.4 CSS Variables with Tailwind

Use inline CSS variables for reusable values within a component's styling when the same value is used across multiple properties.

- SHOULD define CSS variables inline using Tailwind's arbitrary properties syntax: `[--variable-name:value]`
- SHOULD reference CSS variables using arbitrary value syntax: `property-(--variable-name)`
- MUST NOT use for single-use values (just use the Tailwind utility directly)

**When to use:**

- Multiple properties share the same value (e.g. `size`, `height`, `padding`)
- The value needs to be consistent across related elements

```tsx
// ✅ Good: Define once, use throughout
<div className="[--cell-size:2.5rem] grid grid-cols-7 gap-1">
  <button className="size-(--cell-size) rounded-md hover:bg-white/10" />
  <button className="size-(--cell-size) rounded-md hover:bg-white/10" />
</div>

// ✅ Good: Consistent spacing
<div className="[--spacing:1rem] gap-(--spacing) p-(--spacing)">
  {children}
</div>
```

```tsx
// ❌ Bad: Using for single property (unnecessary)
<div className="[--width:100px] w-(--width)" /> {/* Just use w-[100px] */}

// ❌ Bad: Using when Tailwind tokens exist
<div className="[--size:theme(spacing.12)]" /> {/* Just use size-12 */}
```

### 9.5 CVA (Class Variance Authority)

Use CVA for creating reusable component variants instead of composing Tailwind classes with conditional logic. This provides type safety, cleaner APIs, and centralized variant logic.

#### When to Use CVA

- MUST use CVA for components with 2+ visual variants
- SHOULD use CVA for shared utilities like focus rings, status indicators, etc.
- SHOULD colocate CVA definitions with components unless shared across multiple components
- MUST export the variant props type using `VariantProps<typeof variants>`

#### Component Variants

```typescript
import type { ButtonHTMLAttributes } from "react";

import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// ✅ Good: CVA for variant management
const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2",
  {
    variants: {
      variant: {
        primary: "bg-blue-600 text-white hover:bg-blue-700",
        secondary: "bg-white/10 text-white hover:bg-white/20",
        ghost: "text-white/70 hover:bg-white/10 hover:text-white",
        danger: "bg-red-600 text-white hover:bg-red-700",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = ({
  className,
  variant,
  size,
  ...props
}: ButtonProps) => {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
};
```

```typescript
// ❌ Bad: Complex conditional classes without CVA
const getButtonClasses = (variant: string, size: string): string => {
  let classes = "inline-flex items-center justify-center";
  if (variant === "primary") classes += " bg-blue-600 text-white";
  if (variant === "secondary") classes += " bg-white/10 text-white";
  if (size === "large") classes += " px-6 py-3";
  return classes;
};
```

#### CVA Naming Conventions

- MUST use camelCase for CVA exports: `buttonVariants`, `actionBadgeVariants`
- SHOULD include "Variants" suffix: `alertVariants`, `badgeVariants`
- SHOULD name based on what the variants style

#### CVA Best Practices

```typescript
// ✅ Good: CVA over inline conditionals
<div className={variants({ state: isError ? "error" : "default" })} />

// ❌ Bad: Inline ternary for styling
<div className={`base ${isError ? "border-red-500" : "border-white/10"}`} />
```

### 9.6 CSS Modules (Animations Only)

CSS Modules should **only** be used for animations and complex behaviors that cannot be achieved with Tailwind. All other styling MUST use Tailwind classes directly.

- MUST use PascalCase for CSS Module files, matching the component: `OrderCard.module.css`
- MUST always import as `styles`: `import styles from "./OrderCard.module.css"`
- MUST use kebab-case for class selectors inside the CSS module file
- MUST NOT use `@apply` with Tailwind classes in CSS modules

```tsx
// ✅ Good: CSS module only for animation, Tailwind for everything else
import styles from "./OrderCard.module.css";

export const OrderCard = ({ children, isNew }: OrderCardProps) => {
  return (
    <div
      className={cn(
        "rounded-xl text-white bg-[#222529] p-4",
        isNew && styles["fade-in"]
      )}
    >
      {children}
    </div>
  );
};
```

```css
/* OrderCard.module.css — only animations */
.fade-in {
  animation: fade-in 0.3s ease-in-out;
}

@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

```tsx
// ❌ Bad: Using CSS modules for basic styling
import styles from "./Button.module.css";

<button className={styles.primary}>Submit</button>;
// Should use Tailwind classes directly or CVA
```

### 9.7 Radix UI / Accessible Primitives

Use Radix UI for accessible, unstyled primitives when building dropdowns, dialogs, etc. Style them with Tailwind classes:

```tsx
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

export const MarketSelector = ({ markets }: MarketSelectorProps) => {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="bg-white/10 text-white hover:bg-white/20 flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
        Select Market
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="shadow-lg rounded-lg bg-[#222529] p-1">
          {markets.map((market) => (
            <DropdownMenu.Item
              key={market.id}
              className="text-white/90 hover:bg-white/10 focus:bg-white/10 cursor-pointer rounded-md px-3 py-2 text-sm focus:outline-none"
            >
              {market.symbol}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};
```

---

## 10. Architecture Decision Records

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
| [0029](adrs/0029-infrastructure-railway.md) | Infrastructure — Railway | Accepted |
| [0009](adrs/0009-monitoring-observability.md) | Monitoring & Observability | Accepted |
| [0010](adrs/0010-dev-tooling.md) | Development Tooling | Accepted |
| [0011](adrs/0011-risk-management.md) | Risk Management Engine | Planned |
| [0012](adrs/0012-exchange-rate-limiting.md) | Exchange Rate Limiting & API Safety | Planned |
| [0013](adrs/0013-execution-safety-slippage.md) | Execution Safety & Slippage Modeling | Planned |
| [0014](adrs/0014-funding-rate-strategy.md) | Funding Rate Prediction & Strategy | Planned |
| [0015](adrs/0015-backtesting-simulation.md) | Backtesting & Simulation Framework | Planned |
| [0017](adrs/0017-task-scheduler.md) | Task Scheduler Implementation | Accepted |

See `adrs/` directory for full documentation.
