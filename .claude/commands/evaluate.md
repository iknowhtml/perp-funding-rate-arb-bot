Evaluate code, plans, or architecture decisions from a distinguished Node.js engineer perspective by following the process defined in `.cursor/skills/evaluate-code-as-distinguished-engineer/SKILL.md`.

Read that file first, along with its supporting files:
- `.cursor/skills/evaluate-code-as-distinguished-engineer/library-evaluation.md`
- `.cursor/skills/evaluate-code-as-distinguished-engineer/production-checklist.md`

Then execute the multi-perspective evaluation: spawn parallel Task subagents for Architecture Analysis, Library Evaluation, and Production Readiness review. Synthesize findings using the synthesis template from the skill file.

Use `subagent_type: "general-purpose"` for each evaluation subagent.
