export type OrderSide = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT" | "IOC" | "FOK";
export type OrderStatus =
  | "PENDING"
  | "OPEN"
  | "FILLED"
  | "PARTIALLY_FILLED"
  | "CANCELLED"
  | "REJECTED";

export interface Order {
  id: string;
  exchange: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantityBase: bigint;
  priceQuote: bigint | null;
  status: OrderStatus;
  exchangeOrderId: string | null;
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOrderInput {
  exchange: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantityBase: bigint;
  priceQuote?: bigint | null;
  status: OrderStatus;
  exchangeOrderId?: string | null;
  idempotencyKey?: string | null;
}

export interface OrderFilters {
  exchange?: string;
  symbol?: string;
  status?: OrderStatus;
  limit?: number;
  offset?: number;
}

export interface OrderRepository {
  create(order: CreateOrderInput): Promise<Order>;
  findById(id: string): Promise<Order | null>;
  findByExchangeOrderId(exchange: string, exchangeOrderId: string): Promise<Order | null>;
  update(id: string, updates: Partial<Order>): Promise<Order>;
  list(filters: OrderFilters): Promise<Order[]>;
}
