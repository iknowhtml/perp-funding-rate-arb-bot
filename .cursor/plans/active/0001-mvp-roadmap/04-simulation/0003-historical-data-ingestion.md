---
name: Historical Data Ingestion
overview: Implement historical data collection and storage for backtesting.
todos:
  - id: database-schema
    content: Create database tables for historical data
    status: pending
  - id: funding-ingestion
    content: Implement funding rate data collection from exchange API
    status: pending
  - id: price-ingestion
    content: Implement price data collection
    status: pending
  - id: orderbook-ingestion
    content: Implement order book snapshot collection (optional)
    status: pending
  - id: data-loader
    content: Implement historical data loader for backtesting
    status: pending
  - id: tests
    content: Add unit tests for data ingestion
    status: pending
  - id: lifecycle-management
    content: Move plan to implemented/ directory after completion (update todos, check validation boxes, update roadmap link, move file, delete from active/)
    status: pending
isProject: false
---

> **Note**: This plan is part of Phase 4 (Simulation) in [MVP Roadmap](../README.md).

# Historical Data Ingestion

## Overview

Implement historical data collection and storage in Postgres for backtesting. The bot needs historical:
- Funding rates (for strategy backtesting)
- Prices (for P&L calculation)
- Order book snapshots (for slippage backtesting, optional)

Reference: [ADR-0016: Backtesting & Simulation](../../../../../adrs/0016-backtesting-simulation.md)

## Tasks

### 1. Database Schema

Create migration `drizzle/xxxx_historical_data.sql`:

```sql
-- Historical funding rate data
CREATE TABLE historical_funding_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange TEXT NOT NULL,
  symbol TEXT NOT NULL,
  funding_rate_bps BIGINT NOT NULL,
  predicted_rate_bps BIGINT,
  mark_price_quote BIGINT NOT NULL,
  index_price_quote BIGINT NOT NULL,
  snapshot_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Historical price data (for slippage estimation)
CREATE TABLE historical_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange TEXT NOT NULL,
  symbol TEXT NOT NULL,
  price_quote BIGINT NOT NULL,
  volume_24h BIGINT,
  snapshot_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Historical order book snapshots (for slippage backtesting)
CREATE TABLE historical_order_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange TEXT NOT NULL,
  symbol TEXT NOT NULL,
  bids JSONB NOT NULL, -- Array of {price, quantity}
  asks JSONB NOT NULL,
  snapshot_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for time-series queries
CREATE INDEX idx_historical_funding_rates_symbol_snapshot 
  ON historical_funding_rates(exchange, symbol, snapshot_at DESC);
CREATE INDEX idx_historical_prices_symbol_snapshot 
  ON historical_prices(exchange, symbol, snapshot_at DESC);
CREATE INDEX idx_historical_order_books_symbol_snapshot 
  ON historical_order_books(exchange, symbol, snapshot_at DESC);
```

Create Drizzle schema `src/lib/db/schema/historical.ts`:

```typescript
import { pgTable, uuid, text, bigint, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const historicalFundingRates = pgTable(
  "historical_funding_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exchange: text("exchange").notNull(),
    symbol: text("symbol").notNull(),
    fundingRateBps: bigint("funding_rate_bps", { mode: "bigint" }).notNull(),
    predictedRateBps: bigint("predicted_rate_bps", { mode: "bigint" }),
    markPriceQuote: bigint("mark_price_quote", { mode: "bigint" }).notNull(),
    indexPriceQuote: bigint("index_price_quote", { mode: "bigint" }).notNull(),
    snapshotAt: timestamp("snapshot_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    symbolSnapshotIdx: index("idx_historical_funding_rates_symbol_snapshot")
      .on(table.exchange, table.symbol, table.snapshotAt),
  })
);

export const historicalPrices = pgTable(
  "historical_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exchange: text("exchange").notNull(),
    symbol: text("symbol").notNull(),
    priceQuote: bigint("price_quote", { mode: "bigint" }).notNull(),
    volume24h: bigint("volume_24h", { mode: "bigint" }),
    snapshotAt: timestamp("snapshot_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    symbolSnapshotIdx: index("idx_historical_prices_symbol_snapshot")
      .on(table.exchange, table.symbol, table.snapshotAt),
  })
);

export const historicalOrderBooks = pgTable(
  "historical_order_books",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exchange: text("exchange").notNull(),
    symbol: text("symbol").notNull(),
    bids: jsonb("bids").notNull(),
    asks: jsonb("asks").notNull(),
    snapshotAt: timestamp("snapshot_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    symbolSnapshotIdx: index("idx_historical_order_books_symbol_snapshot")
      .on(table.exchange, table.symbol, table.snapshotAt),
  })
);
```

### 2. Funding Rate Ingestion

Create `src/lib/data-ingestion/funding.ts`:

```typescript
export interface FundingIngestionConfig {
  exchange: string;
  symbols: string[];
  intervalMs: number; // How often to poll (e.g., 8 hours)
}

export const ingestFundingRate = async (
  adapter: ExchangeAdapter,
  db: Database,
  exchange: string,
  symbol: string,
): Promise<void> => {
  const fundingRate = await adapter.getFundingRate(symbol);
  const ticker = await adapter.getTicker(symbol);

  await db.insert(historicalFundingRates).values({
    exchange,
    symbol,
    fundingRateBps: fundingRate.rateBps,
    predictedRateBps: fundingRate.predictedRateBps ?? null,
    markPriceQuote: ticker.lastPriceQuote,
    indexPriceQuote: ticker.lastPriceQuote, // Use mark as index if not available
    snapshotAt: new Date(),
  });
};

export const createFundingIngestionJob = (
  config: FundingIngestionConfig,
  adapter: ExchangeAdapter,
  db: Database,
  logger: Logger,
): { start: () => void; stop: () => void } => {
  let intervalId: NodeJS.Timeout | null = null;

  return {
    start: () => {
      const ingest = async () => {
        for (const symbol of config.symbols) {
          try {
            await ingestFundingRate(adapter, db, config.exchange, symbol);
            logger.info("Funding rate ingested", { exchange: config.exchange, symbol });
          } catch (error) {
            logger.error("Funding ingestion failed", { symbol, error: error as Error });
          }
        }
      };

      // Ingest immediately, then at interval
      void ingest();
      intervalId = setInterval(() => {
        void ingest();
      }, config.intervalMs);
    },
    stop: () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
  };
};
```

### 3. Price Data Ingestion

Create `src/lib/data-ingestion/prices.ts`:

```typescript
export const ingestPrice = async (
  adapter: ExchangeAdapter,
  db: Database,
  exchange: string,
  symbol: string,
): Promise<void> => {
  const ticker = await adapter.getTicker(symbol);

  await db.insert(historicalPrices).values({
    exchange,
    symbol,
    priceQuote: ticker.lastPriceQuote,
    volume24h: ticker.volume24hBase,
    snapshotAt: new Date(),
  });
};
```

### 4. Order Book Ingestion (Optional)

Create `src/lib/data-ingestion/orderbook.ts`:

```typescript
export const ingestOrderBook = async (
  adapter: ExchangeAdapter,
  db: Database,
  exchange: string,
  symbol: string,
  depth: number = 20,
): Promise<void> => {
  const orderBook = await adapter.getOrderBook(symbol);

  await db.insert(historicalOrderBooks).values({
    exchange,
    symbol,
    bids: orderBook.bids.slice(0, depth).map((b) => ({
      price: b.price.toString(),
      quantity: b.quantity.toString(),
    })),
    asks: orderBook.asks.slice(0, depth).map((a) => ({
      price: a.price.toString(),
      quantity: a.quantity.toString(),
    })),
    snapshotAt: new Date(),
  });
};
```

### 5. Historical Data Loader

Create `src/lib/data-ingestion/loader.ts`:

```typescript
export interface HistoricalDataLoader {
  loadFundingRates(
    exchange: string,
    symbol: string,
    startDate: Date,
    endDate: Date,
  ): Promise<FundingRateSnapshot[]>;
  
  loadPrices(
    exchange: string,
    symbol: string,
    startDate: Date,
    endDate: Date,
  ): Promise<PriceSnapshot[]>;
  
  loadOrderBook(
    exchange: string,
    symbol: string,
    timestamp: Date,
  ): Promise<OrderBookSnapshot | null>;
}

export const createHistoricalDataLoader = (db: Database): HistoricalDataLoader => {
  return {
    loadFundingRates: async (exchange, symbol, startDate, endDate) => {
      const rows = await db
        .select()
        .from(historicalFundingRates)
        .where(
          and(
            eq(historicalFundingRates.exchange, exchange),
            eq(historicalFundingRates.symbol, symbol),
            gte(historicalFundingRates.snapshotAt, startDate),
            lte(historicalFundingRates.snapshotAt, endDate),
          )
        )
        .orderBy(asc(historicalFundingRates.snapshotAt));

      return rows.map((row) => ({
        symbol: row.symbol,
        currentRateBps: row.fundingRateBps,
        predictedRateBps: row.predictedRateBps ?? row.fundingRateBps,
        nextFundingTime: new Date(row.snapshotAt.getTime() + 8 * 60 * 60 * 1000),
        lastFundingTime: row.snapshotAt,
        markPrice: row.markPriceQuote,
        indexPrice: row.indexPriceQuote,
        timestamp: row.snapshotAt,
        source: "exchange" as const,
      }));
    },

    loadPrices: async (exchange, symbol, startDate, endDate) => {
      const rows = await db
        .select()
        .from(historicalPrices)
        .where(
          and(
            eq(historicalPrices.exchange, exchange),
            eq(historicalPrices.symbol, symbol),
            gte(historicalPrices.snapshotAt, startDate),
            lte(historicalPrices.snapshotAt, endDate),
          )
        )
        .orderBy(asc(historicalPrices.snapshotAt));

      return rows.map((row) => ({
        symbol: row.symbol,
        price: row.priceQuote,
        timestamp: row.snapshotAt,
      }));
    },

    loadOrderBook: async (exchange, symbol, timestamp) => {
      const row = await db
        .select()
        .from(historicalOrderBooks)
        .where(
          and(
            eq(historicalOrderBooks.exchange, exchange),
            eq(historicalOrderBooks.symbol, symbol),
            lte(historicalOrderBooks.snapshotAt, timestamp),
          )
        )
        .orderBy(desc(historicalOrderBooks.snapshotAt))
        .limit(1)
        .then((rows) => rows[0] ?? null);

      if (!row) return null;

      return {
        bids: (row.bids as Array<{ price: string; quantity: string }>).map((b) => ({
          price: BigInt(b.price),
          quantity: BigInt(b.quantity),
        })),
        asks: (row.asks as Array<{ price: string; quantity: string }>).map((a) => ({
          price: BigInt(a.price),
          quantity: BigInt(a.quantity),
        })),
        timestamp: row.snapshotAt,
      };
    },
  };
};
```

## File Structure

```
src/lib/data-ingestion/
├── types.ts              # Ingestion types
├── funding.ts            # Funding rate ingestion
├── funding.test.ts
├── prices.ts             # Price ingestion
├── prices.test.ts
├── orderbook.ts          # Order book ingestion
├── orderbook.test.ts
├── loader.ts             # Historical data loader
├── loader.test.ts
└── index.ts              # Re-exports

src/lib/db/schema/
└── historical.ts         # Historical data tables
```

## Dependencies

No new dependencies required (uses existing Drizzle ORM).

## Validation

- [ ] Database migration runs successfully
- [ ] Funding rates ingested correctly
- [ ] Prices ingested correctly
- [ ] Order books ingested correctly (optional)
- [ ] Historical data loader queries work
- [ ] Time-series indexes perform well
- [ ] Unit tests pass

## References

- [MVP Roadmap](../README.md)
- [ADR-0016: Backtesting & Simulation](../../../../../adrs/0016-backtesting-simulation.md)
- [ADR-0005: Database Strategy](../../../../../adrs/0005-database-strategy.md)
