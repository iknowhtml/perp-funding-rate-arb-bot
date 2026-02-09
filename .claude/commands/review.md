Review code quality by following the process defined in `.cursor/skills/review-code-quality/SKILL.md`.

Read that file first, then execute the review process it defines against the current codebase or specified files. The skill enforces strict compliance with `CODE_GUIDELINES.md` — run Biome lint, TypeScript type checking, and review all code against every guideline rule.

Report all violations using the format specified in the skill file, prioritizing CODE_GUIDELINES.md violations as CRITICAL.
