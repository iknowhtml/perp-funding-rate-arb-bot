# Worktree Agent Instructions

You are working in an isolated git worktree. Follow these rules:

## 1. Isolation

Only modify files listed in your task scope. Do NOT touch files outside your ownership.

## 2. Code Guidelines

Follow CODE_GUIDELINES.md strictly:

- Use `const` arrow functions, never `function` declarations
- Use Valibot for validation: `import * as v from "valibot"`
- Never use `any` — use `unknown` with Valibot validation
- Never use type casts (`as Type`) — use `v.parse()` or type guards
- Explicit return types on all exported functions
- BigInt for financial math with unit suffixes (`Cents`, `Bps`, `Sats`)
- kebab-case file names, colocated `*.test.ts` tests
- No `.js` extensions in imports
- Factory pattern: `createX(config)` not `new X(config)`

## 3. Verification (before committing)

Run these in your worktree:

- `pnpm biome check --write .` (or your modified paths)
- `pnpm typecheck`
- `pnpm test:run <your-test-files>` (if you created tests)

Fix any errors before committing.

## 4. Commit

Stage and commit all changes on your branch:

```bash
git add -A && git commit -m "<provided commit message>"
```

Use the exact commit message from your task. Do not amend or modify it.

## 5. Report

Return a brief summary: what you created/modified and any issues encountered.
