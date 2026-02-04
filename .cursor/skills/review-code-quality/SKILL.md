---
name: review-code-quality
description: Comprehensive code review that absolutely enforces CODE_GUIDELINES.md. Use when reviewing code quality, checking for guideline violations, or validating code against project standards. This skill ensures strict compliance with functional programming patterns, BigInt usage, Valibot validation, naming conventions, and all other guidelines defined in CODE_GUIDELINES.md.
---

# Code Reviewer

**CRITICAL: This reviewer MUST absolutely enforce CODE_GUIDELINES.md. No exceptions.**

## Review Process

When reviewing code, follow this mandatory process:

1. **FIRST STEP**: Read `CODE_GUIDELINES.md` from the project root - this is MANDATORY
2. Run Biome linting checks (`pnpm biome check .` or `pnpm lint`)
3. Run TypeScript type checking (`pnpm typecheck` or `tsc --noEmit`)
4. **ABSOLUTELY MUST** review code against every rule in `CODE_GUIDELINES.md`
5. Report ALL violations with file paths, line numbers, and specific fixes

## CODE_GUIDELINES.md Enforcement (MANDATORY)

Flag ALL violations of CODE_GUIDELINES.md as **CRITICAL** issues. These violations MUST be fixed before code is acceptable.

### 1. Functional Programming Over Classes

**NEVER allow classes** unless absolutely necessary (only Error classes extending Error are acceptable).

```typescript
// ❌ CRITICAL VIOLATION: Class usage
export class TokenBucket {
  // ...
}

// ✅ CORRECT: Factory function
export const createTokenBucket = (): TokenBucket => {
  // ...
};
```

### 2. Arrow Functions Only

**ALL exported functions MUST use `const` arrow functions.**

```typescript
// ❌ CRITICAL VIOLATION: function declaration
export function calculateTotal(items: Item[]): bigint {
  // ...
}

// ✅ CORRECT: const arrow function
export const calculateTotal = (items: Item[]): bigint => {
  // ...
};
```

### 3. BigInt for Financial Math

**ALL monetary calculations MUST use `bigint`, never `number`.**

```typescript
// ❌ CRITICAL VIOLATION: number for financial math
const fee = notional * feeRate; // Precision loss!

// ✅ CORRECT: bigint with unit suffix
const feeCents = (notionalCents * feeRateBps) / 10000n;
```

**Variable names MUST include unit suffixes**: `Cents`, `Bps`, `Sats`, etc.

### 4. No `any` Type

**NEVER allow `any` - use `unknown` with Valibot validation.**

```typescript
// ❌ CRITICAL VIOLATION: any type
const parseResponse = (data: any): Order => data;

// ✅ CORRECT: unknown with validation
const parseResponse = (data: unknown): Order => v.parse(OrderSchema, data);
```

### 5. No Type Casts

**NEVER allow type casts (`as Type`) - use Valibot validation or type guards.**

```typescript
// ❌ CRITICAL VIOLATION: type cast
const order = response as Order;

// ✅ CORRECT: Valibot validation
const order = v.parse(OrderSchema, response);

// ✅ CORRECT: Type guard
if (isOrder(response)) {
  return response;
}
```

### 6. Explicit Return Types

**ALL exported functions MUST have explicit return types.**

```typescript
// ❌ CRITICAL VIOLATION: inferred return type
export const formatAmount = (cents: bigint) => {
  return `$${(cents / 100n).toString()}`;
};

// ✅ CORRECT: explicit return type
export const formatAmount = (cents: bigint): string => {
  return `$${(cents / 100n).toString()}`;
};
```

### 7. Naming Conventions

**MUST enforce all naming conventions:**

- Functions: `camelCase` with verb prefix (`getUser`, `calculateFee`)
- Variables: `camelCase` (`fundingRate`, `spotPrice`)
- Constants: `SCREAMING_SNAKE_CASE` (`MAX_RETRIES`, `DEFAULT_TIMEOUT_MS`)
- Types: `PascalCase` (`OrderStatus`, `UserConfig`)
- BigInt amounts: `camelCase` + unit suffix (`notionalCents`, `rateBps`, `priceSats`)
- Files: `kebab-case` (`order-service.ts`, `risk-engine.ts`)
- Test files: `*.test.ts` suffix

### 8. Valibot Validation

**MUST use Valibot for all runtime validation.**

```typescript
// ❌ CRITICAL VIOLATION: manual validation
if (typeof data.maxRetries !== 'number') {
  throw new Error('Invalid');
}

// ✅ CORRECT: Valibot validation
import * as v from "valibot";
const config = v.parse(ConfigSchema, data);
```

### 9. Error Handling

**MUST use custom error classes extending Error.**

```typescript
// ✅ CORRECT: Custom error class
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

### 10. Test Colocation

**Tests MUST be colocated with source files using `.test.ts` suffix.**

```
src/lib/
├── client.ts
└── client.test.ts  # ✅ CORRECT
```

## Review Report Format

When reporting violations, use this format:

### CRITICAL: CODE_GUIDELINES.md Violations

1. **[File: path/to/file.ts:123]** Class usage detected
   - **Violation**: Used `class TokenBucket` instead of factory function
   - **Fix**: Replace with `export const createTokenBucket = (): TokenBucket => { ... }`
   - **Reference**: CODE_GUIDELINES.md §3 (Functional Programming Preference)

2. **[File: path/to/file.ts:45]** Missing explicit return type
   - **Violation**: Exported function `formatAmount` lacks return type annotation
   - **Fix**: Add `: string` return type
   - **Reference**: CODE_GUIDELINES.md §3 (Explicit Return Types)

### TypeScript Errors

[List TypeScript errors with file paths and line numbers]

### Biome Linting Errors

[List Biome errors with file paths and line numbers]

## Priority Order

1. **CODE_GUIDELINES.md violations** (CRITICAL - must fix first)
2. TypeScript errors (may cause lint errors)
3. Biome linting errors

## Verification

After fixes are applied, re-run the review to verify:
- ✅ All CODE_GUIDELINES.md violations are resolved
- ✅ All TypeScript errors are resolved
- ✅ All Biome linting errors are resolved

**Code is NOT acceptable until ALL CODE_GUIDELINES.md violations are fixed.**
