# ADR 0006: Drizzle ORM for Database Access

- **Status:** Accepted
- **Date:** 2026-02-04
- **Updated:** 2026-03-04
- **Owners:** -
- **Related:**
  - [ADR-0005: Database Strategy](0005-database-strategy.md)
  - [ADR-0002: Hexagonal-Inspired Architecture](0002-hexagonal-inspired-architecture.md)

## Context

[ADR-0005](0005-database-strategy.md) decided on Postgres for the worker ledger. We now need a way to interact with the database from TypeScript that:
1. Provides strong type safety (matching our strict TypeScript guidelines)
2. Minimizes runtime overhead (performance is critical for the worker)
3. Manages schema migrations effectively
4. Fits with our "boring technology" philosophy

We considered:
- **Prisma**: Great DX, but heavy runtime engine and cold start issues.
- **TypeORM**: Mature but relies heavily on decorators and classes (violates our functional preference).
- **Kysely**: Excellent type-safe query builder, but less mature migration tooling.
- **Raw SQL (`pg` driver)**: Maximum performance but brittle and no type safety.
- **Drizzle ORM**: Lightweight, schema-defined-in-TypeScript, zero runtime overhead.

## Decision

**Use Drizzle ORM** as the database query layer.

### Why Drizzle?

1. **"If you know SQL, you know Drizzle"**: The API mirrors SQL closely, reducing the abstraction gap.
2. **Zero Runtime Overhead**: It's a thin wrapper around the driver, compiling to SQL strings at build/runtime with minimal processing.
3. **Schema-First**: You define the schema in TypeScript, and Drizzle generates the SQL migrations. This is the single source of truth.
4. **Serverless Ready**: Works perfectly with Railway and potential future edge deployments (no heavy binary to ship).
5. **Functional**: It uses functional patterns (passing db instance, query builders) rather than Active Record classes.

## Implementation

### Schema Definition

Define tables in TypeScript using Drizzle's `pgTable` (columns, indexes). Schema lives in `src/lib/db/schema.ts`. See that file for the current orders table and any others.

### Integration with Hexagonal Architecture

Drizzle fits seamlessly into our hexagonal-inspired architecture (ADR-0002):

- **Repository Adapters**: Drizzle is used within repository adapters in `src/lib/db/adapters/postgres/`
- **Ports/Interfaces**: Domain services depend on repository ports, not Drizzle directly
- **Dependency Injection**: Repository adapters receive the Drizzle client as a parameter, enabling testing with mock clients
- **Type Safety**: Drizzle's type inference ensures repository implementations match port interfaces

### Repository Implementation

Repository adapters in `src/lib/db/adapters/postgres/` use the Drizzle client to implement the ports (insert, select, update). Map DB rows to domain types. See `order-repository.ts` and ports in source.

**Key Points**:
- Repository adapters implement ports defined in `src/lib/db/ports/`
- Domain services import ports, not adapters
- Drizzle client is injected, allowing test doubles in unit tests

### Schema-First Approach

Drizzle follows a **schema-first** workflow where the TypeScript schema file is the single source of truth:

- **Schema Definition**: All tables, columns, indexes, and constraints are defined in `src/lib/db/schema.ts`
- **Migration Generation**: Drizzle generates SQL migrations from schema changes automatically
- **Benefits**:
  - Type safety: Schema changes immediately reflect in TypeScript types
  - Version control friendly: Schema file is easy to review and diff
  - Auto-completion: IDE provides full autocomplete for table/column names
  - Single source of truth: No need to manually maintain migration files

### Migration Workflow

We use `drizzle-kit` for managing migrations. The standard workflow is:

1. **Modify Schema**: Edit `src/lib/db/schema.ts` (add tables, columns, indexes, etc.)
2. **Generate Migration**: Run `pnpm db:generate`
   - Creates SQL file in `drizzle/` directory with timestamp
   - Review generated SQL before applying to ensure correctness
   - Migration files are version-controlled alongside schema changes
3. **Apply Migration**:
   - **Local Development**: `pnpm db:migrate` (applies pending migrations)
   - **Production**: Run migration script on container startup (see Production Migration Strategy below)
4. **Verify**: Use `pnpm db:studio` to inspect database state and verify changes

### Command Reference

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `pnpm db:generate` | Generate SQL migration files from schema changes | After modifying `src/lib/db/schema.ts` |
| `pnpm db:migrate` | Apply pending migrations to database (requires `db:generate` first) | Local development, production deployments |
| `pnpm db:push` | Push schema changes directly without migration files | Prototyping, local development only |
| `pnpm db:studio` | Open Drizzle Studio (database GUI) | Inspecting data, debugging queries |

### `db:push` vs `db:migrate`

**Use `db:migrate` (recommended)**:
- Production deployments
- Team collaboration (migrations are version-controlled)
- When you need migration history
- When rollback capability is important

**Use `db:push` (prototyping only)**:
- Rapid local prototyping
- Quick schema experiments
- When migration history doesn't matter
- **Never use in production** - it bypasses migration tracking

### Production Migration Strategy

Migrations run automatically on container startup:

1. **Container Startup Script**: Execute `pnpm db:migrate` before starting the application
2. **Idempotency**: Drizzle tracks applied migrations, so re-running is safe
3. **Failure Handling**: If migrations fail, container startup fails (prevents running with mismatched schema)
4. **Zero-Downtime**: For production, consider running migrations separately before deploying new code

Example startup script:

```bash
#!/bin/bash
set -e

# Apply pending migrations
pnpm db:migrate

# Start application
pnpm start
```

### Rollback Strategy

Drizzle does not provide automatic rollback migrations. We follow a **"Fix Forward"** strategy:

1. **If Migration Fails**: Fix the migration SQL file and re-run `db:migrate`
2. **If Bad Schema Change**: Create a new migration that reverts the change
3. **If Data Corruption**: Restore from backup (migrations don't protect against data loss)

**Best Practices**:
- Always review generated SQL before applying
- Test migrations on staging environment first
- Keep database backups before major migrations
- Use transactions for multi-step migrations when possible

### Configuration

`drizzle.config.ts` in the root:

```typescript
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  driver: "pg",
  dbCredentials: {
    connectionString: process.env.DATABASE_URL!,
  },
} satisfies Config;
```

## Consequences

### Positive
- **Type Safety**: End-to-end type safety from database to API.
- **Performance**: Minimal overhead suitable for high-frequency checks.
- **Developer Experience**: SQL-like syntax is intuitive for backend engineers.
- **Migration Management**: Automated SQL generation reduces manual errors.

### Negative
- **Newer Tool**: Drizzle is newer than TypeORM/Prisma, so ecosystem is smaller (but growing fast).
- **SQL Knowledge Required**: Unlike Prisma, you need to understand SQL concepts (joins, indexes) to use it effectively.

### Risks
- **Complex Queries**: Very complex analytical queries might be harder to write in the builder than raw SQL (can drop to `sql` template tag if needed).

## References
- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [Drizzle Kit Documentation](https://orm.drizzle.team/kit-docs/overview)
- [ADR-0002: Hexagonal-Inspired Architecture](0002-hexagonal-inspired-architecture.md)
- [ADR-0005: Database Strategy](0005-database-strategy.md)
