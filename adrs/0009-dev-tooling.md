# ADR 0009: Development Tooling

- **Status:** Accepted
- **Date:** 2026-02-04
- **Owners:** -
- **Related:**
  - [ADR-0001: Bot Architecture](0001-bot-architecture.md)

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

**Installation:**

```bash
# macOS
brew install fnm

# Linux/macOS (curl)
curl -fsSL https://fnm.vercel.app/install | bash
```

**Shell Integration:**

Add to your shell profile (`~/.zshrc` or `~/.bashrc`):

```bash
# fnm (Fast Node Manager)
eval "$(fnm env --use-on-cd)"
```

**Project Configuration:**

The project pins the Node.js version in `.node-version`:

```
22
```

When you `cd` into the project directory, fnm automatically switches to Node.js 22.

**Usage:**

```bash
fnm install 22      # Install Node.js 22
fnm use 22          # Use Node.js 22
fnm current         # Show current version
fnm list            # List installed versions
```

#### Corepack (pnpm Version Management)

[Corepack](https://nodejs.org/api/corepack.html) is Node.js's built-in package manager version manager. It ensures everyone uses the same pnpm version.

**Enable Corepack:**

```bash
corepack enable
```

**Project Configuration:**

The project specifies the pnpm version in `package.json`:

```json
{
  "packageManager": "pnpm@9.15.2"
}
```

When you run `pnpm` commands, Corepack automatically downloads and uses the specified version.

**Why Corepack over global pnpm install:**

| Approach | Pros | Cons |
|----------|------|------|
| `npm install -g pnpm` | Simple | Version drift between developers |
| Corepack | Consistent versions, no manual install | Requires `corepack enable` once |

**Troubleshooting:**

If you see a Corepack hash mismatch error, remove the hash from `packageManager`:

```json
// Before (with hash)
"packageManager": "pnpm@9.15.2+sha512.abc123..."

// After (without hash)
"packageManager": "pnpm@9.15.2"
```

### Tool Configuration

#### Biome

Biome replaces ESLint + Prettier with a single, faster tool:

```json
// biome.json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "ignoreUnknown": false,
    "ignore": ["node_modules", "dist", "coverage", ".env", ".env.local"]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": {
        "noNonNullAssertion": "off",
        "useNodejsImportProtocol": {
          "level": "warn",
          "fix": "safe"
        }
      },
      "correctness": {
        "noUnusedVariables": "error",
        "noUnusedImports": "error"
      }
    }
  }
}
```

**Why Biome over ESLint + Prettier:**

| Concern | ESLint + Prettier | Biome |
|---------|-------------------|-------|
| **Performance** | Slower (two tools, JS-based) | 10-100x faster (Rust-based) |
| **Configuration** | Two configs, potential conflicts | Single config |
| **Import organization** | Requires plugin | Built-in |
| **TypeScript support** | Via parser plugin | Native |

#### Lefthook

[Lefthook](https://github.com/evilmartians/lefthook) runs Biome checks and secret scanning on commit:

```yaml
# lefthook.yml
pre-commit:
  piped: true
  commands:
    biome:
      glob: '*.{js,ts,cjs,mjs,d.cts,d.mts,jsx,tsx,json,jsonc}'
      run: pnpm biome check --write {staged_files}
      stage_fixed: true
    gitleaks:
      # Scans staged files for secrets/credentials before allowing commit
      # Install: brew install gitleaks (macOS) or see https://github.com/gitleaks/gitleaks
      run: gitleaks protect -v --staged

pre-push:
  commands:
    biome-ci:
      run: pnpm biome ci --error-on-warnings
    typecheck:
      run: pnpm typecheck
    test:
      run: pnpm test:run
```

**Why Lefthook over Husky:**
- Faster (Go-based)
- Per-command configuration
- Better parallel execution
- No `.husky/` directory clutter

#### Gitleaks

[Gitleaks](https://github.com/gitleaks/gitleaks) prevents accidental secret commits:

```toml
# .gitleaks.toml
title = "Gitleaks config for funding-rate-arb-bot"

# Extend the default ruleset
[extend]
useDefault = true

# Paths to ignore (test files may contain mock credentials)
[allowlist]
paths = [
  '''\.test\.ts$''',
  '''test-utils\.ts$''',
]
```

**Installation:**
```bash
# macOS
brew install gitleaks

# Linux
# See https://github.com/gitleaks/gitleaks#installation
```

#### Vitest

Vitest is configured for fast, modern testing:

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
```

### Package Scripts

```json
// package.json (scripts section)
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format --write .",
    "format:check": "biome format .",
    "typecheck": "tsc --noEmit",
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage"
  }
}
```

**Important:** Always use `test:run` when running tests from Cursor or scripts (process exits after tests complete). Use `test` for interactive watch mode during development.

### Development Dependencies

```json
// package.json (devDependencies)
{
  "devDependencies": {
    "@biomejs/biome": "^1.9.4",
    "@types/node": "^20.x",
    "tsx": "^4.x",
    "typescript": "^5.7.x",
    "vitest": "^2.x"
  }
}
```

### Setup Instructions

#### Automated Setup (Recommended)

Run the setup script to install all dependencies automatically:

```bash
./scripts/setup.sh
# or
pnpm setup
```

The setup script will:
1. Install fnm (Fast Node Manager)
2. Configure fnm in your shell profile
3. Install Node.js 22
4. Enable Corepack
5. Install Lefthook and Gitleaks
6. Install project dependencies
7. Set up Git hooks
8. Create `.env` from `.env.example`

#### Manual Setup

If you prefer manual setup or are on Linux:

##### Prerequisites

1. **Install fnm** (Fast Node Manager):
   ```bash
   # macOS
   brew install fnm
   
   # Or via curl (Linux/macOS)
   curl -fsSL https://fnm.vercel.app/install | bash
   ```

2. **Configure shell** (add to `~/.zshrc` or `~/.bashrc`):
   ```bash
   eval "$(fnm env --use-on-cd)"
   ```

3. **Restart terminal** or source your shell config:
   ```bash
   source ~/.zshrc  # or ~/.bashrc
   ```

##### Project Setup

1. **Install Node.js** (fnm auto-switches based on `.node-version`):
   ```bash
   fnm install 22
   fnm use 22
   ```

2. **Enable Corepack** (manages pnpm version):
   ```bash
   corepack enable
   ```

3. **Install dependencies** (Corepack auto-installs correct pnpm version):
   ```bash
   pnpm install
   ```

4. **Install Lefthook hooks:**
   ```bash
   pnpm lefthook install
   ```

5. **Install Gitleaks** (for secret scanning):
   ```bash
   brew install gitleaks  # macOS
   ```

#### Verification

```bash
fnm --version      # Fast Node Manager
node --version     # Should be v22.x
pnpm --version     # Should match packageManager in package.json
```

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
