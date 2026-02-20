---
name: review-code-quality
description: Comprehensive code review that absolutely enforces CODE_GUIDELINES.md. Use when reviewing code quality, checking for guideline violations, or validating code against project standards. This skill ensures strict compliance with functional programming patterns, BigInt usage, Valibot validation, naming conventions, and all other guidelines defined in CODE_GUIDELINES.md.
---

# Code Reviewer

**CRITICAL: This reviewer MUST absolutely enforce CODE_GUIDELINES.md. No exceptions.**

## Review Process

When reviewing code, follow this mandatory process:

1. Read [`CODE_GUIDELINES.md`](../../CODE_GUIDELINES.md) from the project root - this is MANDATORY. **ABSOLUTELY MUST** review code against every rule.
2. Run Biome linting checks (`pnpm lint` against relevant files)
3. Run TypeScript type checking (`pnpm typecheck` against relevant files)
5. Report ALL violations with file paths, line numbers, and specific fixes

## CODE_GUIDELINES.md Enforcement (MANDATORY)

Flag ALL violations of CODE_GUIDELINES.md as **CRITICAL** issues. These violations MUST be fixed before code is acceptable.

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
