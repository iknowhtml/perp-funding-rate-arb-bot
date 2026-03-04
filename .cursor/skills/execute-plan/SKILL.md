---
name: execute-plan
description: Execute an approved plan sequentially (task-by-task on main). Use Composer. Input: a plan in `docs/plans/active/` that has been approved by a human. Run code-reviewer after each task. Complete with lifecycle-management (move plan to implemented/).
---

# Execute Plan (Stage 5a)

Execute a **single approved plan** sequentially on main. Use when the user has approved a plan created by `create-plan` and wants to proceed with implementation. For 2+ plans in parallel, use `create-parallel-execution-plan` + `execute-parallel-plan` instead.

## Prerequisite

**The plan must have been approved by a human.** If the user says "implement the plan" without prior approval, confirm the plan has been reviewed and approved before starting.

## Model

Use **Composer** for implementation (faster code generation when context is provided).

## Workflow

1. Locate the plan in `docs/plans/active/` (or under `docs/plans/active/<ROADMAP>/<PHASE>/` for roadmap plans). User may @-mention it.
2. Extract todos from **frontmatter** (not prose `## Tasks` section)
3. Work through each todo:
   - Mark `in_progress` → Complete work → Run code-reviewer → Mark `completed`
4. Complete `lifecycle-management` todo (move plan to `implemented/`)

## Code Review Gate

**Run `.cursor/skills/review-code-quality/SKILL.md` after each task.**

Do NOT mark tasks complete until code-reviewer passes.

## Frontmatter Todos: Source of Truth

The frontmatter `todos` array is the **sole source of truth** for task tracking. Do NOT extract tasks from the `## Tasks` prose section in the plan body — it exists for human context only.

---

## Moving Plans to Implemented

When all todos are complete:

**Important**: Move the **original plan file** you're implementing. All plan files use the `.plan.md` suffix (or `.md` under roadmap/phase in this project). Simple plans live flat in `active/`; sub-plans live inside a parent directory; roadmap plans live under `active/<ROADMAP>/<PHASE>/`.

### Why `cp` + `git rm`, not `mv`

**NEVER use `mv` to move plan files.** The `mv` command can silently fail to delete the source file. Always use explicit `cp` + `git rm` to guarantee deletion and stage it in git.

### Procedure: Copy, Delete, Verify (all in one shell command)

**Run all steps in a SINGLE shell command** so the agent cannot stop between copy and delete.

Simple plan:

```bash
ACTIVE="docs/plans/active/<PLAN>.plan.md" && \
IMPL="docs/plans/implemented/<PLAN>.plan.md" && \
cp "$ACTIVE" "$IMPL" && \
git rm -f "$ACTIVE" && \
test -f "$IMPL" && ! test -f "$ACTIVE" && \
echo "SUCCESS" || echo "FAILED: verify manually"
```

Sub-plan inside a directory:

```bash
PARENT="<PARENT-DIR>" && \
ACTIVE="docs/plans/active/$PARENT/<PLAN>.plan.md" && \
IMPL="docs/plans/implemented/$PARENT/<PLAN>.plan.md" && \
mkdir -p "docs/plans/implemented/$PARENT" && \
cp "$ACTIVE" "$IMPL" && \
git rm -f "$ACTIVE" && \
test -f "$IMPL" && ! test -f "$ACTIVE" && \
echo "SUCCESS" || echo "FAILED: verify manually"
```

Roadmap/phase plan (e.g. `active/0002-on-chain-pivot/01-mvp-execution/0001-transaction-lifecycle.md`; plan file may be `.md` in this project):

```bash
ROADMAP="0002-on-chain-pivot" && \
PHASE="01-mvp-execution" && \
PLAN="0001-transaction-lifecycle.md" && \
ACTIVE="docs/plans/active/$ROADMAP/$PHASE/$PLAN" && \
IMPL="docs/plans/implemented/$ROADMAP/$PHASE/$PLAN" && \
mkdir -p "docs/plans/implemented/$ROADMAP/$PHASE" && \
cp "$ACTIVE" "$IMPL" && \
git rm -f "$ACTIVE" && \
test -f "$IMPL" && ! test -f "$ACTIVE" && \
echo "SUCCESS" || echo "FAILED: verify manually"
```

### Checklist (every step is mandatory)

1. Update plan frontmatter: all todos to `status: completed`
2. Check all validation boxes `[x]`
3. (Roadmap/phase only) Update roadmap link to `../../active/<roadmap-id>/README.md`; ensure implemented path includes `ROADMAP/PHASE`
4. `mkdir -p` the target directory in `implemented/` (if sub-plan or roadmap/phase)
5. `cp` the file from `active/` to `implemented/`
6. `git rm -f` the file from `active/`
7. Verify: file exists in `implemented/` AND does NOT exist in `active/`

**The file must ONLY exist in `implemented/` when done. Never in both locations.**

---

## Anti-Patterns

| Don't                                                    | Do                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------- |
| Extract tasks from `## Tasks` prose                      | Parse `frontmatter.todos` array                               |
| Forget `lifecycle-management` todo                       | Always include it (create-plan adds it; execute-plan runs it) |
| **Use `mv` to move plan files**                          | **Use `cp` + `git rm -f`**                                    |
| **Split copy/delete into separate tool calls**           | **Run `cp` + `git rm -f` + verify in ONE shell command**      |
| **Leave file in both locations**                         | **Always `git rm -f` from `active/` and verify deletion**     |
| Skip code-reviewer                                        | Run after every implementation task                           |
| Move a different plan instead of the one you implemented | Move the plan file you implemented from `active/`             |

---

## Relationship to Other Skills

- **create-plan**: Produces the plan. Use first; human approves; then use this skill to implement.
- **create-parallel-execution-plan**: For 2+ plans, use that + `execute-parallel-plan` instead of this skill.
- **review-code-quality**: Run after each task before marking complete.
- **plan-lifecycle**: See `.cursor/rules/plan-lifecycle.mdc` and `.cursor/rules/code-quality.mdc` for the full checklist.
- **Pipeline doc** (if present): e.g. `docs/AI-DRIVEN-DEVELOPMENT.md` — Full pipeline. Stage 5a = this skill.
