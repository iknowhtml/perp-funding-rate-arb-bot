---
name: Database Setup
overview: Set up Drizzle ORM with schema definitions, client factory, migrations, and repository interfaces.
todos:
  - id: drizzle-config
    content: Create drizzle.config.ts configuration
    status: completed
  - id: db-schema
    content: Create src/lib/db/schema.ts with table definitions
    status: completed
  - id: db-client
    content: Create src/lib/db/client.ts with connection factory
    status: completed
  - id: generate-migration
    content: Generate initial migration
    status: completed
  - id: npm-scripts
    content: Add db:* npm scripts (generate, migrate, push, studio)
    status: completed
  - id: repository-interfaces
    content: Create repository interfaces (ports) per ADR-0002
    status: completed
isProject: false
---

> **Note**: This plan is part of Phase 1 (Foundation) in [MVP Roadmap](../../active/0001-mvp-roadmap/README.md).

# Database Setup

## Overview

Set up Drizzle ORM as the database query layer with schema definitions, connection management, migration support, and repository interfaces following hexagonal architecture principles.

## Tasks

### 1. Create `drizzle.config.ts`

Create configuration file at project root:

```typescript
import type { Config } from "drizzle-kit";
import { config } from "./src/lib/config";

export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: config.database.url,
  },
} satisfies Config;
```

### 2. Create `src/lib/db/schema.ts`

Define initial database schema:

```typescript
import { pgTable, text, bigint, timestamp, uuid, index } from "drizzle-orm/pg-core";

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exchange: text("exchange").notNull(),
    symbol: text("symbol").notNull(),
    side: text("side").notNull(), // 'BUY' | 'SELL'
    type: text("type").notNull(), // 'MARKET' | 'LIMIT'
    quantityBase: bigint("quantity_base", { mode: "bigint" }).notNull(),
    priceQuote: bigint("price_quote", { mode: "bigint" }),
    status: text("status").notNull(),
    exchangeOrderId: text("exchange_order_id"),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    exchangeOrderIdIdx: index("idx_orders_exchange_order_id").on(table.exchangeOrderId),
    idempotencyKeyIdx: index("idx_orders_idempotency_key").on(table.idempotencyKey),
  }),
);
```

### 3. Create `src/lib/db/client.ts`

Create connection factory:

```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../config";
import * as schema from "./schema";

const connectionString = config.database.url;

const client = postgres(connectionString, {
  max: 10,
});

export const db = drizzle(client, { schema });

export type Database = typeof db;
```

### 4. Generate Initial Migration

Run migration generation:

```bash
pnpm db:generate
```

This creates SQL files in `drizzle/` directory.

### 5. Add `db:*` npm Scripts

Update `package.json`:

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  }
}
```

### 6. Repository Interfaces (Ports)

Create `src/lib/db/ports/order-repository.ts`:

```typescript
export interface OrderRepository {
  create(order: CreateOrderInput): Promise<Order>;
  findById(id: string): Promise<Order | null>;
  findByExchangeOrderId(exchange: string, exchangeOrderId: string): Promise<Order | null>;
  update(id: string, updates: Partial<Order>): Promise<Order>;
  list(filters: OrderFilters): Promise<Order[]>;
}
```

Create adapter implementation in `src/lib/db/adapters/postgres/order-repository.ts`:

```typescript
import { eq } from "drizzle-orm";
import { db } from "../../client";
import { orders } from "../../schema";
import type { OrderRepository } from "../../ports/order-repository";

export const createPostgresOrderRepository = (): OrderRepository => ({
  create: async (order) => {
    const [inserted] = await db.insert(orders).values(order).returning();
    return mapToDomain(inserted);
  },
  
  findById: async (id) => {
    const [result] = await db.select().from(orders).where(eq(orders.id, id));
    return result ? mapToDomain(result) : null;
  },
  
  // ... other methods
});
```

## File Structure

```
src/lib/db/
├── schema.ts                    # Table definitions
├── client.ts                    # Connection factory
├── ports/                       # Repository interfaces
│   └── order-repository.ts
└── adapters/
    └── postgres/
        └── order-repository.ts  # Drizzle implementation
```

## Dependencies

- `drizzle-orm`
- `drizzle-kit` (dev)
- `postgres` (pg driver)

## Validation

- [x] `drizzle.config.ts` correctly references schema and database URL
- [x] Schema definitions compile without errors
- [x] Database client connects successfully
- [x] Initial migration generates correctly
- [x] `db:*` scripts work as expected
- [x] Repository interfaces follow hexagonal architecture
- [x] Repository adapters implement interfaces correctly

## References

- [MVP Roadmap](../../active/0001-mvp-roadmap/README.md)
- [ADR-0002: Hexagonal-Inspired Architecture](../../../../adrs/0002-hexagonal-inspired-architecture.md)
- [ADR-0005: Database Strategy](../../../../adrs/0005-database-strategy.md)
- [ADR-0006: Drizzle ORM](../../../../adrs/0006-drizzle-orm.md)
- [Drizzle ORM Documentation](https://orm.drizzle.team/)
