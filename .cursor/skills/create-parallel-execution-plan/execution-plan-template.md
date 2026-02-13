# {{TITLE}} Parallel Execution Plan

> Operationalizes [META-PLAN.md](./META-PLAN.md) (or input plans) into concrete sub-agent batches.
> Each batch launches up to 4 parallel sub-agents. Batches execute sequentially.

## Constraints

- **Max 4 concurrent sub-agents** per Cursor message
- Sub-agents in the same batch **cannot read each other's output**
- Each sub-agent needs a **self-contained prompt** (no conversation context)
- After each batch, merge worktrees into main before launching next batch

---

## Git Worktree Strategy

- **Isolation** — each agent in its own worktree
- **Clean history** — one merge commit per agent on main
- **Rollback safety** — individual work revertible

### Worktree Config

Source before batch commands:

```bash
source <plan-dir>/worktree-config.sh
```

Config uses generic library at `.cursor/scripts/worktree-lib.sh`.

### Helper Functions

| Function | Description |
|----------|-------------|
| wt_setup_batch N | Create worktrees for batch N |
| wt_merge_batch N | Merge batch N branches into main |
| wt_cleanup_batch N [--force] | Remove worktrees + branches |
| wt_verify_batch N | Run typecheck + tests + biome |
| wt_list | Show worktrees and branches |
| wt_final_cleanup | Verify no stale resources |

### Lifecycle

```bash
wt_setup_batch N    # create worktrees
# ... launch agents ...
wt_merge_batch N    # merge into main
wt_verify_batch N    # run checks
wt_cleanup_batch N   # remove worktrees
```

---

## Batch Overview

{{BATCH_OVERVIEW}}

---

## File Ownership Matrix

{{FILE_OWNERSHIP_MATRIX}}

---

## Batch 1 — {{BATCH_1_TITLE}}

### Worktree Setup

```bash
source <plan-dir>/worktree-config.sh
wt_setup_batch 1
```

### Agent Prompts

{{BATCH_1_AGENT_PROMPTS}}

### Merge + Verify + Cleanup

```bash
wt_merge_batch 1
wt_verify_batch 1
wt_cleanup_batch 1
```

---

## Batch 2 — {{BATCH_2_TITLE}}

(Repeat structure for each batch)

---

## Quality Gate (Final Batch)

No worktrees. Run on main (read-only):
- code-reviewer
- typescript-checker
- biome-checker

Fix any issues, re-run until clean.

---

## Conflict Resolution

If merge conflicts:
1. `git diff --name-only --diff-filter=U`
2. Resolve: prefer owning agent per File Ownership Matrix
3. `git add <resolved> && git merge --continue`
4. Or: `git merge --abort` and try other agent first
