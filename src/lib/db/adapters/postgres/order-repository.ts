import { and, desc, eq } from "drizzle-orm";

import { db } from "../../client";
import type {
  CreateOrderInput,
  Order,
  OrderRepository,
  OrderSide,
  OrderStatus,
  OrderType,
} from "../../ports/order-repository";
import { orders } from "../../schema";

const isValidOrderSide = (value: string): value is OrderSide => {
  return value === "BUY" || value === "SELL";
};

const isValidOrderType = (value: string): value is OrderType => {
  return value === "MARKET" || value === "LIMIT" || value === "IOC" || value === "FOK";
};

const isValidOrderStatus = (value: string): value is OrderStatus => {
  return (
    value === "PENDING" ||
    value === "OPEN" ||
    value === "FILLED" ||
    value === "PARTIALLY_FILLED" ||
    value === "CANCELLED" ||
    value === "REJECTED"
  );
};

const mapToDomain = (row: typeof orders.$inferSelect): Order => {
  if (!isValidOrderSide(row.side)) {
    throw new Error(`Invalid order side: ${row.side}`);
  }
  if (!isValidOrderType(row.type)) {
    throw new Error(`Invalid order type: ${row.type}`);
  }
  if (!isValidOrderStatus(row.status)) {
    throw new Error(`Invalid order status: ${row.status}`);
  }

  return {
    id: row.id,
    exchange: row.exchange,
    symbol: row.symbol,
    side: row.side,
    type: row.type,
    quantityBase: row.quantityBase,
    priceQuote: row.priceQuote ?? null,
    status: row.status,
    exchangeOrderId: row.exchangeOrderId ?? null,
    idempotencyKey: row.idempotencyKey ?? null,
    createdAt: row.createdAt ?? new Date(),
    updatedAt: row.updatedAt ?? new Date(),
  };
};

const mapToDb = (order: CreateOrderInput): typeof orders.$inferInsert => ({
  exchange: order.exchange,
  symbol: order.symbol,
  side: order.side,
  type: order.type,
  quantityBase: order.quantityBase,
  priceQuote: order.priceQuote ?? null,
  status: order.status,
  exchangeOrderId: order.exchangeOrderId ?? null,
  idempotencyKey: order.idempotencyKey ?? null,
});

export const createPostgresOrderRepository = (): OrderRepository => ({
  create: async (order) => {
    const [inserted] = await db.insert(orders).values(mapToDb(order)).returning();
    if (!inserted) {
      throw new Error("Failed to create order");
    }
    return mapToDomain(inserted);
  },

  findById: async (id) => {
    const [result] = await db.select().from(orders).where(eq(orders.id, id));
    return result ? mapToDomain(result) : null;
  },

  findByExchangeOrderId: async (exchange, exchangeOrderId) => {
    const [result] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.exchange, exchange), eq(orders.exchangeOrderId, exchangeOrderId)));
    return result ? mapToDomain(result) : null;
  },

  update: async (id, updates) => {
    const updateData: Partial<typeof orders.$inferInsert> = {};
    if (updates.exchange !== undefined) updateData.exchange = updates.exchange;
    if (updates.symbol !== undefined) updateData.symbol = updates.symbol;
    if (updates.side !== undefined) updateData.side = updates.side;
    if (updates.type !== undefined) updateData.type = updates.type;
    if (updates.quantityBase !== undefined) updateData.quantityBase = updates.quantityBase;
    if (updates.priceQuote !== undefined) updateData.priceQuote = updates.priceQuote ?? null;
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.exchangeOrderId !== undefined)
      updateData.exchangeOrderId = updates.exchangeOrderId ?? null;
    if (updates.idempotencyKey !== undefined)
      updateData.idempotencyKey = updates.idempotencyKey ?? null;
    updateData.updatedAt = new Date();

    const [updated] = await db.update(orders).set(updateData).where(eq(orders.id, id)).returning();
    if (!updated) {
      throw new Error(`Order with id ${id} not found`);
    }
    return mapToDomain(updated);
  },

  list: async (filters) => {
    const conditions = [];
    if (filters.exchange) {
      conditions.push(eq(orders.exchange, filters.exchange));
    }
    if (filters.symbol) {
      conditions.push(eq(orders.symbol, filters.symbol));
    }
    if (filters.status) {
      conditions.push(eq(orders.status, filters.status));
    }

    const baseQuery = db.select().from(orders);
    const withWhere = conditions.length > 0 ? baseQuery.where(and(...conditions)) : baseQuery;
    const withOrder = withWhere.orderBy(desc(orders.createdAt));
    const withLimit = filters.limit ? withOrder.limit(filters.limit) : withOrder;
    const finalQuery = filters.offset ? withLimit.offset(filters.offset) : withLimit;

    const results = await finalQuery;
    return results.map(mapToDomain);
  },
});
