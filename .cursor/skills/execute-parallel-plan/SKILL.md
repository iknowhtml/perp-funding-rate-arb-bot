---
name: execute-parallel-plan
description: Orchestrate batch-by-batch execution of a PARALLEL-EXECUTION.md. Sources worktree-config.sh, sets up worktrees, launches subagents, merges, verifies, and cleans up. Use when asked to "execute" or "run" a parallel execution plan.
---

# Execute Parallel Plan

Orchestrate the execution of a PARALLEL-EXECUTION.md plan. Run each batch: setup worktrees, launch subagents, merge, verify, cleanup. End with quality gate.

## Invocation

When user says "execute @PARALLEL-EXECUTION.md" or "run the parallel plan":

1. Locate PARALLEL-EXECUTION.md (user may @-mention it)
2. Locate worktree-config.sh in the same directory
3. Execute per workflow below

## Workflow (per batch N)

### 1. Setup

```bash
source <plan-dir>/worktree-config.sh
wt_setup_batch N
```

### 2. Launch Subagents

Parse the PARALLEL-EXECUTION.md for batch N. For each agent in the batch:

- Prepend the contents of `worktree-agent-template.md` to the agent's prompt
- Launch a Task subagent with:
  - **prompt**: worktree-agent-template preamble + plan-specific agent prompt (full block from PARALLEL-EXECUTION.md)
  - **subagent_type**: from plan (shell, generalPurpose, etc.)
  - **model**: fast (unless plan specifies otherwise)

Launch all agents in the batch **in parallel** (same message, multiple Task calls).

### 3. Wait for Completion

All subagents in the batch must complete before proceeding. If any fails, report and pause for user guidance.

### 4. Merge

```bash
wt_merge_batch N
```

If merge conflicts:
- Report to user with conflict details
- Pause for manual resolution
- User runs: resolve conflicts, `git add`, `git merge --continue`
- Then retry from step 4 or next batch as appropriate

### 5. Verify

```bash
wt_verify_batch N
```

If verification fails (typecheck, tests, biome):
- Fix issues on main
- Re-run `wt_verify_batch N` until clean

### 6. Cleanup

```bash
wt_cleanup_batch N
```

### 7. Next Batch

Repeat for N+1 until all batches complete.

## Final: Quality Gate

After all batches merged and cleaned up:

1. Launch in parallel:
   - code-reviewer subagent (review new code per CODE_GUIDELINES.md)
   - typescript-checker (pnpm typecheck)
   - biome-checker (pnpm biome check .)

2. Fix any reported issues on main

3. Re-run quality gate until clean

## Agent Prompt Format

Each subagent receives:

```
<worktree-agent-template.md contents>

---

<plan-specific prompt from PARALLEL-EXECUTION.md>
```

The plan-specific prompt is the full "Prompt:" block for that agent, including worktree path, task, files, rules, and commit message.

## Parsing PARALLEL-EXECUTION.md

Batch structure: look for "## Batch N —" sections. Each has:
- "### Agent Na:", "### Agent Nb:", etc.
- Under each agent: a "Prompt:" or code block with the prompt

Extract the prompt block verbatim. Ensure worktree path is correct (from WORKTREE_ROOT + worktree name in batch definition).

## Recovery

- **Setup fails mid-batch**: `wt_cleanup_batch N` then retry `wt_setup_batch N`
- **Merge conflicts**: User resolves manually, then `git merge --continue` or `git merge --abort`
- **Cleanup fails**: `wt_cleanup_batch N --force`

## Reference

- worktree-agent-template.md — standard preamble for every subagent
- .cursor/scripts/worktree-lib.sh — underlying library
- .cursor/rules/worktree-execution.mdc — constraints
