# ADR 0009: Development Tooling

- **Status:** Accepted
- **Date:** 2026-02-04
- **Updated:** 2026-03-04
- **Owners:** -
- **Related:**
  - [ADR-0001: Bot Architecture](0001-bot-architecture.md)
  - [ADR-0030: Build Tool — tsup](0030-build-tool-tsup.md) (build script)

## Context

Setting up a modern TypeScript project requires choosing a set of tools for building, testing, linting, and ensuring code quality. We need a stack that is fast, reliable, and provides a good developer experience for a long-running trading bot.

Per [ADR-0001](0001-bot-architecture.md), we chose Node.js over Bun for this project due to:
- Superior ecosystem compatibility with exchange SDKs and WebSocket clients
- Proven long-running stability (critical for 24/7 operation)
- Mature debugging and observability tooling
- Better operational knowledge and support

This ADR defines the development tooling stack that supports this runtime choice.

## Decision

We have decided to use the following development tooling stack:

| Concern | Choice | Rationale |
|---------|--------|-----------|
| **Language** | TypeScript | Static typing, modern ECMAScript features, better developer tooling (autocomplete, refactoring) |
| **Runtime** | Node.js | Long-running stability, ecosystem compatibility, mature debugging (see ADR-0001) |
| **Node Version Manager** | fnm | Fast (Rust-based), cross-platform, respects `.node-version` files, auto-switching on `cd` |
| **Package Manager** | pnpm (via Corepack) | Fast installs, disk-efficient, strict dependency isolation. Corepack ensures consistent pnpm version |
| **Linter/Formatter** | Biome | Fast, zero-config tool that unifies linting and formatting. Replaces ESLint + Prettier with a single, more performant tool |
| **Testing** | Vitest | Fast unit test framework compatible with Jest but built for modern environments. Excellent native ESM support |
| **Git Hooks** | Lefthook | Fast, dependency-free git hook manager. Runs linting, formatting, and secret scanning before commits and pushes |
| **Secret Scanning** | Gitleaks | Security best practice to prevent accidental commitment of secrets (API keys, credentials) into the repository |

### Version Management

#### fnm (Fast Node Manager)

[fnm](https://github.com/Schniz/fnm) manages Node.js versions. It's fast (Rust-based) and automatically switches Node versions when you `cd` into a project directory.

**Installation and usage:** See [fnm docs](https://github.com/Schniz/fnm) or the repo setup script. The project pins Node in `.node-version`; when you `cd` into the project, fnm auto-switches to that version.

#### Corepack (pnpm Version Management)

[Corepack](https://nodejs.org/api/corepack.html) is Node.js's built-in package manager version manager. It ensures everyone uses the same pnpm version.

**Enable Corepack** once (`corepack enable`). The project specifies the pnpm version in `package.json` (`packageManager`); Corepack uses that version automatically. See repo for current value.

**Why Corepack over global pnpm install:**

| Approach | Pros | Cons |
|----------|------|------|
| `npm install -g pnpm` | Simple | Version drift between developers |
| Corepack | Consistent versions, no manual install | Requires `corepack enable` once |

**Troubleshooting:** If Corepack reports a hash mismatch, remove the hash from the `packageManager` field in `package.json` (see repo).

### Tool Configuration

#### Biome

Biome replaces ESLint + Prettier with a single, faster tool. Configuration: see `biome.json` in the repo.

**Why Biome over ESLint + Prettier:**

| Concern | ESLint + Prettier | Biome |
|---------|-------------------|-------|
| **Performance** | Slower (two tools, JS-based) | 10-100x faster (Rust-based) |
| **Configuration** | Two configs, potential conflicts | Single config |
| **Import organization** | Requires plugin | Built-in |
| **TypeScript support** | Via parser plugin | Native |

#### Lefthook

[Lefthook](https://github.com/evilmartians/lefthook) runs Biome and Gitleaks on pre-commit, and biome CI + typecheck + tests on pre-push. Configuration: see `lefthook.yml` in the repo.

**Why Lefthook over Husky:**
- Faster (Go-based)
- Per-command configuration
- Better parallel execution
- No `.husky/` directory clutter

#### Gitleaks

[Gitleaks](https://github.com/gitleaks/gitleaks) prevents accidental secret commits. Config and allowlist: see `.gitleaks.toml` in the repo. Install via `brew install gitleaks` (macOS) or [Gitleaks installation](https://github.com/gitleaks/gitleaks#installation).

#### Vitest

Vitest is configured for node, `src/**/*.test.ts`, and v8 coverage. Configuration: see `vitest.config.ts` in the repo.

### Package Scripts and Dependencies

Scripts (e.g. `dev`, `build`, `lint`, `typecheck`, `test`, `test:run`) and devDependencies are in `package.json`. Use `test:run` for non-interactive runs (e.g. Cursor/scripts); use `test` for watch mode. Production build: **tsup** (see [ADR-0030: Build Tool — tsup](0030-build-tool-tsup.md)).

### Setup Instructions

**Automated (recommended):** Run `./scripts/setup.sh` or `pnpm setup`; it installs fnm, Corepack, Lefthook, Gitleaks, dependencies, hooks, and creates `.env` from `.env.example`.

**Manual:** Install fnm, add `eval "$(fnm env --use-on-cd)"` to your shell profile, install Node per `.node-version`, run `corepack enable`, then `pnpm install` and `pnpm lefthook install`. Install Gitleaks per [docs](https://github.com/gitleaks/gitleaks#installation). Verify with `fnm --version`, `node --version`, `pnpm --version`. See repo `scripts/setup.sh` for the canonical sequence.

## Consequences

### Positive

- **Speed**: Biome is significantly faster than ESLint + Prettier
- **Consistency**: Unified tooling ensures consistent code style and quality
- **Version Consistency**: fnm + Corepack ensure all developers use identical Node.js and pnpm versions
- **Security**: Automated secret scanning reduces the risk of credential leaks
- **Developer Experience**: Fast feedback loop with Vitest watch mode and tsx for development
- **Stability**: Node.js runtime proven for long-running services
- **Auto-switching**: fnm automatically switches Node versions when entering the project directory

### Negative

- **Biome Ecosystem**: Smaller plugin ecosystem than ESLint (most teams find core rules sufficient)
- **Gitleaks Installation**: Requires separate installation outside of npm/pnpm
- **Initial Setup**: fnm, Corepack, and Gitleaks require one-time setup per machine (documented above)

### Risks

| Risk | Mitigation |
|------|------------|
| Biome rules insufficient | Fall back to custom rules or ESLint for specific cases |
| Gitleaks false positives | Configure allowlist in `.gitleaks.toml` |
| Hook bypass | CI also runs all checks; local hooks are convenience, not sole defense |
| fnm not found in new terminal | Ensure `eval "$(fnm env --use-on-cd)"` is in shell config |
| Corepack hash mismatch | Remove hash from `packageManager` field in `package.json` |

## References

### Tool Documentation

- [fnm](https://github.com/Schniz/fnm) — Fast Node Manager (Rust-based)
- [Corepack](https://nodejs.org/api/corepack.html) — Node.js built-in package manager version manager
- [pnpm](https://pnpm.io/) — Fast, disk-efficient package manager
- [Biome](https://biomejs.dev/) — All-in-one linting and formatting
- [Lefthook](https://github.com/evilmartians/lefthook) — Git hooks manager
- [Gitleaks](https://github.com/gitleaks/gitleaks) — Secret scanning
- [Vitest](https://vitest.dev/) — Fast unit test framework
- [tsx](https://github.com/privatenumber/tsx) — TypeScript execution for Node.js
