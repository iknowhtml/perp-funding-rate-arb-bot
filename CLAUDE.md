# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Key References

Read these before making changes:

- **`CODE_GUIDELINES.md`** — All code conventions: naming, TypeScript practices, bigint math, Valibot usage, testing, error handling
- **`README.md`** — Architecture overview, tech stack, project structure, configuration
- **`adrs/`** — 18 Architecture Decision Records. Check before implementing features.
- **`lefthook.yml`** — Git hooks (pre-commit: Biome + Gitleaks; pre-push: Biome CI + typecheck + tests)
- **`plans/active/0001-mvp-roadmap/README.md`** — Implementation roadmap and current progress

## Commands

All scripts are defined in `package.json`. Frequently used:

```bash
pnpm dev              # Start dev server with watch mode
pnpm build            # Compile TypeScript
pnpm lint             # Biome linter
pnpm lint:fix         # Auto-fix lint issues
pnpm typecheck        # Type check (tsc --noEmit)
pnpm test:run         # Run tests once (use this, not `pnpm test` which hangs in watch mode)
pnpm test:run src/path/to/file.test.ts  # Run a single test file
pnpm db:up            # Start PostgreSQL container (port 5433)
pnpm db:generate      # Generate migration from schema changes
pnpm db:migrate       # Apply pending migrations
```
