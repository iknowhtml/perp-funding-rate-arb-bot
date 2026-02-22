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
import { bigint, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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

export const marketSnapshot = pgTable(
  "market_snapshot",
  {
    id: uuid().primaryKey().defaultRandom(),
    timestamp: timestamp({ withTimezone: true }).notNull(),
    market: text().notNull(),
    marketName: text().notNull(),
    price: bigint({ mode: "bigint" }).notNull(),
    longFundingRate: bigint({ mode: "bigint" }).notNull(),
    shortFundingRate: bigint({ mode: "bigint" }).notNull(),
    longOpenInterestUsd: bigint({ mode: "bigint" }).notNull(),
    shortOpenInterestUsd: bigint({ mode: "bigint" }).notNull(),
    borrowRateLong: bigint({ mode: "bigint" }).notNull(),
    borrowRateShort: bigint({ mode: "bigint" }).notNull(),
    oiSkewRatio: bigint({ mode: "bigint" }),
    gasPriceGwei: bigint({ mode: "bigint" }),
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
    sizeUsd: bigint({ mode: "bigint" }).notNull(),
    simulatedImpactBps: bigint({ mode: "bigint" }).notNull(),
    estimatedGasUsd: bigint({ mode: "bigint" }),
    acceptablePrice: bigint({ mode: "bigint" }),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (table) => [index("idx_execution_estimate_market_timestamp").on(table.market, table.timestamp)],
);
