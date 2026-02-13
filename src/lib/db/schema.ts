import { bigint, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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

export const marketSnapshot = pgTable(
  "market_snapshot",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    market: text("market").notNull(),
    marketName: text("market_name").notNull(),
    price: bigint("price", { mode: "bigint" }).notNull(),
    longFundingRate: bigint("long_funding_rate", { mode: "bigint" }).notNull(),
    shortFundingRate: bigint("short_funding_rate", { mode: "bigint" }).notNull(),
    longOpenInterestUsd: bigint("long_open_interest_usd", { mode: "bigint" }).notNull(),
    shortOpenInterestUsd: bigint("short_open_interest_usd", { mode: "bigint" }).notNull(),
    borrowRateLong: bigint("borrow_rate_long", { mode: "bigint" }).notNull(),
    borrowRateShort: bigint("borrow_rate_short", { mode: "bigint" }).notNull(),
    oiSkewRatio: bigint("oi_skew_ratio", { mode: "bigint" }),
    gasPriceGwei: bigint("gas_price_gwei", { mode: "bigint" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    marketTsIdx: index("idx_market_snapshot_market_ts").on(table.market, table.ts),
  }),
);

export const executionEstimate = pgTable(
  "execution_estimate",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    market: text("market").notNull(),
    sizeUsd: bigint("size_usd", { mode: "bigint" }).notNull(),
    simulatedImpactBps: bigint("simulated_impact_bps", { mode: "bigint" }).notNull(),
    estimatedGasUsd: bigint("estimated_gas_usd", { mode: "bigint" }),
    acceptablePrice: bigint("acceptable_price", { mode: "bigint" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    marketTsIdx: index("idx_execution_estimate_market_ts").on(table.market, table.ts),
  }),
);
