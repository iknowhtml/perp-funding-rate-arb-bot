# Create Plan Examples

## Example 1: Creating a New Plan (with Structured Metadata)

### User Request

"Create a plan for implementing the GMX adapter read layer"

### Correct Response

1. **Gather context** (code patterns, types, file locations from ADRs and `src/`)
2. **Create the plan file** with structured frontmatter and Execution Preview; place under roadmap/phase if applicable (e.g. `.cursor/plans/active/0002-on-chain-pivot/01-mvp-execution/0003-gmx-adapter-reads.md`)
3. **STOP** — inform the user the plan is ready for review and approval. Do NOT implement.

See the main SKILL.md for the Structured Todo Format and Execution Preview template.

---

## Example 2: Handing Off to Parallel Execution

### User says

"I have 3 plans that can run in parallel — generate the execution artifacts"

### Correct Response

**This is NOT create-plan's job.** Create-plan drafts plans only. For parallel execution:

1. Verify each plan has the Structured Todo Format (with `files`, `depends-on`, `agent-type`, `context-refs`)
2. If any plan is missing metadata, use create-plan to enrich it (add the fields, re-output)
3. Hand off to `create-parallel-execution-plan` skill
4. Then use `execute-parallel-plan` to orchestrate the batches

---

## Common Mistake: Flat todos without metadata

**What went wrong:**

```yaml
todos:
  - id: setup-adapter
    content: Create GMX adapter reads
    status: pending
  # Missing: files, depends-on, agent-type, context-refs
```

**Fix:** Use the full Structured Todo Format. Without this metadata, `create-parallel-execution-plan` cannot derive the execution graph, file ownership matrix, or agent prompts.
