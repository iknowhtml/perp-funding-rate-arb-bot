---
name: create-parallel-execution-plan
description: Generate PARALLEL-EXECUTION.md and worktree-config.sh from a set of related plans or META-PLAN.md. Use when you have 2+ plans that can be parallelized across worktrees.
---

# Create Parallel Execution Plan

Generate execution artifacts for parallel agent work via git worktrees. Given input plans with **structured todo metadata**, output PARALLEL-EXECUTION.md and worktree-config.sh into the **plan directory** for each plan (see [Plan Directory Structure](#plan-directory-structure) below).

This skill automates **Stages 3-4** of the AI-Driven Development pipeline. Input plans should follow the **Structured Todo Format** from [create-plan](../create-plan/SKILL.md).

## Plan Directory Structure

When creating or updating plans (and their parallel-execution artifacts), use this structure. Each plan lives in its own directory; the plan file is `plan.md`. PARALLEL-EXECUTION.md and worktree-config.sh live in the **same directory** as that plan's `plan.md`.

**Required paths:**

```
.cursor/plans/active/<ROADMAP>/<PHASE>/<NNNN>-<kebab-slug>/plan.md
.cursor/plans/active/<ROADMAP>/<PHASE>/<NNNN>-<kebab-slug>/PARALLEL-EXECUTION.md
.cursor/plans/active/<ROADMAP>/<PHASE>/<NNNN>-<kebab-slug>/worktree-config.sh
```

- **ROADMAP**: e.g. `0002-on-chain-pivot`. See `.cursor/plans/active/<ROADMAP>/README.md` for the roadmap.
- **PHASE**: e.g. `01-mvp-execution`, `02-optimization/simulation`, `02-optimization/deployment`, `02-optimization/production`.
- **Directory name**: `NNNN-kebab-slug` (e.g. `0001-transaction-lifecycle`, `0002-gmx-adapter-types`).
- **Plan file**: Always `plan.md` inside that directory (not `<NNNN>-<slug>.md` at phase root).

**Example:**

```
01-mvp-execution/
├── 0001-transaction-lifecycle/
│   ├── plan.md
│   ├── PARALLEL-EXECUTION.md
│   └── worktree-config.sh
├── 0002-gmx-adapter-types/
│   └── plan.md
└── 0003-gmx-adapter-reads/
    └── plan.md
```

**When outputting from this skill:**

1. Identify the plan directory from the input plan path: if the plan is at `.../01-mvp-execution/0001-transaction-lifecycle/plan.md`, output PARALLEL-EXECUTION.md and worktree-config.sh into `.../01-mvp-execution/0001-transaction-lifecycle/`.
2. If the plan is still a single file at phase root (e.g. `.../01-mvp-execution/0001-transaction-lifecycle.md`), first create the directory `0001-transaction-lifecycle/`, move the plan to `0001-transaction-lifecycle/plan.md`, then place PARALLEL-EXECUTION.md and worktree-config.sh in that same directory.
3. In worktree-config.sh, set paths so they point to this directory (e.g. `source .cursor/plans/active/0002-on-chain-pivot/01-mvp-execution/0001-transaction-lifecycle/worktree-config.sh`).
4. Roadmap README links to a plan must point to `./<PHASE>/<NNNN>-<slug>/plan.md`. When moving to implemented, move the **entire** plan directory to `implemented/<ROADMAP>/<PHASE>/<NNNN>-<kebab-slug>/`.

## Input

- A set of related plans with **Structured Todo Format** (see [create-plan](../create-plan/SKILL.md))
- Or an existing META-PLAN.md with dependency graph
- Optional: existing PARALLEL-EXECUTION.md to update

### Required Plan Metadata

Input plans **MUST** have todos with the rich schema (from `create-plan`):

```yaml
todos:
  - id: task-id
    content: Task description
    status: pending
    files:
      creates: [new-file-paths]
      modifies: [existing-file-paths]
    depends-on: [other-todo-ids]
    agent-type: generalPurpose
    context-refs: [files-to-read]
```

If any plan is missing `files` or `depends-on` metadata, **STOP**. Use `create-plan` to enrich the plan before proceeding. Without this metadata, the execution graph and file ownership matrix cannot be derived correctly.

## Workflow

### 1. Validate Plan Metadata

Before building the graph, verify:

- [ ] All `depends-on` IDs resolve to valid todo `id`s (within or across plans)
- [ ] All `files.creates` paths do NOT already exist
- [ ] All `files.modifies` paths DO exist
- [ ] All `context-refs` paths exist
- [ ] No circular dependencies

If validation fails, report errors and stop.

### 2. Analyze Dependencies and Build Execution Graph

Read each plan's todos. Build a dependency graph:

- **Hard dependency** (`depends-on`): Cannot start without output from another task
- **Soft dependency** (`benefits-from`): Benefits from it but can use stubs

Derive execution levels via topological sort; group todos into parallelizable tiers. Use the Todo-Level Dependency Matrix pattern from META-PLAN.md when present.

### 3. Build Batches

- Group tasks into batches of max 4 agents (Cursor limitation)
- Batches execute sequentially (Batch N+1 only after Batch N completes)
- Within a batch, all agents run in parallel
- Respect dependency order: a task's dependencies must be in prior batches

### 4. Create File Ownership Matrix

Ensure **zero overlap** within a batch. No two agents in the same batch may touch the same file.

Document ownership per agent:
```
batch1-deps:      package.json, pnpm-lock.yaml
batch1-env:       src/lib/env/schema.ts, src/lib/config.ts, .env.example
batch2-chain:     src/lib/chain/*
batch2-gmx:       src/adapters/gmx/*
```

### 5. Generate Agent Prompts

**Critical**: Subagents have **zero conversation context**. Every prompt must be fully self-contained.

Each agent prompt MUST include:

1. **Worktree path** — The project directory for this agent (e.g. `$WORKTREE_ROOT/batch1-deps`)
2. **CODE_GUIDELINES.md key rules** — Inline the top 10 rules (arrow functions, Valibot, no any, no type casts, explicit return types, BigInt for money, kebab-case files, colocated tests, etc.)
3. **Current file contents** — For files being modified, read and embed the actual content so the agent sees the starting state
4. **Available imports** — List modules created in prior batches that this agent can import (e.g. `import { createArbitrumPublicClient } from "@/lib/chain"`)
5. **Verification commands** — `pnpm biome check --write .` / `pnpm typecheck` / `pnpm test:run <paths>`
6. **Commit message** — Exact conventional commit string

### 6. Generate worktree-config.sh

Use the config template. Replace placeholders:
- `BRANCH_PREFIX` — e.g. `phase0`
- `BATCH_1`, `BATCH_2`, ... — arrays with entry format `"<name>|<agent-type>|<merge-commit-message>"`
- `VERIFY_1`, `VERIFY_2`, ... — shell commands to run after each merge

The config MUST set REPO from the script directory so it works when the script lives in the plan directory (e.g. `.cursor/plans/active/<roadmap>/<phase>/<NNNN>-<slug>/worktree-config.sh`):

```bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)"
source "$REPO/.cursor/scripts/worktree-lib.sh"
```

### 7. Output PARALLEL-EXECUTION.md

Use the execution-plan-template.md. Fill in:
- Plan reference (META-PLAN.md or input plans)
- Batch overview
- Per-batch: setup snippet, agent prompts, merge/verify/cleanup snippet
- File Ownership Matrix
- Conflict resolution guidance

## Agent Prompt Generation Rules

| Rule | Why |
|------|-----|
| Inline CODE_GUIDELINES rules | Subagent has no access to project rules |
| Include current file contents | Subagent cannot read files; needs context embedded |
| List available imports | Subagent may not know what prior batches produced |
| Include verification commands | Subagent must run before committing |
| Exact commit message | Ensures consistent merge commit history |
| Worktree path as project dir | Subagent must know where to work |

## Output Files

1. **worktree-config.sh** — In the plan directory: `.cursor/plans/active/<ROADMAP>/<PHASE>/<NNNN>-<kebab-slug>/worktree-config.sh` (same directory as that plan's `plan.md`).
2. **PARALLEL-EXECUTION.md** — In the same plan directory as worktree-config.sh and plan.md.

See [Plan Directory Structure](#plan-directory-structure) above. Do not place PARALLEL-EXECUTION.md or worktree-config.sh at phase root; they belong in the plan's directory.

## Relationship to Other Skills

- **create-plan**: Produces input plans with Structured Todo Format (Stage 2). Use it first to create plans; when 2+ plans can run in parallel, use this skill to generate execution artifacts.
- **create-implement-and-manage-plan**: Alternative that creates and implements in one flow; use create-plan + execute-plan when you want human approval between plan and implementation.
- **execute-parallel-plan**: Consumes the output of this skill. Runs the batch execution.
- **ADR-0028** (if present): Documents the full pipeline. Stages 3–4 are automated by this skill.

## Reference

- Library: `.cursor/scripts/worktree-lib.sh`
- Example: `.cursor/plans/implemented/0002-on-chain-pivot/00-feasibility/`
- Templates: `execution-plan-template.md`, `config-template.sh`
