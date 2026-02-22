/**
 * DB schema for funding-rate arb bot.
 *
 * On-chain suitability (GMX / protocol-agnostic):
 *
 * - orders: Holds both CEX-style and on-chain orders. exchange = protocol (e.g. "gmx").
 *   txHash = transaction hash (0x-prefixed hex) is the canonical on-chain identifier; use for
 *   idempotency, reconciliation (receipt lookup), and support. exchangeOrderId = protocol-specific
 *   order id when available. Indexes: exchange_order_id, idempotency_key, tx_hash.
 *
 * - market_snapshot: Time-series of market data (funding, OI, borrow rates). market = contract
 *   address (e.g. GMX market). All amounts in bigint; suitable for on-chain. Optional future:
 *   chainId if multi-chain.
 *
 * - execution_estimate: Pre-execution simulation (impact, gas, acceptable price). No tx hash;
 *   optional future: txHash to link estimate → executed order for analytics.
 */
import { bigint, index, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const orders = pgTable(
  "orders",
  {
    id: uuid().primaryKey().defaultRandom(),
    exchange: text().notNull(),
    symbol: text().notNull(),
    side: text().notNull(), // 'BUY' | 'SELL'
    type: text().notNull(), // 'MARKET' | 'LIMIT'
    quantityBase: bigint({ mode: "bigint" }).notNull(),
    priceQuote: bigint({ mode: "bigint" }),
    status: text().notNull(),
    exchangeOrderId: text(),
    /** On-chain: transaction hash (0x-prefixed hex). Canonical identifier for submitted txs. */
    txHash: text(),
    idempotencyKey: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_orders_idempotency_key").on(table.idempotencyKey),
    index("idx_orders_tx_hash").on(table.txHash),
  ],
);

/** Precision for numeric columns that can exceed PostgreSQL bigint (e.g. 30-decimal prices). */
const NUMERIC_PRECISION = 78;

export const marketSnapshot = pgTable(
  "market_snapshot",
  {
    id: uuid().primaryKey().defaultRandom(),
    timestamp: timestamp({ withTimezone: true }).notNull(),
    market: text().notNull(),
    marketName: text().notNull(),
    price: numeric({ precision: NUMERIC_PRECISION, scale: 0, mode: "bigint" }).notNull(),
    longFundingRate: numeric({ precision: NUMERIC_PRECISION, scale: 0, mode: "bigint" }).notNull(),
    shortFundingRate: numeric({ precision: NUMERIC_PRECISION, scale: 0, mode: "bigint" }).notNull(),
    longOpenInterestUsd: numeric({
      precision: NUMERIC_PRECISION,
      scale: 0,
      mode: "bigint",
    }).notNull(),
    shortOpenInterestUsd: numeric({
      precision: NUMERIC_PRECISION,
      scale: 0,
      mode: "bigint",
    }).notNull(),
    borrowRateLong: numeric({ precision: NUMERIC_PRECISION, scale: 0, mode: "bigint" }).notNull(),
    borrowRateShort: numeric({ precision: NUMERIC_PRECISION, scale: 0, mode: "bigint" }).notNull(),
    oiSkewRatio: numeric({ precision: NUMERIC_PRECISION, scale: 0, mode: "bigint" }),
    gasPriceGwei: numeric({ precision: NUMERIC_PRECISION, scale: 0, mode: "bigint" }),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (table) => [index("idx_market_snapshot_market_timestamp").on(table.market, table.timestamp)],
);

export const executionEstimate = pgTable(
  "execution_estimate",
  {
    id: uuid().primaryKey().defaultRandom(),
    timestamp: timestamp({ withTimezone: true }).notNull(),
    market: text().notNull(),
    sizeUsd: numeric({ precision: NUMERIC_PRECISION, scale: 0, mode: "bigint" }).notNull(),
    simulatedImpactBps: numeric({
      precision: NUMERIC_PRECISION,
      scale: 0,
      mode: "bigint",
    }).notNull(),
    estimatedGasUsd: numeric({ precision: NUMERIC_PRECISION, scale: 0, mode: "bigint" }),
    acceptablePrice: numeric({ precision: NUMERIC_PRECISION, scale: 0, mode: "bigint" }),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (table) => [index("idx_execution_estimate_market_timestamp").on(table.market, table.timestamp)],
);
