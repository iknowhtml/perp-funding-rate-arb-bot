---
name: write-pr-message
description: Generate PR titles and descriptions from branch commits using conventional commit format. Use when the user asks to create a pull request, write a PR message, or draft PR content.
---

# Write PR Message

Generate a PR title and body from the commits on the current branch, following conventional commit conventions and the project's established patterns.

## Workflow

1. **Gather context** (run in parallel):
   - `git log --oneline main..HEAD` — list commits on the branch
   - `git diff main...HEAD --stat` — changed files summary
   - `git diff main...HEAD` — full diff for understanding scope

2. **Classify the change** using the commit types already on the branch. Pick the dominant type for the PR title.

3. **Write the PR title** (conventional commit format).

4. **Write the PR body** using the template below.

5. **Create the PR** with `gh pr create`.

## PR Title Format

```
<type>(<scope>): <imperative summary>
```

- **Subject line max 72 characters** (hard limit)
- Use imperative mood ("Add", "Fix", "Refactor" — not "Added", "Fixes")
- Lowercase after the colon (no capital first letter)
- No trailing period

### Commit Types

| Type | When to Use |
|------|-------------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `docs` | Documentation only |
| `test` | Adding or fixing tests |
| `chore` | Tooling, config, dependencies, CI |
| `perf` | Performance improvement |

### Scope

Optional. Use the primary module or domain affected:

- Adapter names: `coinbase`, `deribit`
- Domain modules: `position`, `strategy`, `risk`
- Infrastructure: `worker`, `config`, `adapters`

If the change spans multiple scopes, omit the scope.

## PR Body Template

```markdown
## Summary

<1-3 bullet points describing WHAT changed and WHY>

## Changes

<Concise list of notable changes, grouped logically. Skip trivial items.>

## Test plan

<How to verify the changes — commands to run, scenarios to check, or "N/A" for docs-only>
```

### Writing Guidelines

- **Summary** answers "why does this PR exist?" — focus on intent, not mechanics
- **Changes** lists the notable implementation details a reviewer needs to know
- **Test plan** tells the reviewer how to verify correctness
- Keep the entire body under 30 lines; brevity is a feature
- Reference ADRs or plans when relevant: `See ADR-0012` or `Implements plan 0002-position-derivation`

## Examples

These are based on the project's actual commit history.

### Single-feature PR

**Commits:**
```
feat: Implement Adapter Factory
test: Fix failing tests
```

**PR title:**
```
feat(adapters): implement adapter factory
```

**PR body:**
```markdown
## Summary

- Add factory function for creating exchange adapters from config
- Enables runtime adapter selection by exchange name

## Changes

- `src/adapters/factory.ts` — `createAdapter()` factory with Coinbase support
- `src/adapters/factory.test.ts` — unit tests for factory creation and error cases
- Fix test assertion for updated normalizer constants

## Test plan

- `pnpm test:run src/adapters/factory.test.ts`
- `pnpm typecheck`
```

### Multi-scope refactor PR

**Commits:**
```
refactor: implement asset adapter pattern for handling asset amounts
fix: Prevent terminal error when CLI is called with no commands
```

**PR title:**
```
refactor: implement asset adapter pattern for amount handling
```

**PR body:**
```markdown
## Summary

- Replace static amount handling with per-asset adapter pattern
- Supports correct decimal handling across assets (e.g. USDC 6 vs ETH 18)
- Fix CLI exit code when invoked without arguments

## Changes

- Replace `ChainAdapter.amountAdapter` property with `getAmountAdapter(asset)` factory method
- Update transaction command to use asset-aware amount resolution
- Return exit code 0 (not 1) when displaying help with no arguments

## Test plan

- `pnpm test:run`
- Manually run CLI with no arguments — should exit cleanly
```

### Docs-only PR

**Commits:**
```
docs: Update plans to account for agnostic asset handling
docs: Update strategy engine design
```

**PR title:**
```
docs: update plans for asset-agnostic handling
```

**PR body:**
```markdown
## Summary

- Update position derivation plan to parameterize decimal scaling per asset
- Revise strategy engine design to align with multi-asset support

## Changes

- `.cursor/plans/active/.../0002-position-derivation.md` — replace hardcoded `BASE_UNIT_SCALE` with `baseUnitScale(decimals)`
- `adrs/0014-funding-rate-strategy.md` — update engine design notes

## Test plan

N/A — documentation only
```
