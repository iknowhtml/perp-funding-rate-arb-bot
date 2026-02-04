---
name: create-implement-and-manage-plan
description: Create, implement, and manage development plans. Use Opus 4.5 for plan creation/context gathering, Composer for implementation.
---

# Plan Management

## Model Selection

| Phase | Model | Why |
|-------|-------|-----|
| **Plan Creation & Context** | Opus 4.5 | Superior reasoning, better at synthesizing patterns |
| **Implementation** | Composer | Faster code generation when context is provided |

---

## Opus 4.5: Plan Creation

Use for analyzing requirements, researching codebase patterns, and documenting implementation context.

### Context Checklist

Before handing off to Composer, ensure the plan includes:

- [ ] **Code patterns**: Specific examples from codebase to follow
- [ ] **Relevant types**: Interfaces, types, schemas to use
- [ ] **File locations**: Where new files should go
- [ ] **Test patterns**: How similar features are tested
- [ ] **Error handling**: Expected error types and wrapping

### Example Implementation Context Section

```markdown
## Implementation Context

### Code Patterns
- Factory pattern: `createXAdapter(config)` returns `XAdapter`
- See `src/adapters/hyperliquid/` for reference

### Relevant Types
- `ExchangeAdapter` from `src/adapters/types.ts`
- `RateLimiter` from `src/lib/rate-limiter/`

### Test Patterns
- Mock external APIs with `vi.mock()`
- Use factories from `src/test/factories.ts`
```

---

## Opus 4.5: Code Example Validation

**Before finalizing any plan, validate all code examples against `CODE_GUIDELINES.md` and `biome.json`.**

### Validation Checklist

For every code block in the plan, verify:

**CODE_GUIDELINES.md:**
- [ ] **Arrow functions**: Uses `const` arrow functions, not `function` declarations
- [ ] **No `any`**: Uses `unknown` with Valibot validation instead
- [ ] **No type casts**: Uses Valibot `v.parse()` or type guards, not `as Type`
- [ ] **Explicit return types**: All exported functions have explicit return types
- [ ] **BigInt for money**: Financial calculations use `bigint` with unit suffixes (`Cents`, `Bps`, `Sats`)
- [ ] **Valibot namespace import**: Uses `import * as v from "valibot"`, not named imports
- [ ] **No file extensions**: Import paths have no `.js` or `.ts` extensions
- [ ] **Naming conventions**: Functions use verb prefixes (`get*`, `create*`, `calculate*`, etc.)
- [ ] **Factory over class**: Uses `createX(config)` pattern, not `new X(config)`

**Biome Rules (`biome.json`):**
- [ ] **2-space indentation**: No tabs, no 4-space indents
- [ ] **100-char line width**: Long lines must be wrapped
- [ ] **Node.js import protocol**: Use `node:fs`, `node:path`, not `fs`, `path`
- [ ] **No unused imports/variables**: Remove any unused declarations in examples
- [ ] **No unnecessary template literals**: Use `"string"` not `` `string` `` when no interpolation

### Quick Reference: Common Violations

| ❌ Violation | ✅ Correct |
|--------------|-----------|
| `function foo() {}` | `const foo = (): void => {}` |
| `data: any` | `data: unknown` + `v.parse(Schema, data)` |
| `response as Order` | `v.parse(OrderSchema, response)` |
| `from "./client.js"` | `from "./client"` |
| `const fee = amount * rate` | `const feeCents = (amountCents * rateBps) / 10000n` |
| `new Client(config)` | `createClient(config)` |
| `import { object } from "valibot"` | `import * as v from "valibot"` |
| `import { readFile } from "fs"` | `import { readFile } from "node:fs"` |
| `` `static string` `` | `"static string"` |
| 4-space or tab indent | 2-space indent |

### Validation Workflow

1. **Review each code block** in the plan
2. **Check against checklist** above
3. **Fix violations** before moving to implementation
4. **Add corrected examples** as reference for Composer

Plans with non-compliant code examples create implementation debt. Fix in planning phase, not implementation.

---

## Composer: Implementation

### Workflow

1. Extract todos from **frontmatter** (not prose `## Tasks` section)
2. Work through each todo:
   - Mark `in_progress` → Complete work → Run code-reviewer → Mark `completed`
3. Complete `lifecycle-management` todo (move plan to `implemented/`)

### Code Review Gate

**Run `.cursor/skills/code-reviewer/SKILL.md` after each task.**

Do NOT mark tasks complete until code-reviewer passes.

---

## Frontmatter Todos: Source of Truth

```yaml
---
todos:
  - id: task-1
    content: First task
    status: pending
  - id: lifecycle-management    # <-- MANDATORY
    content: Move plan to implemented/
    status: pending
---
```

Every plan MUST include `lifecycle-management` as the final todo.

---

## Moving Plans to Implemented

When all todos are complete:

**Important**: Move the **original plan file** that's referenced in the roadmap (e.g., `.cursor/plans/active/<ROADMAP>/<PHASE>/<PLAN>.md`), not standalone plan files created elsewhere. If work relates to an existing roadmap plan, update and move that plan, not a separate one.

```bash
# 1. Update plan: todos to completed, validation boxes [x]

# 2. Move the original plan file from active/ to implemented/
mkdir -p .cursor/plans/implemented/<ROADMAP>/<PHASE>
mv .cursor/plans/active/<ROADMAP>/<PHASE>/<PLAN>.md \
   .cursor/plans/implemented/<ROADMAP>/<PHASE>/<PLAN>.md

# 3. Verify (delete if still in active/)
test -f .cursor/plans/active/<ROADMAP>/<PHASE>/<PLAN>.md && \
  rm -f .cursor/plans/active/<ROADMAP>/<PHASE>/<PLAN>.md

# 4. Confirm
! test -f .cursor/plans/active/<ROADMAP>/<PHASE>/<PLAN>.md && echo "SUCCESS"
```

**Example**: If implementing "co-locate exchange code" work that relates to the rate-limiting plan at `.cursor/plans/active/0001-mvp-roadmap/02-connectivity/0002-rate-limiting.md`, move **that plan** to `implemented/`, not a separate standalone plan file.

---

## Anti-Patterns

| Don't | Do |
|-------|-----|
| Extract tasks from `## Tasks` prose | Parse `frontmatter.todos` array |
| Forget `lifecycle-management` todo | Always include as final todo |
| Leave file in both locations | File only in `implemented/` after completion |
| Skip code-reviewer | Run after every implementation task |
| Create standalone plans for work that relates to existing roadmap plans | Update and move the original roadmap plan |
| Move standalone plan files instead of the referenced roadmap plan | Move the original plan file from `active/<ROADMAP>/<PHASE>/` |
