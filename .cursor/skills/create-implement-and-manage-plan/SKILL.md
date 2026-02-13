---
name: create-implement-and-manage-plan
description: Create, implement, and manage development plans. Use Opus 4.6 for plan creation/context gathering, Composer for implementation. For multi-plan parallel execution, hand off to create-parallel-execution-plan + execute-parallel-plan.
---

# Plan Management

## Parallel vs Sequential: When to Use Which

| Scenario | Path | Skills |
|----------|------|--------|
| **Single plan** (one feature, one deliverable) | Sequential | This skill: create plan → implement task-by-task on main |
| **2+ related plans** that can run in parallel (e.g. phase-0: chain infra, data collector, impact sampler) | Parallel | This skill creates plans → **create-parallel-execution-plan** generates PARALLEL-EXECUTION.md + worktree-config.sh → **execute-parallel-plan** runs batches |

**Parallel path**: After you have 2+ plans (or a META-PLAN.md with dependency graph), use `create-parallel-execution-plan` to generate execution artifacts, then `execute-parallel-plan` to orchestrate worktree-based batch execution. See ADR-0028 for the full pipeline.

**Sequential path**: This skill covers plan creation, code validation, and implementation task-by-task. Same code-review and lifecycle rules apply.

---

## Model Selection

| Phase | Model | Why |
|-------|-------|-----|
| **Plan Creation & Context** | Opus 4.6 | Superior reasoning, better at synthesizing patterns |
| **Implementation** | Composer | Faster code generation when context is provided |

---

## Opus 4.6: Plan Creation

Use for analyzing requirements, researching codebase patterns, and documenting implementation context.

Analyze the tasks and determine what can be done in parallel with subagents. Perform in parallel where possible.

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

## Opus 4.6: Code Example Validation

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

### ADR & Plan Drift Reconciliation

If the plan deviates from the ADR, check the codebase and reconcile the plan and ADRs accordingly.

---

## Composer: Implementation (Sequential Path)

When implementing a **single plan** on main (no worktrees):

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
    content: "Move plan to implemented/ (cp to implemented/, git rm -f from active/, verify deletion)"
    status: pending
---
```

Every plan MUST include `lifecycle-management` as the final todo.

---

## Moving Plans to Implemented

When all todos are complete:

**Important**: Move the **original plan file** that's referenced in the roadmap (e.g., `.cursor/plans/active/<ROADMAP>/<PHASE>/<PLAN>.md`), not standalone plan files created elsewhere. If work relates to an existing roadmap plan, update and move that plan, not a separate one.

### Why `cp` + `git rm`, not `mv`

**NEVER use `mv` to move plan files.** The `mv` command can silently fail to delete the source file (cross-device moves, IDE file watchers recreating it, or the agent interpreting `mv` as a file write instead of a shell command). Always use explicit `cp` + `git rm` to guarantee deletion and stage it in git.

### Procedure: Copy, Delete, Verify (all in one shell command)

**Run all steps in a SINGLE shell command** so the agent cannot stop between copy and delete. Do NOT split these into separate tool calls.

Use `git rm -f` instead of plain `rm -f` so the deletion is both performed and staged in git in one step.

```bash
# ALL IN ONE SHELL COMMAND - do not split into separate calls
ACTIVE=".cursor/plans/active/<ROADMAP>/<PHASE>/<PLAN>.md" && \
IMPL=".cursor/plans/implemented/<ROADMAP>/<PHASE>/<PLAN>.md" && \
mkdir -p "$(dirname "$IMPL")" && \
cp "$ACTIVE" "$IMPL" && \
git rm -f "$ACTIVE" && \
test -f "$IMPL" && ! test -f "$ACTIVE" && \
echo "SUCCESS: plan moved and deleted from active/" || \
echo "FAILED: verify manually"
```

### Checklist (every step is mandatory)

1. Update plan frontmatter: all todos to `status: completed`
2. Check all validation boxes `[x]`
3. `cp` the file from `active/` to `implemented/`
4. `git rm -f` the file from `active/` (stages deletion in git; unconditional, not behind `test -f`)
5. Verify: file exists in `implemented/` AND does NOT exist in `active/`
6. If verify fails, run `git rm -f` on the active path again and re-verify

**The file must ONLY exist in `implemented/` when done. Never in both locations. Never skip the `git rm` step.**

**Example**: If implementing "co-locate exchange code" work that relates to the rate-limiting plan at `.cursor/plans/active/0001-mvp-roadmap/02-connectivity/0002-rate-limiting.md`, move **that plan** to `implemented/`, not a separate standalone plan file.

---

## Anti-Patterns

| Don't | Do |
|-------|-----|
| Extract tasks from `## Tasks` prose | Parse `frontmatter.todos` array |
| Forget `lifecycle-management` todo | Always include as final todo |
| **Use `mv` to move plan files** | **Use `cp` + `git rm -f` (explicit copy then delete+stage)** |
| **Split copy/delete into separate tool calls** | **Run `cp` + `git rm -f` + verify in ONE shell command** |
| **Leave file in both locations** | **Always `git rm -f` from `active/` and verify deletion** |
| **Use conditional delete (`test -f && rm`)** | **Use unconditional `git rm -f` (always safe, always runs)** |
| **Use plain `rm -f`** | **Use `git rm -f` so deletion is staged in git** |
| Skip code-reviewer | Run after every implementation task |
| Create standalone plans for work that relates to existing roadmap plans | Update and move the original roadmap plan |
| Move standalone plan files instead of the referenced roadmap plan | Move the original plan file from `active/<ROADMAP>/<PHASE>/` |
| Forget to verify deletion | Always verify file does NOT exist in `active/` after delete |