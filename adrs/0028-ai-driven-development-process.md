# ADR 0028: AI-Driven Development Process

- **Status:** Proposed
- **Date:** 2026-02-13
- **Owners:** -
- **Related:**
  - [ADR-0009: Development Tooling](0009-dev-tooling.md)
  - [ADR-0022: Regime-Based GMX Arb Bot](0022-regime-based-gmx-arb.md)

---

## Context

We have evolved a development workflow where AI agents do the bulk of implementation work, but the pipeline from "idea" to "merged code" still requires significant manual intermediary steps. The current flow:

1. **Human writes ADR** — architectural decision with context, trade-offs, consequences
2. **Human distills ADR into plans** — implementation plans with todos, scoped to specific deliverables
3. **Human writes meta-analysis** — dependency graph, critical path, execution levels
4. **Human writes parallel execution plan** — batches, worktree config, agent prompts
5. **Orchestrator agent runs batches** — sub-agents implement in git worktrees
6. **Quality gate agents** — lint, typecheck, code review
7. **Human reviews result**

Steps 3 and 4 are largely **mechanical derivations** from the structured plan data. The meta-analysis is a topological sort of todo dependencies. The parallel execution plan is a bin-packing of the sorted levels into batches constrained by concurrency limits. Both can be automated if the plan todos carry sufficient structured metadata.

The core insight: **the ratio of human judgment to mechanical work varies by stage**. ADRs require high judgment (strategic trade-offs, problem framing). Plans require medium judgment (decomposition, scoping). Meta-analysis and batch planning require near-zero judgment — they are graph algorithms on structured input. Implementation is variable. Quality gates are fully automated.

An AI-native workflow should keep humans in the loop where judgment is highest, automate the mechanical middle, and provide clear feedback loops.

---

## Decision

### The Pipeline

We adopt a seven-stage pipeline where each stage has an explicit owner (human, AI, or both) and produces a defined artifact:

```
Stage 1: Problem → ADR                    [Human + AI research]
Stage 2: ADR → Plan(s)                    [AI drafts, Human approves]
Stage 3: Plan(s) → Execution Graph        [Fully automated]
Stage 4: Execution Graph → Batch Plan     [Fully automated]
Stage 5: Batch Plan → Implementation      [Orchestrator + sub-agents]
Stage 6: Quality Gate                     [Automated agents]
Stage 7: Human Review + Feedback Loop     [Human]
```

```
                 ┌──────────────────────────────────────────────┐
                 │              HUMAN JUDGMENT ZONE              │
                 │                                              │
 ┌──────────┐   │  ┌──────────┐       ┌───────────────────┐    │
 │ Research │──▶│  │   ADR    │──────▶│  Plan (approve)   │    │
 │  (AI)    │   │  │ (Human)  │       │  (AI draft)       │    │
 └──────────┘   │  └──────────┘       └────────┬──────────┘    │
                 │                              │ ✓ approved    │
                 └──────────────────────────────┼───────────────┘
                                                │
                 ┌──────────────────────────────┼───────────────┐
                 │           AUTOMATION ZONE     │               │
                 │                               ▼               │
                 │  ┌───────────────┐   ┌───────────────────┐   │
                 │  │  Exec Graph   │──▶│   Batch Plan      │   │
                 │  │  (derived)    │   │   (derived)       │   │
                 │  └───────────────┘   └────────┬──────────┘   │
                 │                               │               │
                 │                               ▼               │
                 │  ┌───────────────────────────────────────┐   │
                 │  │  Orchestrator                          │   │
                 │  │  ┌─────────┐ ┌─────────┐ ┌─────────┐  │   │
                 │  │  │ Agent 1 │ │ Agent 2 │ │ Agent 3 │  │   │
                 │  │  │ (wt)    │ │ (wt)    │ │ (wt)    │  │   │
                 │  │  └─────────┘ └─────────┘ └─────────┘  │   │
                 │  │       │           │           │        │   │
                 │  │       └──── merge ──── merge ──────────┘   │
                 │  │                    │                       │
                 │  │                    ▼                       │
                 │  │  ┌────────────────────────────────────┐   │
                 │  │  │ Quality Gate (lint/type/review)     │   │
                 │  │  └────────────────────────────────────┘   │
                 │  └───────────────────────────────────────────┘│
                 └──────────────────────────────┼───────────────┘
                                                │
                 ┌──────────────────────────────┼───────────────┐
                 │              HUMAN REVIEW     ▼               │
                 │         ┌───────────────────────┐            │
                 │         │  Accept / Iterate     │            │
                 │         └───────────────────────┘            │
                 └──────────────────────────────────────────────┘
```

---

### Stage 1: Problem → ADR (Human + AI Research)

**Owner**: Human authors, AI assists with research.

**Artifact**: `adrs/NNNN-title.md`

The ADR remains human-owned. Strategic decisions — what to build, which trade-offs to accept, how this fits the architecture — require human judgment. AI assists by:

- Searching documentation and codebases for prior art (MCP servers, Context7)
- Drafting the "Context" and "References" sections from codebase analysis
- Flagging conflicts with existing ADRs
- Proposing the "Consequences" section based on pattern analysis

**Gate**: Human approves the ADR before proceeding to planning.

---

### Stage 2: ADR → Plan(s) (AI Drafts, Human Approves)

**Owner**: AI generates, human reviews and approves.

**Artifact**: `.cursor/plans/active/<roadmap>/<phase>/<plan>.md`

Given the ADR, codebase context, `CODE_GUIDELINES.md`, and existing plans, the AI produces structured plans. The critical change from the current workflow: **plan todos must carry machine-readable metadata** that enables automated derivation of execution graphs.

#### Structured Todo Format

Each todo in the plan frontmatter must include:

```yaml
todos:
  - id: gmx-reader-rest
    content: Create GMX Reader + REST API helpers for market data
    status: pending
    files:
      creates:
        - src/adapters/gmx/reader.ts
        - src/adapters/gmx/reader.test.ts
      modifies:
        - src/adapters/gmx/index.ts
    depends-on:
      - public-client       # hard: cannot start without this
      - gmx-contracts       # hard: needs contract addresses
    benefits-from:
      - chain-constants     # soft: useful but can stub
    agent-type: generalPurpose
    effort: medium           # small (~5min) / medium (~10min) / large (~20min)
    context-refs:            # files the implementing agent needs to read
      - CODE_GUIDELINES.md
      - src/lib/chain/client.ts
      - src/adapters/gmx/contracts.ts
      - adrs/0020-contract-interaction-patterns.md
```

#### Field Reference

| Field | Required | Purpose |
|-------|----------|---------|
| `id` | Yes | Unique identifier, referenced by `depends-on` |
| `content` | Yes | Human-readable description |
| `status` | Yes | `pending` / `in_progress` / `completed` |
| `files.creates` | Yes | Files this todo creates (new files) |
| `files.modifies` | No | Existing files this todo modifies |
| `depends-on` | No | Hard dependencies — other todo `id`s that must complete first |
| `benefits-from` | No | Soft dependencies — helpful but not blocking |
| `agent-type` | No | `shell` / `generalPurpose` / `explore`. Default: `generalPurpose` |
| `effort` | No | Size estimate for batch bin-packing. Default: `medium` |
| `context-refs` | No | Files the agent should read before implementing |

**Why this structure matters**: `depends-on` enables the DAG. `files.creates` + `files.modifies` enable file ownership conflict detection. `agent-type` and `effort` enable batch assignment. `context-refs` enable prompt generation. Without these fields, the middle stages cannot be automated.

**Gate**: Human reviews plan — adjusts scope, dependencies, sequencing — then approves.

---

### Stage 3: Plan(s) → Execution Graph (Fully Automated)

**Owner**: AI (or deterministic script) — zero human involvement.

**Artifact**: Execution graph (generated, not hand-authored). Replaces manual `META-PLAN.md`.

Given structured plan todos with `depends-on` and `files` metadata, the derivation is:

1. **Build the DAG**: Topological sort of todos by `depends-on` edges.
2. **Compute execution levels**: Group todos into parallelizable tiers. Todos at the same level have no mutual dependencies.
3. **Detect file conflicts**: Within each level, check that no two todos share files in `files.creates` or `files.modifies`. If they do, move one to the next level.
4. **Identify critical path**: Longest chain through the DAG. Flag the bottleneck todos.
5. **Cross-plan analysis**: When multiple plans are being executed together, merge their DAGs and resolve cross-plan dependencies.

#### Example Derivation

Given these todos:

```
A (no deps) ──▶ C ──▶ E ──▶ F
B (no deps) ──▶ D ──────────▶ F
```

Derived execution levels:

```
Level 0: [A, B]       (no deps, parallel)
Level 1: [C, D]       (A→C, B→D, parallel)
Level 2: [E]          (C→E)
Level 3: [F]          (E→F, D→F, both must complete)
```

Critical path: `A → C → E → F` (length 4, vs `B → D → F` length 3).

---

### Stage 4: Execution Graph → Batch Plan (Fully Automated)

**Owner**: AI (or deterministic script) — zero human involvement.

**Artifact**: Batch plan (generated, not hand-authored). Replaces manual `PARALLEL-EXECUTION.md`.

Given the execution graph plus operational constraints, the derivation is:

1. **Bin levels into batches**: Respect max concurrency (e.g., 4 sub-agents per batch). A single level with 6 todos becomes two batches.
2. **Assign agent types**: From each todo's `agent-type` field.
3. **Generate worktree config**: Branch names (`phase0/<batch>-<id>`), worktree paths, merge order.
4. **Generate agent prompts**: Composite of:

| Prompt Section | Source |
|----------------|--------|
| What to build | Todo `content` |
| Coding rules | `CODE_GUIDELINES.md` (relevant sections) |
| Available context | Files listed in `context-refs` (read and injected) |
| What already exists | Dependency outputs — types, interfaces from earlier batches |
| Where to work | Worktree path, branch name |
| What to commit | Conventional commit message derived from todo |

Prompt generation is **templated**, not hand-written. The template interpolates todo metadata, guideline excerpts, and codebase context into a self-contained prompt.

---

### Stage 5: Batch Plan → Implementation (Orchestrator + Sub-Agents)

**Owner**: Orchestrator agent coordinates, sub-agents implement.

**Artifact**: Code on `main`, one merge commit per agent.

The orchestrator loop:

```
for each batch in batchPlan.batches:
    1. Create worktrees for all agents in this batch
    2. Launch sub-agents in parallel (up to max concurrency)
    3. Wait for all agents in batch to complete
    4. Merge each agent's branch into main (first-done-first-merged, --no-ff)
    5. Verify: typecheck + tests + lint on main
    6. If verify fails → fix on main, re-verify
    7. Cleanup worktrees and branches
    8. Proceed to next batch (branches from updated main)
```

Key operational rules:

- Sub-agents in the same batch **cannot read each other's output** (they run simultaneously in isolated worktrees)
- Each sub-agent gets a **self-contained prompt** (no conversation history)
- Batch N must **fully merge** before Batch N+1 worktrees are created
- Merge uses `--no-ff` to preserve agent-level commit history
- Each merge commit follows **conventional commit format** with batch/agent metadata
- **File ownership** within a batch is non-overlapping (enforced by Stage 3 conflict detection)

---

### Stage 6: Quality Gate (Automated Agents)

**Owner**: Specialized agents — no human involvement.

**Artifact**: Pass/fail report per check.

Three parallel agents run against main after all batches merge:

| Agent | Type | What It Checks |
|-------|------|----------------|
| Code reviewer | `code-reviewer` | `CODE_GUIDELINES.md` compliance |
| TypeScript checker | `typescript-checker` | Type errors via `tsc --noEmit` |
| Biome checker | `biome-checker` | Linting and formatting |

If any agent reports issues, the orchestrator (or main agent) fixes them on main and re-runs the gate until clean.

---

### Stage 7: Human Review + Feedback Loop

**Owner**: Human.

The human re-enters the loop to evaluate:

- Does the code solve the problem stated in the ADR?
- Are there architectural concerns the AI missed?
- Does it need refinement?

Feedback paths:

| Situation | Action | Restart From |
|-----------|--------|--------------|
| Direction is wrong | Write a new ADR | Stage 1 |
| Decomposition is wrong | Modify the plan | Stage 3 (re-derive) |
| Incremental improvement needed | Open a follow-up plan | Stage 2 |
| Accept | Mark plans as implemented, move to `implemented/` | Done |

---

## Judgment Gradient

The pipeline is designed around a key observation: different stages require different ratios of creative judgment to mechanical derivation.

| Stage | Judgment Level | Owner | Automated? |
|-------|---------------|-------|------------|
| 1. ADR | Very High | Human (AI assists) | No |
| 2. Plan | High | AI drafts, human approves | Partially |
| 3. Execution Graph | Very Low | AI | **Yes** |
| 4. Batch Plan | Very Low | AI | **Yes** |
| 5. Implementation | Variable | AI agents | **Yes** |
| 6. Quality Gate | None | AI agents | **Yes** |
| 7. Review | High | Human | No |

Stages 3 and 4 are the key automation wins. They currently consume significant human effort (writing `META-PLAN.md` and `PARALLEL-EXECUTION.md`) but are almost entirely derivable from structured plan data.

---

## Mapping to Software Engineering Team Processes

Each stage maps to established team practices:

| Pipeline Stage | Team Equivalent |
|----------------|-----------------|
| ADR | Technical design document / RFC |
| Plan with structured todos | Sprint planning with Jira/Linear tickets |
| Execution graph (DAG) | Gantt chart / dependency mapping |
| Critical path analysis | Risk register / escalation planning |
| Batch plan | PR train / integration wave schedule |
| Worktree per agent | Feature branch per developer |
| File ownership matrix | CODEOWNERS file |
| Agent prompts | Ticket descriptions / task specs |
| Merge + verify loop | Merge queue + post-merge CI |
| Quality gate | CI pipeline (lint, type, review) |
| Human review | Sprint review / demo |
| Feedback loop | Retrospective → next sprint |

---

## When to Use the Full Pipeline

Not every task benefits from the full pipeline. Define a complexity threshold:

| Scenario | Use Pipeline? | Why |
|----------|---------------|-----|
| Multi-file feature across 3+ plans | **Yes** | Full parallelization benefit |
| Single plan, 5+ todos with dependencies | **Yes** | DAG analysis and batching help |
| Single plan, 2-3 independent todos | **Optional** | Batching helps but overhead may not be worth it |
| Single-file change or config tweak | **No** | Direct implementation is faster |
| Bug fix in known location | **No** | Direct fix, no planning needed |
| Exploratory research / feasibility | **Partial** | ADR + plan, but implementation may be iterative |

---

## Consequences

### Positive

- **Eliminates manual intermediary work**: No more hand-writing `META-PLAN.md` or `PARALLEL-EXECUTION.md`. These become derived artifacts.
- **Faster iteration**: Human effort concentrates on high-judgment stages (ADR, plan approval, final review). Everything in between is automated.
- **Reproducible execution**: Given the same plan, the pipeline produces the same execution graph and batch plan every time.
- **Scalable**: Adding more plans or todos does not increase manual coordination overhead.
- **Auditable**: Each stage produces an artifact. The full chain from ADR → plan → execution graph → batch plan → commits → quality report is traceable.

### Negative

- **Structured todo overhead**: Plan todos now require more metadata (`files`, `depends-on`, `context-refs`) than the current free-form approach. This makes plan authoring slightly more verbose.
- **Upfront format investment**: The structured todo format and derivation logic need to be built and validated before the automation pays off.
- **Reduced flexibility in execution**: Automated batch assignment may produce suboptimal groupings that a human would arrange differently. Override mechanisms are needed.

### Risks

- **Plan metadata quality**: If `depends-on` or `files` fields are inaccurate, the execution graph will be wrong. Mitigation: validation step that checks declared files against actual file creation during implementation.
- **Prompt quality**: Auto-generated prompts may lack nuance that hand-written prompts capture. Mitigation: iterate on prompt templates; allow human override of individual prompts before execution.
- **Over-automation**: Not every task benefits from the full pipeline. Small changes should bypass it entirely. Mitigation: the "When to Use" table above defines complexity thresholds.

---

## Cursor Skills Mapping

Each pipeline stage maps to Cursor skills and tooling:

| Stage | Skill / Tool | Notes |
|-------|--------------|-------|
| 2. Plan creation | `create-implement-and-manage-plan` | Opus 4.6 for context; produces plans with todos. Use for both single-plan (sequential) and multi-plan (parallel) paths. |
| 3. Execution graph | `create-parallel-execution-plan` | Dependency analysis, batches, file ownership. Generates META-PLAN-like structure. |
| 4. Batch plan | `create-parallel-execution-plan` | PARALLEL-EXECUTION.md, worktree-config.sh, agent prompts. |
| 5a. Sequential impl | `create-implement-and-manage-plan` | Task-by-task on main. Single plan. |
| 5b. Parallel impl | `execute-parallel-plan` | Worktree batches, merge, verify. Multi-plan. |
| 6. Quality gate | `review-code-quality` + typecheck + biome | Run after implementation. |

**Single plan** → `create-implement-and-manage-plan` (plan + sequential impl).

**Multi-plan parallel** → `create-implement-and-manage-plan` (plans) → `create-parallel-execution-plan` (artifacts) → `execute-parallel-plan` (run).

---

## References

- Current META-PLAN example: `.cursor/plans/implemented/0002-on-chain-pivot/00-feasibility/META-PLAN.md`
- Current PARALLEL-EXECUTION example: `.cursor/plans/implemented/0002-on-chain-pivot/00-feasibility/PARALLEL-EXECUTION.md`
- Current worktree config: `.cursor/plans/implemented/0002-on-chain-pivot/00-feasibility/worktree-config.sh`
- Generic worktree library: `.cursor/scripts/worktree-lib.sh`
- Skills: `create-implement-and-manage-plan`, `create-parallel-execution-plan`, `execute-parallel-plan`
- Rule: `.cursor/rules/worktree-execution.mdc`
- Plan lifecycle: `.cursor/rules/plan-lifecycle.mdc`
- Code guidelines: `CODE_GUIDELINES.md`
