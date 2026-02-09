---
name: write-commit-message
description: Generate commit messages from staged changes using conventional commit format. Use when the user asks to write a commit message, create a commit, or draft commit content.
---

# Write Commit Message

Generate a commit message from staged changes, following conventional commit conventions and the project's established patterns.

## Workflow

1. **Gather context** (run in parallel):
   - `git status --short` — list staged files
   - `git diff --cached --stat` — changed files summary
   - `git diff --cached` — full diff for understanding scope

2. **Classify the change** based on the diff content. Choose the most specific type.

3. **Write the commit subject** (conventional commit format, max 50-72 characters).

4. **Write the commit body** (optional) if the change needs explanation.

5. **Create the commit** with `git commit -m "subject" -m "body"` or `git commit` (opens editor).

## Commit Message Format

```
<type>(<scope>): <imperative summary>

<optional body explaining WHAT and WHY>
```

### Subject Line Rules

- **Max 50 characters** (preferred) or **72 characters** (hard limit)
- Use imperative mood ("Add", "Fix", "Refactor" — not "Added", "Fixes")
- Lowercase after the colon (no capital first letter)
- No trailing period
- Complete sentence describing what the commit does

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
- Plans: `plans` (for `.cursor/plans/` changes)

If the change spans multiple scopes, omit the scope.

### Body Guidelines

Include a body when:
- The change needs explanation beyond the subject line
- The commit fixes a bug and you want to explain the issue
- The commit introduces a breaking change (start with `BREAKING CHANGE:`)
- Multiple related changes need grouping

**Body format:**
- Wrap at 72 characters
- Use imperative mood
- Explain **what** changed and **why** (not how)
- Separate paragraphs with blank lines
- Reference issues/ADRs when relevant: `See ADR-0012` or `Fixes #123`

## Examples

These are based on the project's actual commit history.

### Simple feature commit

**Staged changes:**
- `src/adapters/factory.ts` — new file with `createAdapter()` function
- `src/adapters/factory.test.ts` — tests

**Commit message:**
```
feat(adapters): implement adapter factory

Add factory function for creating exchange adapters from config.
Enables runtime adapter selection by exchange name.
```

### Refactor with explanation

**Staged changes:**
- `src/adapters/coinbase/normalizers.ts` — extract magic number to constant
- `.cursor/plans/.../0002-position-derivation.md` — update plan to use dynamic decimal scaling

**Commit message:**
```
refactor: replace magic numbers with constants for decimal handling

Extract magic numbers to named constants (BPS_PER_UNIT, baseUnitScale()).
Make decimal scaling asset-agnostic instead of hardcoded to 8 decimals.
Enables correct handling across assets (BTC=8, ETH=18, USDC=6, etc.).
```

### Bug fix

**Staged changes:**
- `src/worker/start-worker.ts` — fix exit code when no commands provided

**Commit message:**
```
fix(worker): prevent terminal error when called with no commands

When running the CLI without arguments, help was displayed but the
command exited with code 1, showing a "Command failed" error. Now exits
with code 0 when help is displayed, preventing the false error message.
```

### Documentation only

**Staged changes:**
- `.cursor/plans/active/.../0002-position-derivation.md` — update plan

**Commit message:**
```
docs(plans): update position derivation for asset-agnostic handling

Update plan to parameterize decimal scaling per asset instead of
hardcoding 8 decimals. Replace BASE_UNIT_SCALE constant with
baseUnitScale(decimals) helper function.
```

### Multi-file refactor

**Staged changes:**
- `src/lib/amount-adapter.ts` — new file
- `src/commands/transaction.ts` — update to use new adapter
- `src/lib/chain-adapter.ts` — remove old property

**Commit message:**
```
refactor: implement asset adapter pattern for amount handling

Replace ChainAdapter.amountAdapter property with getAmountAdapter(asset)
factory method to support multi-asset transactions with correct decimal
handling per asset (e.g., USDC 6 decimals vs ETH 18 decimals).
```

### Test-only commit

**Staged changes:**
- `src/adapters/factory.test.ts` — fix failing test assertions

**Commit message:**
```
test: fix failing tests

Update test assertions to match updated normalizer constants.
```

### Chore commit

**Staged changes:**
- `package.json` — update dependencies
- `bun.lock` — lockfile update

**Commit message:**
```
chore: update dependencies

Update @turnkey/sdk-server to ^5.0.2 and add hono for webhook server.
```

## Best Practices

1. **One logical change per commit** — if you have multiple unrelated changes, split into multiple commits
2. **Be specific** — "fix: handle null balance" is better than "fix: bug"
3. **Focus on what, not how** — "extract magic number to constant" not "create BPS_PER_UNIT variable"
4. **Keep it concise** — if you need more than 3-4 lines in the body, consider splitting the commit
5. **Use present tense** — "add feature" not "added feature"
6. **Reference related work** — mention ADRs, plans, or issues when relevant
