---
name: create-plan
description: Draft development plans with structured todo metadata. Use Opus 4.6. **STOP after creating** — human must approve before implementation. For single-plan sequential work, hand off to execute-plan. For 2+ parallel plans, hand off to create-parallel-execution-plan + execute-parallel-plan.
---

# Create Plan (Stage 2)

Draft development plans from ADRs and requirements. **This skill ends with a plan ready for human approval.** Do not implement. After approval, use `execute-plan` (sequential) or `create-parallel-execution-plan` + `execute-parallel-plan` (parallel).

## Paths After Approval

| Scenario                                       | After human approves     | Next skill(s)                                                                 |
| ---------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------- |
| **Single plan** (one feature, one deliverable) | Human approves the plan  | `execute-plan` — task-by-task on main                                         |
| **2+ related plans** that can run in parallel  | Human approves the plans | `create-parallel-execution-plan` → `execute-parallel-plan` — worktree batches |

## Model

Use **Opus 4.6** for plan creation (superior reasoning, better at synthesizing patterns from codebase).

## Workflow

1. Analyze requirements, ADR, and codebase patterns
2. Draft the plan with Structured Todo Format (see below)
3. Append the Execution Preview section
4. Validate plan metadata and code examples
5. **STOP** — output the plan to `docs/plans/active/<plan>.plan.md` (or `docs/plans/active/<ROADMAP>/<PHASE>/<plan>.plan.md` when under a roadmap) and inform the user that approval is required before implementation

## Context Checklist

Before considering the plan complete, ensure it includes:

- [ ] **Code patterns**: Specific examples from codebase to follow
- [ ] **Relevant types**: Interfaces, types, Valibot schemas to use
- [ ] **File locations**: Where new files should go (`src/lib/`, `src/adapters/`, etc.)
- [ ] **File organization**: New modules follow [.cursor/rules/file-organization.mdc](../../rules/file-organization.mdc) — `index.ts` entry point, tests colocated with `*.test.ts` matching source, implementation files kebab-case or module-name
- [ ] **Test patterns**: How similar features are tested (Vitest, `vi.mock()`)
- [ ] **Error handling**: Expected error types and wrapping (CODE_GUIDELINES.md)

### Example Implementation Context Section

```markdown
## Implementation Context

### Code Patterns

- Factory pattern: `createXAdapter(config)` returns `XAdapter`
- See `src/adapters/` for reference

### Relevant Types

- Types from `src/adapters/types.ts`
- Valibot schemas: use `v.bigint()`, `v.date()` directly

### Test Patterns

- Mock external APIs with `vi.mock()`
- Colocate tests: `module.test.ts` next to `module.ts`
```

---

## Structured Todo Format (MANDATORY)

To enable the AI-Driven Development pipeline (Stages 3-4 automation), plan todos **MUST** use this rich schema. Without these fields, `create-parallel-execution-plan` and `execute-parallel-plan` cannot derive execution graphs or generate agent prompts.

```yaml
---
todos:
  - id: chain-client
    content: Create chain client for fetching on-chain data
    status: pending
    files:
      creates:
        - src/lib/chain/client.ts
        - src/lib/chain/client.test.ts
      modifies: []
    depends-on: []
    benefits-from: []
    agent-type: generalPurpose
    effort: medium
    context-refs:
      - CODE_GUIDELINES.md
      - docs/adrs/0020-contract-interaction-patterns.md

  - id: gmx-adapter-reads
    content: Create GMX adapter read layer for positions and market data
    status: pending
    files:
      creates:
        - src/adapters/gmx/reads.ts
        - src/adapters/gmx/reads.test.ts
      modifies:
        - src/adapters/gmx/index.ts
    depends-on:
      - chain-client
    benefits-from: []
    agent-type: generalPurpose
    effort: medium
    context-refs:
      - CODE_GUIDELINES.md
      - src/adapters/types.ts

  - id: lifecycle-management
    content: "Move plan to implemented/ (cp to implemented/, git rm -f from active/, verify deletion)"
    status: pending
    depends-on: [chain-client, gmx-adapter-reads]
---
```

See [docs/plans/PLAN_TEMPLATE.md](../../../docs/plans/PLAN_TEMPLATE.md) for the template.

Every plan MUST include `lifecycle-management` as the final todo.

### Field Reference

| Field            | Required | Purpose                                                           |
| ---------------- | -------- | ----------------------------------------------------------------- |
| `id`             | Yes      | Unique identifier, referenced by `depends-on`                     |
| `content`        | Yes      | Human-readable description                                        |
| `status`         | Yes      | `pending` / `in_progress` / `completed`                           |
| `files.creates`  | Yes      | Files this todo creates (new files)                               |
| `files.modifies` | No       | Existing files this todo modifies                                 |
| `depends-on`     | No       | Hard dependencies — other todo `id`s that must complete first     |
| `benefits-from`  | No       | Soft dependencies — helpful but not blocking                      |
| `agent-type`     | No       | `shell` / `generalPurpose` / `explore`. Default: `generalPurpose` |
| `effort`         | No       | Size estimate for batch bin-packing. Default: `medium` (small ~5min / medium ~10min / large ~20min) |
| `context-refs`   | No       | Files the agent should read before implementing                   |

---

## Execution Preview (MANDATORY)

Append an **Execution Preview** section at the end of every plan. Derived from DAG levels and batching, rendered for human review during the approval gate.

**Purpose**: Lets the reviewer sanity-check dependencies and batching before approving. Catches circular dependencies or missing blockers early.

**Required format** (append to the plan body after all task descriptions):

```markdown
## AI-Generated Execution Preview

Based on the dependencies above, execution will proceed as follows:

**Batch 1** (parallel)

- [ ] chain-client: Create chain client for fetching on-chain data

**Batch 2** (parallel)

- [ ] gmx-adapter-reads: Create GMX adapter read layer _(depends on chain-client)_

_Critical path: chain-client → gmx-adapter-reads (2 steps)_
```

For multi-plan execution, show batches across plans and highlight cross-plan dependencies.

---

## Plan Validation (Before Output)

**Before outputting the plan, validate BOTH plan metadata AND code examples.**

### Plan Metadata Checklist

- [ ] **Valid IDs**: All `depends-on` and `benefits-from` IDs resolve to a valid todo `id`
- [ ] **File creates check**: `files.creates` targets do NOT already exist in the codebase
- [ ] **File modifies check**: `files.modifies` targets DO exist in the codebase
- [ ] **Context refs check**: All `context-refs` paths exist in the codebase
- [ ] **No circular dependencies**: The dependency graph is a valid DAG
- [ ] **Execution Preview**: Matches the declared dependencies

### Code Example Checklist

For every code block in the plan, verify against `CODE_GUIDELINES.md` and Biome:

**CODE_GUIDELINES**: Arrow functions, no `any`, no type casts, Valibot validation, explicit return types for exports, BigInt for money, kebab-case files, colocated tests, factory over class.

**File organization** ([.cursor/rules/file-organization.mdc](../../rules/file-organization.mdc)): New `src/lib/` or `src/adapters/` modules must have `index.ts` entry point; tests colocated as `*.test.ts` matching source file; implementation files kebab-case or module-name.

**Biome**: 2-space indent, Node.js import protocol, no unused imports, no unnecessary template literals.

Plans with non-compliant metadata or code examples create implementation debt. Fix in planning phase.

### ADR & Plan Drift Reconciliation

If the plan deviates from the ADR, check the codebase and reconcile the plan and ADRs accordingly.

---

## Complex Plans: Decompose into Sub-Plans

When a plan grows too large, decompose it into sub-plans inside a directory. The structure is fractal — the same pattern repeats at every level.

### When to decompose

- 8+ todos in a single plan
- Todos span multiple domains (API, frontend, infra)
- Multiple `large` effort estimates
- Mixed concerns that benefit from independent lifecycles

### How to structure

1. Create a directory named after the parent plan: `NNNN-kebab-case/`
2. Place the parent plan inside: `NNNN-kebab-case/NNNN-kebab-case.plan.md`
3. Create sub-plans with short numbering: `01-sub-topic.plan.md`, `02-sub-topic.plan.md`
4. The parent plan's todos reference the sub-plans (each sub-plan becomes a todo in the parent)

```
docs/plans/active/
└── 0010-gmx-integration/
    ├── 0010-gmx-integration.plan.md
    ├── 01-chain-layer.plan.md
    ├── 02-adapter-reads.plan.md
    └── 03-adapter-writes.plan.md
```

---

## Roadmap / Phase Structure

In this project, plans may also live under a roadmap and phase: `docs/plans/active/<ROADMAP>/<PHASE>/<plan>.md` (e.g. `0002-on-chain-pivot/01-mvp-execution/0001-transaction-lifecycle.md`). When moving to implemented, use the same structure under `docs/plans/implemented/<ROADMAP>/<PHASE>/`.

---

## Anti-Patterns

| Don't                                                | Do                                                          |
| ---------------------------------------------------- | ----------------------------------------------------------- |
| Implement without human approval                     | **STOP after creating the plan** — wait for approval        |
| Use flat todos without `files`/`depends-on` metadata | Use the full Structured Todo Format for pipeline automation |
| Skip the Execution Preview                           | Always generate `## AI-Generated Execution Preview`         |
| Skip plan metadata validation                        | Run both metadata and code example checklists               |
| Extract tasks from `## Tasks` prose                  | Use `frontmatter.todos` as the source of truth              |
| Forget `lifecycle-management` todo                   | Always include as final todo                                |

---

## Relationship to Other Skills

- **execute-plan**: After human approves a single plan, use this for sequential task-by-task implementation on main
- **create-parallel-execution-plan**: After human approves 2+ plans, use this to generate execution artifacts
- **execute-parallel-plan**: Runs the batches produced by `create-parallel-execution-plan`
- **create-implement-and-manage-plan**: Alternative skill that creates and implements in one flow; use create-plan + execute-plan when you want human approval between plan and implementation.
- **Pipeline doc** (if present): e.g. `docs/AI-DRIVEN-DEVELOPMENT.md` — Full 7-stage pipeline. Stage 2 = this skill.
