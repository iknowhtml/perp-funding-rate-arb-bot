---
name: create-parallel-execution-plan
description: Generate PARALLEL-EXECUTION.md and worktree-config.sh from a set of related plans or META-PLAN.md. Use when you have 2+ plans that can be parallelized across worktrees.
---

# Create Parallel Execution Plan

Generate execution artifacts for parallel agent work via git worktrees. Given input plans and a dependency analysis, output PARALLEL-EXECUTION.md and worktree-config.sh.

## Input

- A set of related plans (e.g. 0001-chain-infrastructure.md, 0002-data-collector.md, 0003-impact-sampler.md)
- Or an existing META-PLAN.md with dependency graph
- Optional: existing PARALLEL-EXECUTION.md to update

## Workflow

### 1. Analyze Dependencies

Read each plan's todos. Build a dependency graph:
- **Hard dependency**: Cannot start without output from another task
- **Soft dependency**: Benefits from it but can use stubs

Use the Todo-Level Dependency Matrix pattern from META-PLAN.md.

### 2. Build Batches

- Group tasks into batches of max 4 agents (Cursor limitation)
- Batches execute sequentially (Batch N+1 only after Batch N completes)
- Within a batch, all agents run in parallel
- Respect dependency order: a task's dependencies must be in prior batches

### 3. Create File Ownership Matrix

Ensure **zero overlap** within a batch. No two agents in the same batch may touch the same file.

Document ownership per agent:
```
batch1-deps:      package.json, pnpm-lock.yaml
batch1-env:       src/lib/env/schema.ts, src/lib/config.ts, .env.example
batch2-chain:     src/lib/chain/*
batch2-gmx:       src/adapters/gmx/*
```

### 4. Generate Agent Prompts

**Critical**: Subagents have **zero conversation context**. Every prompt must be fully self-contained.

Each agent prompt MUST include:

1. **Worktree path** — The project directory for this agent (e.g. `$WORKTREE_ROOT/batch1-deps`)
2. **CODE_GUIDELINES.md key rules** — Inline the top 10 rules (arrow functions, Valibot, no any, no type casts, explicit return types, BigInt for money, kebab-case files, colocated tests, etc.)
3. **Current file contents** — For files being modified, read and embed the actual content so the agent sees the starting state
4. **Available imports** — List modules created in prior batches that this agent can import (e.g. `import { createArbitrumPublicClient } from "@/lib/chain"`)
5. **Verification commands** — `pnpm biome check --write .` / `pnpm typecheck` / `pnpm test:run <paths>`
6. **Commit message** — Exact conventional commit string

### 5. Generate worktree-config.sh

Use the config template. Replace placeholders:
- `BRANCH_PREFIX` — e.g. `phase0`
- `BATCH_1`, `BATCH_2`, ... — arrays with entry format `"<name>|<agent-type>|<merge-commit-message>"`
- `VERIFY_1`, `VERIFY_2`, ... — shell commands to run after each merge

The config MUST source the generic library:
```bash
source "$(git rev-parse --show-toplevel)/.cursor/scripts/worktree-lib.sh"
```

### 6. Output PARALLEL-EXECUTION.md

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

1. **worktree-config.sh** — In the plan directory (e.g. `.cursor/plans/active/<roadmap>/<phase>/worktree-config.sh`)
2. **PARALLEL-EXECUTION.md** — In the same directory as worktree-config.sh

## Relationship to Other Skills

- **create-implement-and-manage-plan**: Produces the input plans (Stage 2 of ADR-0028). Use it first to create plans; when 2+ plans can run in parallel, use this skill to generate execution artifacts.
- **execute-parallel-plan**: Consumes the output of this skill. Runs the batch execution.
- **ADR-0028**: Documents the full pipeline. Stages 3–4 are automated by this skill.

## Reference

- Library: `.cursor/scripts/worktree-lib.sh`
- Example: `.cursor/plans/implemented/0002-on-chain-pivot/00-feasibility/`
- Templates: `execution-plan-template.md`, `config-template.sh`
