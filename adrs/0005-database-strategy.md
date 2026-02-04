# ADR 0005: Database Strategy — Postgres for Worker Ledger

- **Status:** Accepted
- **Date:** 2026-02-04
- **Owners:** -
- **Related:**
  - [ADR-0001: Bot Architecture](0001-bot-architecture.md)
  - [ADR-0002: Hexagonal-Inspired Architecture](0002-hexagonal-inspired-architecture.md)
  - [ADR-0007: Infrastructure — Fly.io Deployment](0007-infrastructure-flyio.md)

## Context

The trading bot requires persistent storage for:
- **Orders**: All order attempts and their status
- **Fills**: Execution records with prices, quantities, fees
- **State snapshots**: Periodic position/balance snapshots for reconciliation
- **Audit log**: Decision events, errors, state transitions

This data must:
- Survive container restarts
- Support transactional consistency (orders/fills/positions must match)
- Enable idempotency (retries don't double-execute)
- Provide time-series queries (PnL over time, funding snapshots)
- Allow easy backup/restore for audit and recovery

## Decision

**Use Postgres for the worker ledger.**

### Why Postgres Over Convex

Convex is excellent for product apps (reactive queries, auth, realtime UI), but a trading bot needs **boring, durable, transactional storage** with industry-standard accounting tools.

#### What You Actually Need from a DB for a Trading Bot

| Requirement | Why It Matters |
|-------------|----------------|
| **Durable writes** | No "oops we lost a fill record" — every execution must be recorded |
| **Transactional consistency** | Orders/fills/position snapshots must match atomically |
| **Idempotency keys** | Retries don't double-execute (critical for exchange API retries) |
| **Time-series queries** | Funding snapshots, PnL over time, position history |
| **Easy backup/restore** | Audit trails and disaster recovery |
| **Works offline** | Survives restarts, network partitions |

That's Postgres' home turf.

#### Where Convex Fits (and Where It Doesn't)

**Convex is good for:**
- SaaS control plane later (UI state, user configs, status dashboards)
- Realtime dashboards and "live status" views
- Simple app data

**Convex is not ideal for:**
- Your execution worker's ledger (orders, fills, positions)
- Heavy append-only event logs
- Anything where you want "industry standard" accounting + recovery tooling

If something goes wrong, you want Postgres tools (`pg_dump`, `pg_restore`, standard SQL), not "app backend magic."

### Why Postgres Over SQLite

SQLite is a valid MVP choice for absolute simplicity (single file, no service), but Postgres is the right choice for a "serious personal bot" because:

| Factor | SQLite | Postgres |
|--------|--------|----------|
| **Multi-process access** | File locking issues | Concurrent connections |
| **Remote access** | Not designed for network | Built for client-server |
| **Managed services** | None | Supabase, Neon, RDS, Fly.io |
| **Backups** | File copy | `pg_dump`, point-in-time recovery |
| **Scaling path** | Limited | Scales to SaaS multi-tenant |

#### Recommended Path (Practical)

**MVP (personal bot, single VPS):**
- SQLite if you want absolute simplicity (single file, no service)
- Upgrade once you care about multi-process or remote access

**Serious personal bot / scaling capital:**
- Postgres (managed if possible)
- Easiest: Supabase / Neon / RDS / DigitalOcean Managed Postgres
- Or Postgres container in Docker Compose (fine early)

**SaaS later:**
- Keep the worker ledger in Postgres
- If you want, add Convex for:
  - UI/control plane
  - WebSockets to browsers
  - User management
- **But don't move the trading ledger there.**

#### A Clean Split (Future-Proof)

```
┌─────────────────────────────────────────────────────────┐
│                    Worker DB (Postgres)                  │
│  - Orders                                               │
│  - Fills                                                │
│  - Positions                                            │
│  - Funding snapshots                                    │
│  - Events                                               │
└─────────────────────────────────────────────────────────┘
                        ▲
                        │
              ┌─────────┴─────────┐
              │                   │
┌─────────────▼──────┐  ┌────────▼──────────────┐
│  Control Plane DB   │  │  Control Plane DB    │
│  (Postgres)         │  │  (Convex)            │
│  - Users            │  │  - UI state          │
│  - Configs          │  │  - Realtime updates  │
│  - Billing          │  │  - User management   │
└─────────────────────┘  └─────────────────────┘
```

## Database Schema

### Core Tables

```sql
-- Orders table
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  type TEXT NOT NULL CHECK (type IN ('MARKET', 'LIMIT', 'IOC', 'FOK')),
  quantity_base BIGINT NOT NULL,
  price_quote BIGINT,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'OPEN', 'FILLED', 'PARTIALLY_FILLED', 'CANCELLED', 'REJECTED')),
  exchange_order_id TEXT UNIQUE,
  idempotency_key TEXT UNIQUE,  -- Prevent double-execution
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fills table
CREATE TABLE fills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  exchange_fill_id TEXT NOT NULL UNIQUE,  -- Exchange-provided fill ID
  price_quote BIGINT NOT NULL,
  quantity_base BIGINT NOT NULL,
  fee_quote BIGINT NOT NULL,
  fee_asset TEXT NOT NULL,
  filled_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- State snapshots (for reconciliation)
CREATE TABLE state_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot JSONB NOT NULL,  -- Full state: balances, positions, open orders
  reconciled_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit log (decision events, errors, state transitions)
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,  -- 'DECISION', 'ERROR', 'STATE_TRANSITION', 'RECONCILIATION'
  event_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Funding rate snapshots (time-series data)
CREATE TABLE funding_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange TEXT NOT NULL,
  symbol TEXT NOT NULL,
  funding_rate_bps BIGINT NOT NULL,  -- Funding rate in basis points
  mark_price_quote BIGINT NOT NULL,
  index_price_quote BIGINT NOT NULL,
  snapshot_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Indexes

```sql
-- Orders indexes
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_orders_status ON orders(status) WHERE status IN ('OPEN', 'PENDING');
CREATE INDEX idx_orders_exchange_order_id ON orders(exchange_order_id) WHERE exchange_order_id IS NOT NULL;
CREATE INDEX idx_orders_idempotency_key ON orders(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Fills indexes
CREATE INDEX idx_fills_order_id ON fills(order_id);
CREATE INDEX idx_fills_filled_at ON fills(filled_at DESC);
CREATE INDEX idx_fills_exchange_fill_id ON fills(exchange_fill_id);

-- State snapshots indexes
CREATE INDEX idx_state_snapshots_reconciled_at ON state_snapshots(reconciled_at DESC);

-- Audit log indexes
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX idx_audit_log_event_type ON audit_log(event_type);
CREATE INDEX idx_audit_log_event_type_created_at ON audit_log(event_type, created_at DESC);

-- Funding snapshots indexes (time-series queries)
CREATE INDEX idx_funding_snapshots_symbol_snapshot_at ON funding_snapshots(exchange, symbol, snapshot_at DESC);
CREATE INDEX idx_funding_snapshots_snapshot_at ON funding_snapshots(snapshot_at DESC);
```

### Migration Path (SQLite → Postgres)

If starting with SQLite, the migration is straightforward:

1. **Same schema**: Use identical table structure (UUIDs become TEXT in SQLite, but that's fine)
2. **Same queries**: Standard SQL works in both
3. **Zero rewrites**: Repository pattern (ADR-0002) abstracts the database

```typescript
// Repository interface (port) stays the same
export interface OrderRepository {
  create(order: CreateOrder): Promise<Order>;
  findByExchangeOrderId(exchangeOrderId: string): Promise<Order | null>;
  findOpenOrders(): Promise<Order[]>;
}

// SQLite adapter → Postgres adapter (swap implementation)
export const createSqliteOrderRepository = (db: Database): OrderRepository => { /* ... */ };
export const createPostgresOrderRepository = (client: Client): OrderRepository => { /* ... */ };
```

## Implementation Notes

### Idempotency Keys

Every order creation must include an idempotency key:

```typescript
import { randomUUID } from "node:crypto";

const createOrder = async (params: CreateOrderParams) => {
  const idempotencyKey = randomUUID();
  
  // Check if order already exists
  const existing = await orderRepo.findByIdempotencyKey(idempotencyKey);
  if (existing) {
    return existing;  // Return existing order, don't create duplicate
  }
  
  return orderRepo.create({ ...params, idempotencyKey });
};
```

### Transactional Consistency

Orders and fills must be created atomically:

```typescript
const recordFill = async (fill: Fill) => {
  await db.transaction(async (tx) => {
    // 1. Insert fill
    await tx.insert(fills).values(fill);
    
    // 2. Update order status
    const order = await tx.select().from(orders).where(eq(orders.id, fill.orderId));
    const newStatus = calculateOrderStatus(order, fill);
    await tx.update(orders).set({ status: newStatus }).where(eq(orders.id, fill.orderId));
    
    // 3. Update position snapshot
    await updatePositionSnapshot(tx, fill);
  });
};
```

### Time-Series Queries

Funding snapshots enable historical analysis:

```sql
-- Get funding rate over last 24 hours
SELECT 
  snapshot_at,
  funding_rate_bps,
  mark_price_quote
FROM funding_snapshots
WHERE exchange = 'binance' 
  AND symbol = 'BTCUSDT'
  AND snapshot_at >= NOW() - INTERVAL '24 hours'
ORDER BY snapshot_at DESC;
```

## Consequences

### Positive

1. **Durable storage**: Postgres ACID guarantees ensure no lost fills
2. **Transactional consistency**: Orders and fills stay in sync
3. **Industry-standard tooling**: `pg_dump`, `pg_restore`, standard SQL
4. **Managed services**: Fly.io, Supabase, Neon provide HA and backups
5. **Scaling path**: Same database can serve multiple workers and dashboards
6. **Audit trail**: Complete history of all decisions and executions

### Negative

1. **Operational overhead**: Requires database service (managed or self-hosted)
2. **Connection management**: Must handle connection pooling and retries
3. **Cost**: Managed Postgres adds baseline cost (~$7/mo for HA)

### Risks

| Risk | Mitigation |
|------|------------|
| Database connection lost | Retry with exponential backoff; alert on persistent failure |
| Transaction deadlocks | Use appropriate isolation levels; retry logic |
| Schema migrations | Use migration tooling (Drizzle, Prisma); test migrations |
| Backup failures | Verify backups regularly; test restore procedures |

## Future Considerations

1. **Read replicas**: Add read replica for dashboards/analytics (doesn't block worker writes)
2. **Partitioning**: Partition `audit_log` and `funding_snapshots` by time for better performance
3. **Archival**: Move old audit logs to cold storage (S3) after N days
4. **Control plane DB**: When building SaaS, consider Convex for UI/control plane while keeping worker ledger in Postgres

## References

- [ADR-0001: Bot Architecture](0001-bot-architecture.md) — Worker loop and state management
- [ADR-0002: Hexagonal-Inspired Architecture](0002-hexagonal-inspired-architecture.md) — Repository pattern for database abstraction
- [ADR-0007: Infrastructure — Fly.io Deployment](0007-infrastructure-flyio.md) — Managed Postgres setup
