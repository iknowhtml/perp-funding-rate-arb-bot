---
name: create-plan-and-implement
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
