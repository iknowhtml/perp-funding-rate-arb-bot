# AI-Driven Development Process

This document describes the AI-agent-driven development workflow used in this project. It defines a seven-stage pipeline from idea to merged code, with explicit ownership (human, AI, or both) at each stage.

## Table of Contents

1. [Overview](#overview)
2. [The Pipeline](#the-pipeline)
3. [Stage 1: Problem to ADR](#stage-1-problem--adr-human--ai-research)
4. [Stage 2: ADR to Plans](#stage-2-adr--plans-ai-drafts-human-approves)
   - [Execution Preview](#execution-preview)
5. [Stage 3: Plans to Execution Graph](#stage-3-plans--execution-graph-fully-automated)
   - [Plan Validation](#plan-validation-between-stage-2-and-3)
6. [Stage 4: Execution Graph to Batch Plan](#stage-4-execution-graph--batch-plan-fully-automated)
7. [Stage 5: Batch Plan to Implementation](#stage-5-batch-plan--implementation-orchestrator--sub-agents)
   - [Break Glass: Manual Takeover](#break-glass-manual-takeover)
8. [Stage 6: Quality Gate](#stage-6-quality-gate-automated-agents)
9. [Stage 7: Human Review](#stage-7-human-review--feedback-loop)
10. [Judgment Gradient](#judgment-gradient)
11. [Mapping to Team Processes](#mapping-to-software-engineering-team-processes)
12. [When to Use the Full Pipeline](#when-to-use-the-full-pipeline)
13. [Consequences](#consequences)
14. [Cursor Skills Mapping](#cursor-skills-mapping)
15. [Troubleshooting](#troubleshooting)
16. [References](#references)

---

## Overview

The development workflow relies on AI agents for the bulk of implementation work, but the pipeline from "idea" to "merged code" involves stages that vary in how much human judgment they require.

An AI-native workflow should keep humans in the loop where judgment is highest, automate the mechanical middle, and provide clear feedback loops.

---

## The Pipeline

Seven stages, each with an explicit owner and a defined artifact:

```
Stage 1: Problem --> ADR                    [Human + AI research]
Stage 2: ADR --> Plan(s)                    [AI drafts, Human approves]
Stage 3: Plan(s) --> Execution Graph        [Fully automated]
Stage 4: Execution Graph --> Batch Plan     [Fully automated]
Stage 5: Batch Plan --> Implementation      [Orchestrator + sub-agents]
Stage 6: Quality Gate                       [Automated agents]
Stage 7: Human Review + Feedback Loop       [Human]
```

---

## Stage 1: Problem --> ADR (Human + AI Research)

**Owner**: Human authors, AI assists with research.

**Artifact**: `docs/adrs/NNNN-title.md`

The ADR remains human-owned. Strategic decisions — what to build, which trade-offs to accept, how this fits the architecture — require human judgment. AI assists by:

- Searching documentation and codebases for prior art (MCP servers, Context7)
- Drafting the "Context" and "References" sections from codebase analysis
- Flagging conflicts with existing ADRs
- Proposing the "Consequences" section based on pattern analysis

**Gate**: Human approves the ADR before proceeding to planning.

---

## Stage 2: ADR --> Plan(s) (AI Drafts, Human Approves)

**Owner**: AI generates, human reviews and approves.

**Artifact**: `docs/plans/active/<plan>.plan.md` (simple), `docs/plans/active/<plan-dir>/<plan>.plan.md` (complex with sub-plans), or `docs/plans/active/<ROADMAP>/<PHASE>/<plan>.md` (roadmap/phase in this project)

Given the ADR, codebase context, [CODE_GUIDELINES.md](../CODE_GUIDELINES.md), and existing plans, the AI produces structured plans. Plan files use the `.plan.md` suffix (or `.md` under roadmap/phase). The critical requirement: **plan todos must carry machine-readable metadata** that enables automated derivation of execution graphs.

### Structured Todo Format

Each todo in the plan frontmatter must include:

```yaml
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
```

See the create-plan skill (`.cursor/skills/create-plan/SKILL.md`) and `docs/plans/PLAN_TEMPLATE.md` for the full field reference and examples.

### Execution Preview

The AI must append an **Execution Preview** section at the end of the plan. This is derived from the same logic Stages 3–4 use (DAG levels, batching) but rendered for human review during the approval gate.

**Required format** (append to the plan body): see create-plan skill for the exact heading and format (`## AI-Generated Execution Preview`, batches, _(depends on X)_, _Critical path: …_).

**Gate**: Human reviews plan — including the Execution Preview — adjusts scope, dependencies, sequencing — then approves.

### Plan Validation (Between Stage 2 and 3)

The **create-plan** skill runs "Plan Validation (Before Output)" (metadata + code example checklists) before handing the plan to the human. The same checks can be re-run after approval, before Stage 3.

Before the execution graph is derived, a validation step runs against the approved plan:

1. **Reference check**: Verify that every path in `context-refs` exists in the codebase.
2. **Dependency check**: Verify that every `depends-on` and `benefits-from` ID resolves to a valid todo `id`.
3. **File declaration check**: Warn if `files.creates` targets a path that already exists, or if `files.modifies` targets a path that does not exist.

### Breaking Down Complex Plans

When a plan grows too large (8+ todos, mixed domains, or multiple `large` effort estimates), decompose it into sub-plans inside a directory. The structure is fractal — the same pattern repeats at every level.

**Directory layout:**

```
docs/plans/active/
├── 0001-setup.plan.md
├── 0010-gmx-integration/
│   ├── 0010-gmx-integration.plan.md
│   ├── 01-chain-layer.plan.md
│   ├── 02-adapter-reads.plan.md
│   └── 03-adapter-writes.plan.md
```

In this project, plans may also live under a **roadmap and phase**: `docs/plans/active/<ROADMAP>/<PHASE>/<plan>.md` (e.g. `0002-on-chain-pivot/01-mvp-execution/0001-transaction-lifecycle.md`). When moving to implemented, use the same structure under `docs/plans/implemented/<ROADMAP>/<PHASE>/`.

---

## Stage 3: Plan(s) --> Execution Graph (Fully Automated)

**Owner**: AI (or deterministic script) — zero human involvement.

**Artifact**: Execution graph (generated, not hand-authored).

Given structured plan todos with `depends-on` and `files` metadata, the derivation is:

1. **Build the DAG**: Topological sort of todos by `depends-on` edges.
2. **Compute execution levels**: Group todos into parallelizable tiers.
3. **Detect file conflicts**: Within each level, check that no two todos share files in `files.creates` or `files.modifies`. Soft-lock shared infrastructure files (e.g. `index.ts`, `package.json`, `tsconfig.json`) to a single todo per batch.
4. **Identify critical path**: Longest chain through the DAG.
5. **Cross-plan analysis**: When multiple plans are executed together, merge their DAGs and resolve cross-plan dependencies.

---

## Stage 4: Execution Graph --> Batch Plan (Fully Automated)

**Owner**: AI (or deterministic script) — zero human involvement.

**Artifact**: Batch plan (generated, not hand-authored).

1. **Bin levels into batches**: Respect max concurrency (e.g. 4 sub-agents per batch).
2. **Assign agent types**: From each todo's `agent-type` field.
3. **Generate worktree config**: Branch names, worktree paths, merge order.
4. **Generate agent prompts**: Composite of todo `content`, coding rules from `CODE_GUIDELINES.md`, `context-refs` files, dependency outputs, worktree path, and conventional commit message.

Prompt generation is **templated**, not hand-written.

---

## Stage 5: Batch Plan --> Implementation (Orchestrator + Sub-Agents)

**Owner**: Orchestrator agent coordinates, sub-agents implement.

**Artifact**: Code on the current branch, one merge commit per agent.

The orchestrator loop: create worktrees per batch, launch sub-agents in parallel, wait for completion, merge each branch into main (--no-ff), verify (typecheck + tests + lint), cleanup worktrees, proceed to next batch.

**Moving plans to implemented**: Use `cp` + `git rm -f` (never `mv`); see execute-plan skill.

### Break Glass: Manual Takeover

If the orchestrator hangs or a batch produces unrecoverable merge conflicts:

1. Identify which batches have merged and which are in flight.
2. Kill stuck agent processes.
3. Cherry-pick or manually merge useful commits from in-flight worktree branches onto `main`.
4. Clean up with worktree cleanup from `.cursor/scripts/worktree-lib.sh`.
5. Resume remaining batches or fall back to sequential implementation via `execute-plan`.

---

## Stage 6: Quality Gate (Automated Agents)

**Owner**: Specialized agents — no human involvement.

| Check         | Command                  | What It Checks                |
| ------------- | ------------------------ | ----------------------------- |
| Code reviewer | `code-reviewer` subagent | CODE_GUIDELINES.md compliance |
| TypeScript    | `pnpm typecheck`         | Type errors via `tsc --noEmit` |
| Biome         | `pnpm lint` / `pnpm biome check .` | Linting and formatting   |

If any check reports issues, fix on main and re-run the gate until clean.

---

## Stage 7: Human Review + Feedback Loop

**Owner**: Human.

Evaluate: Does the code solve the problem stated in the ADR? Architectural concerns? Refinement needed?

| Situation                      | Action                            | Restart From   |
| ------------------------------ | --------------------------------- | -------------- |
| Direction is wrong             | Write a new ADR                   | Stage 1        |
| Decomposition is wrong         | Modify the plan                   | Stage 3        |
| Incremental improvement needed | Open a follow-up plan              | Stage 2        |
| Accept                         | Move plans to `implemented/`       | Done           |

---

## Judgment Gradient

| Stage              | Judgment Level | Owner                      | Automated? |
| ------------------ | -------------- | -------------------------- | ---------- |
| 1. ADR             | Very High      | Human (AI assists)         | No         |
| 2. Plan            | High           | AI drafts, human approves  | Partially  |
| 3. Execution Graph | Very Low       | AI                         | **Yes**    |
| 4. Batch Plan      | Very Low       | AI                         | **Yes**    |
| 5. Implementation  | Variable       | AI agents                  | **Yes**    |
| 6. Quality Gate    | None           | AI agents                  | **Yes**    |
| 7. Review          | High           | Human                      | No         |

---

## When to Use the Full Pipeline

| Scenario                                | Use Pipeline? | Why                             |
| --------------------------------------- | ------------- | ------------------------------- |
| Multi-file feature across 3+ plans       | **Yes**       | Full parallelization benefit    |
| Single plan, 5+ todos with dependencies | **Yes**       | DAG analysis and batching help  |
| Single plan, 2-3 independent todos      | **Optional**  | Overhead may not be worth it    |
| Single-file change or config tweak      | **No**        | Direct implementation is faster |
| Bug fix in known location               | **No**        | Direct fix, no planning needed  |

---

## Cursor Skills Mapping

| Stage               | Skill / Tool                                     | Notes                                                                 |
| ------------------- | ------------------------------------------------ | --------------------------------------------------------------------- |
| 2. Plan creation    | `create-plan`                                    | Produces plans with todos and Execution Preview. STOP for approval.  |
| 3. Execution graph  | `create-parallel-execution-plan`                 | Dependency analysis, batches, file ownership.                         |
| 4. Batch plan       | `create-parallel-execution-plan`                 | PARALLEL-EXECUTION.md, worktree-config.sh, agent prompts.            |
| 5a. Sequential impl | `execute-plan`                                   | Task-by-task on main. Moving to implemented: `cp` + `git rm -f`.     |
| 5b. Parallel impl   | `execute-parallel-plan`                          | Worktree batches, merge, verify.                                      |
| 6. Quality gate     | `review-code-quality` + `pnpm typecheck` + Biome | Run after implementation.                                            |

**Single plan**: `create-plan` (plan, human approves) --> `execute-plan` (sequential implementation).

**Multi-plan parallel**: `create-plan` (plans, human approves) --> `create-parallel-execution-plan` (artifacts) --> `execute-parallel-plan` (run).

Stage 2 output path and Execution Preview format are defined in the create-plan skill; Stage 5a move procedure is in the execute-plan skill.

---

## Troubleshooting

### Plan missing structured metadata?

Use `create-plan` to enrich the existing todos with the Structured Todo Format (`files.creates`, `files.modifies`, `depends-on`, `agent-type`, `context-refs`). Add the `## AI-Generated Execution Preview` section. Re-run `create-parallel-execution-plan`.

### Execution Preview doesn't match actual dependencies?

Re-read the plan's `depends-on` fields, regenerate the Execution Preview section, and if running parallel execution, regenerate `PARALLEL-EXECUTION.md` via `create-parallel-execution-plan`.

### Circular dependency detected?

Identify the cycle, break it by moving one edge to `benefits-from` (soft dependency) instead of `depends-on`.

### Orchestrator hung or crashed mid-batch?

See **Break Glass: Manual Takeover** in Stage 5.

---

## References

- Worktree library: `.cursor/scripts/worktree-lib.sh`
- Skills: `.cursor/skills/create-plan/`, `.cursor/skills/execute-plan/`, `.cursor/skills/create-parallel-execution-plan/`, `.cursor/skills/execute-parallel-plan/`
- Worktree execution rule: `.cursor/rules/worktree-execution.mdc`
- Plan lifecycle rule: `.cursor/rules/plan-lifecycle.mdc`
- Coding conventions: [CODE_GUIDELINES.md](../CODE_GUIDELINES.md)
- ADRs: `docs/adrs/`
