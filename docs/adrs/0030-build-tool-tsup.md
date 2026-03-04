# ADR 0030: Build Tool — tsup

- **Status:** Accepted
- **Date:** 2026-02-22
- **Owners:** -
- **Related:**
  - [ADR-0009: Development Tooling](0009-dev-tooling.md)
  - [ADR-0001: Bot Architecture](0001-bot-architecture.md)

## Context

The project previously used **tsc** (TypeScript compiler) for production builds: `tsc` emitted ESM to `dist/` with path aliases (`@/*`) and directory imports left as-is. When running `node dist/index.js` with Node ESM:

1. **Directory imports** — Node ESM does not support importing a directory; the specifier must resolve to a file (e.g. `.../lib/db/index.js`). Imports like `./lib/db` caused `ERR_UNSUPPORTED_DIR_IMPORT`.
2. **Path aliases** — `tsc` does not rewrite path aliases in emitted code; it only uses them for type resolution. Emitted files still contained `from "@/lib/db"`, which Node cannot resolve at runtime.

We needed a build approach that either rewrites aliases and directory imports (e.g. tsc-alias post-build) or bundles the application so that resolution is handled at build time. We chose a **bundler** for speed, single-output simplicity, and to avoid fragile ESM resolution in both our code and some dependencies.

## Decision

**Use tsup for production builds** instead of `tsc`.

- **Build:** `pnpm build` runs `tsup` (single ESM bundle to `dist/index.js`).
- **Type checking:** Unchanged — `pnpm typecheck` still runs `tsc --noEmit`.
- **Dev:** Unchanged — `pnpm dev` uses `tsx watch src/index.ts` (no build step).
- **Runtime:** `package.json` includes `"type": "module"` so `node dist/index.js` runs as ESM.

### Configuration

Configuration lives in `tsup.config.ts`:

| Option | Value | Rationale |
|--------|--------|------------|
| `entry` | `["src/index.ts"]` | Single entry for the Node server |
| `format` | `["esm"]` | ESM only; matches Node 22 and existing runtime |
| `dts` | `true` | Emit `dist/index.d.ts` for consumers |
| `splitting` | `false` | Single bundle for a long-running process |
| `sourcemap` | `true` | Debugging and stack traces |
| `clean` | `true` | Clear `dist/` before each build |
| `target` | `"node22"` | Matches `engines.node` |
| `platform` | `"node"` | Node environment; dependencies external by default |
| `noExternal` | `["@gmx-io/sdk"]` | Bundle this dependency to avoid its broken ESM (directory imports) at runtime |

tsup uses **esbuild** for the JS bundle (fast) and **tsc** for declaration generation (slower; runs as part of `pnpm build`).

### Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `build` | `tsup` | Produce `dist/index.js` and `dist/index.d.ts` |
| `typecheck` | `tsc --noEmit` | Type-check only; no emit |
| `start` | `node dist/index.js` | Run the built ESM bundle |
| `dev` | `tsx watch src/index.ts` | Run from source with hot reload |

## Consequences

### Positive

- **Fast builds** — esbuild-based bundling is much faster than tsc emit for the application bundle.
- **Path aliases resolved** — `@/*` is resolved at build time; no runtime resolution or post-build alias rewriting.
- **No directory-import issues** — Bundled output has no directory imports; Node ESM runs without `ERR_UNSUPPORTED_DIR_IMPORT`.
- **Single output** — One `dist/index.js` (and optional dts) simplifies deployment and execution.
- **Problematic deps** — Packages with broken ESM (e.g. directory imports) can be bundled via `noExternal` so they don’t break at runtime.

### Negative

- **Extra dependency** — tsup (and its transitive deps) added to devDependencies.
- **DTS slower** — Declaration generation still uses tsc and dominates build time; the JS bundle itself is fast.
- **Bundle size** — Any package in `noExternal` is included in the bundle (e.g. `@gmx-io/sdk`), increasing `dist/index.js` size.

### Risks

| Risk | Mitigation |
|------|-------------|
| tsup or esbuild behavior changes | Pin tsup version; verify build and start in CI |
| New dependency with broken ESM | Add to `noExternal` in `tsup.config.ts` if it fails at runtime when external |
| Need CJS output | Add `format: ["cjs"]` or a second build target if required later |

## References

- [tsup](https://tsup.egoist.dev/) — Zero-config TypeScript bundler powered by esbuild
- [esbuild](https://esbuild.github.io/) — Fast JavaScript bundler
- Project: `tsup.config.ts`, `package.json` scripts (`build`, `typecheck`, `start`, `dev`)
