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
