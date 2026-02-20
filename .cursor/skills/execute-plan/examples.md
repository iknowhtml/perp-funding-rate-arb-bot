# Execute Plan Examples

## Example 1: Executing a roadmap/phase plan

Plan path: `.cursor/plans/active/0002-on-chain-pivot/01-mvp-execution/0001-transaction-lifecycle.md`

1. Read frontmatter `todos`; work through each todo in order (skip `lifecycle-management` until the end).
2. After each todo: run code-reviewer, then mark `completed`.
3. When all are complete, run lifecycle-management: cp to `implemented/0002-on-chain-pivot/01-mvp-execution/0001-transaction-lifecycle.md`, `git rm -f` from active, verify.

## Example 2: Moving plan — use cp + git rm

**Wrong:** `mv .cursor/plans/active/... .cursor/plans/implemented/...`  
**Right:** `cp ... implemented/... && git rm -f ... active/...` then verify file only in implemented/.

## Common mistake: Marking tasks complete without code-reviewer

Do NOT mark a task `completed` until the code-reviewer subagent has been run and all issues are fixed.
