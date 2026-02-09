Create, implement, and manage development plans by following the process defined in `.cursor/skills/create-implement-and-manage-plan/SKILL.md`.

Read that file first, then execute the plan management workflow it defines.

## Claude Code Adaptations

The skill references "Composer" for implementation — in Claude Code, use the following mapping:

- **Plan creation & context gathering**: Use the main conversation (equivalent to the skill's "Opus" phase). Analyze requirements, research codebase patterns, document implementation context.
- **Implementation**: Work through tasks directly in the main conversation or use Task subagents for parallel work (equivalent to the skill's "Composer" phase).
- **Code review gate**: After each task, run `/review` to validate against CODE_GUIDELINES.md before marking complete.

## Plan Storage

Claude Code plans go in `.claude/plans/` following the same `active/` -> `implemented/` lifecycle documented in the skill file and in `.cursor/rules/plan-lifecycle.mdc`.
