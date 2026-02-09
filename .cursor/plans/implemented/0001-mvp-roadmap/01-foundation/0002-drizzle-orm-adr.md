---
name: ADR-0006 Drizzle ORM Documentation
overview: Document Drizzle ORM as the database query layer, including schema-first approach and migration workflow.
todos:
  - id: document-drizzle
    content: Document Drizzle as database query layer
    status: completed
  - id: explain-schema-first
    content: Explain schema-first approach
    status: completed
  - id: document-migrations
    content: Document migration workflow
    status: completed
isProject: false
---

> **Note**: This plan is part of Phase 1 (Foundation) in [MVP Roadmap](../../../active/0001-mvp-roadmap/README.md).

# ADR-0006: Drizzle ORM Documentation

## Overview

Create comprehensive documentation for using Drizzle ORM as the database query layer. This ADR should explain the decision, implementation approach, and migration workflow.

## Tasks

### 1. Document Drizzle as Database Query Layer

Update `adrs/0006-drizzle-orm.md` with:

- **Why Drizzle**: Lightweight, type-safe, zero runtime overhead
- **Comparison**: vs Prisma, TypeORM, Kysely, raw SQL
- **Integration**: How it fits with hexagonal architecture (ports/adapters)

### 2. Explain Schema-First Approach

Document the schema-first workflow:

- Schema defined in TypeScript (`src/lib/db/schema.ts`)
- Drizzle generates SQL migrations from schema changes
- Single source of truth (schema file, not migration files)
- Benefits: Type safety, version control friendly, auto-completion

### 3. Document Migration Workflow

Create clear migration workflow documentation:

```markdown
## Migration Workflow

1. **Modify Schema**: Edit `src/lib/db/schema.ts`
2. **Generate Migration**: Run `pnpm db:generate`
   - Creates SQL file in `drizzle/` directory
   - Review generated SQL before applying
3. **Apply Migration**:
   - Local: `pnpm db:migrate`
   - Production: Run migration script on container startup
4. **Verify**: Check `pnpm db:studio` to inspect database state
```

Include:
- Command reference (`db:generate`, `db:migrate`, `db:push`, `db:studio`)
- When to use `db:push` vs `db:migrate`
- Production migration strategy
- Rollback procedures

## Dependencies

- Drizzle ORM knowledge
- Understanding of hexagonal architecture (ADR-0002)

## Validation

- [x] ADR-0006 is complete and comprehensive
- [x] Schema-first approach is clearly explained
- [x] Migration workflow is documented with examples
- [x] Command reference is accurate
- [x] Production migration strategy is defined

## References

- [MVP Roadmap](../../../active/0001-mvp-roadmap/README.md)
- [ADR-0002: Hexagonal-Inspired Architecture](../../../../../adrs/0002-hexagonal-inspired-architecture.md)
- [ADR-0005: Database Strategy](../../../../../adrs/0005-database-strategy.md)
- [ADR-0006: Drizzle ORM](../../../../../adrs/0006-drizzle-orm.md)
- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [Drizzle Kit Documentation](https://orm.drizzle.team/kit-docs/overview)
