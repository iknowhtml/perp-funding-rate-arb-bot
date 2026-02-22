---
name: add-convention
description: Ensures new or updated project rules are reflected in CODE_GUIDELINES.md, .cursor/rules, and .cursor/skills, then scans the codebase for violations and fixes or reports them. Use when adding a coding rule, convention, or standard, or when the user asks to add a rule or update conventions.
---

# Add Convention

When adding or changing a project rule, convention, or standard, update all three places so the codebase stays consistent and the agent has a single source of truth.

## Checklist

1. **CODE_GUIDELINES.md** — Add or update the rule in the appropriate section (e.g. Naming Conventions, TypeScript, Code Quality, BigInt). CODE_GUIDELINES is the source of truth; rules and skills reference it.
2. **.cursor/rules/** — Add or update a `.mdc` rule file so the agent gets the rule in context. Use `general.mdc` for project-wide rules or a dedicated file with the right `globs` / `alwaysApply`.
3. **.cursor/skills/** — If the rule implies a workflow (e.g. "when adding a rule, do X"), add or update a skill in `.cursor/skills/` that encodes that workflow.
4. **Scan codebase and enforce** — Search for violations of the new/updated convention, fix them where practical, and report any remaining or out-of-scope violations. See [Scans](#scans) below.

## When to update which

| Change                      | CODE_GUIDELINES.md       | .cursor/rules              | .cursor/skills           |
| --------------------------- | ------------------------ | -------------------------- | ------------------------- |
| New naming/convention       | Add section or bullet    | Add to general or new .mdc | Only if workflow needed   |
| New file/structure pattern  | Add under relevant section | Add or update rule (globs) | Only if workflow needed   |
| New "when you do X, also do Y" | Document the "Y"      | Optional reminder in rule  | Add skill for the workflow |

## Scans

**Always run after changing conventions** so the codebase actually follows the new rule.

1. **Identify checkable patterns** — Decide what is searchable (e.g. single-letter params, wrong file names, `any` usage, `as` casts). Use `grep` / codebase search for the old or violating pattern; exclude test/fixture noise if appropriate.
2. **Fix violations** — Where scope is reasonable, fix each violation (rename, restructure, replace with the convention). Prefer fixing over reporting when the change set stays small and low-risk.
3. **Report if needed** — If violations are numerous, risky, or out of scope for the current change, list files/locations and a short summary so the user or a follow-up task can address them.
4. **Verify** — After fixes, run `pnpm biome check --write .`, `pnpm typecheck`, and `pnpm test:run` to ensure nothing broke. If Biome reports errors that auto-fix did not fix (e.g. unsafe/skipped fixes), resolve them manually so both Biome and TypeScript pass.

**Examples:** single-letter callback params → grep and rename to descriptive names; wrong naming → search for the old pattern and update; new banned construct → search for that construct and replace or document exceptions.

## Relationship to Other Rules

- **CODE_GUIDELINES.md**: Source of truth for coding standards (this project uses CODE_GUIDELINES.md, not docs/CONVENTIONS.md).
- **.cursor/rules/code-quality.mdc**: References CODE_GUIDELINES.md for code-reviewer compliance.
- **.cursor/rules/general.mdc**: References CODE_GUIDELINES.md and plan lifecycle.
