import { describe, expect, it } from "vitest";

import {
  type ManagedOrder,
  ORDER_TERMINAL_STATES,
  createManagedOrder,
  isTerminalOrderStatus,
  transitionOrder,
} from "./order-state";

describe("order state machine", () => {
  const createTestOrder = (overrides?: Partial<ManagedOrder>): ManagedOrder => {
    const base: ManagedOrder = {
      id: "order-1",
      intentId: "intent-1",
      symbol: "BTC-USD",
      side: "BUY",
      quantityBase: 1000000n,
      filledQuantityBase: 0n,
      priceQuote: 50000000000n,
      avgFillPriceQuote: null,
      status: "CREATED",
      exchangeOrderId: null,
      submittedAt: null,
      ackedAt: null,
      cancelReason: null,
      rejectError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return { ...base, ...overrides };
  };

  describe("createManagedOrder", () => {
    it("should create order in CREATED state", () => {
      const order = createManagedOrder({
        id: "order-1",
        intentId: "intent-1",
        symbol: "BTC-USD",
        side: "BUY",
        quantityBase: 1000000n,
        priceQuote: 50000000000n,
      });

      expect(order.status).toBe("CREATED");
      expect(order.intentId).toBe("intent-1");
      expect(order.filledQuantityBase).toBe(0n);
      expect(order.exchangeOrderId).toBeNull();
      expect(order.submittedAt).toBeNull();
      expect(order.ackedAt).toBeNull();
    });
  });

  describe("isTerminalOrderStatus", () => {
    it("should return true for terminal states", () => {
      for (const status of ORDER_TERMINAL_STATES) {
        expect(isTerminalOrderStatus(status)).toBe(true);
      }
    });

    it("should return false for non-terminal states", () => {
      expect(isTerminalOrderStatus("CREATED")).toBe(false);
      expect(isTerminalOrderStatus("SUBMITTED")).toBe(false);
      expect(isTerminalOrderStatus("ACKED")).toBe(false);
      expect(isTerminalOrderStatus("PARTIAL")).toBe(false);
    });
  });

  describe("transitionOrder - happy path", () => {
    it("should transition CREATED -> SUBMITTED -> ACKED -> FILLED", () => {
      let order = createManagedOrder({
        id: "order-1",
        intentId: "intent-1",
        symbol: "BTC-USD",
        side: "BUY",
        quantityBase: 1000000n,
        priceQuote: 50000000000n,
      });

      // CREATED -> SUBMITTED
      const submitResult = transitionOrder(order, { type: "SUBMIT", orderId: "order-1" });
      expect(submitResult.ok).toBe(true);
      if (submitResult.ok) {
        expect(submitResult.from).toBe("CREATED");
        expect(submitResult.to).toBe("SUBMITTED");
        expect(submitResult.state.submittedAt).toBeInstanceOf(Date);
        order = submitResult.state;
      }

      // SUBMITTED -> ACKED
      const ackResult = transitionOrder(order, {
        type: "ACK",
        exchangeOrderId: "ex-123",
      });
      expect(ackResult.ok).toBe(true);
      if (ackResult.ok) {
        expect(ackResult.from).toBe("SUBMITTED");
        expect(ackResult.to).toBe("ACKED");
        expect(ackResult.state.exchangeOrderId).toBe("ex-123");
        expect(ackResult.state.ackedAt).toBeInstanceOf(Date);
        order = ackResult.state;
      }

      // ACKED -> FILLED
      const fillResult = transitionOrder(order, {
        type: "FILL",
        filledQtyBase: 1000000n,
        avgPriceQuote: 50001000000n,
      });
      expect(fillResult.ok).toBe(true);
      if (fillResult.ok) {
        expect(fillResult.from).toBe("ACKED");
        expect(fillResult.to).toBe("FILLED");
        expect(fillResult.state.filledQuantityBase).toBe(1000000n);
        expect(fillResult.state.avgFillPriceQuote).toBe(50001000000n);
      }
    });

    it("should transition CREATED -> SUBMITTED -> ACKED -> PARTIAL -> FILLED", () => {
      let order = createManagedOrder({
        id: "order-1",
        intentId: "intent-1",
        symbol: "BTC-USD",
        side: "BUY",
        quantityBase: 1000000n,
        priceQuote: 50000000000n,
      });

      // CREATED -> SUBMITTED
      const submitResult = transitionOrder(order, { type: "SUBMIT", orderId: "order-1" });
      expect(submitResult.ok).toBe(true);
      if (submitResult.ok) order = submitResult.state;

      // SUBMITTED -> ACKED
      const ackResult = transitionOrder(order, {
        type: "ACK",
        exchangeOrderId: "ex-123",
      });
      expect(ackResult.ok).toBe(true);
      if (ackResult.ok) order = ackResult.state;

      // ACKED -> PARTIAL
      const partialResult = transitionOrder(order, {
        type: "PARTIAL_FILL",
        filledQtyBase: 500000n,
        avgPriceQuote: 50000500000n,
      });
      expect(partialResult.ok).toBe(true);
      if (partialResult.ok) {
        expect(partialResult.from).toBe("ACKED");
        expect(partialResult.to).toBe("PARTIAL");
        expect(partialResult.state.filledQuantityBase).toBe(500000n);
        order = partialResult.state;
      }

      // PARTIAL -> FILLED
      const fillResult = transitionOrder(order, {
        type: "FILL",
        filledQtyBase: 500000n,
        avgPriceQuote: 50001000000n,
      });
      expect(fillResult.ok).toBe(true);
      if (fillResult.ok) {
        expect(fillResult.from).toBe("PARTIAL");
        expect(fillResult.to).toBe("FILLED");
        expect(fillResult.state.filledQuantityBase).toBe(1000000n);
      }
    });
  });

  describe("transitionOrder - event data application", () => {
    it("should apply SUBMIT event data", () => {
      const order = createManagedOrder({
        id: "order-1",
        intentId: "intent-1",
        symbol: "BTC-USD",
        side: "BUY",
        quantityBase: 1000000n,
        priceQuote: 50000000000n,
      });

      const result = transitionOrder(order, { type: "SUBMIT", orderId: "order-1" });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.state.submittedAt).toBeInstanceOf(Date);
        expect(result.state.updatedAt.getTime()).toBeGreaterThanOrEqual(order.createdAt.getTime());
      }
    });

    it("should apply ACK event data", () => {
      const order = createTestOrder({ status: "SUBMITTED", submittedAt: new Date() });
      const result = transitionOrder(order, { type: "ACK", exchangeOrderId: "ex-456" });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.state.exchangeOrderId).toBe("ex-456");
        expect(result.state.ackedAt).toBeInstanceOf(Date);
      }
    });

    it("should accumulate PARTIAL_FILL quantities", () => {
      const order = createTestOrder({ status: "ACKED", filledQuantityBase: 300000n });
      const result = transitionOrder(order, {
        type: "PARTIAL_FILL",
        filledQtyBase: 200000n,
        avgPriceQuote: 50001000000n,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.state.filledQuantityBase).toBe(500000n);
        expect(result.state.avgFillPriceQuote).toBe(50001000000n);
      }
    });

    it("should apply CANCEL event data", () => {
      const order = createTestOrder({ status: "ACKED" });
      const result = transitionOrder(order, { type: "CANCEL", reason: "User requested" });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.state.cancelReason).toBe("User requested");
      }
    });

    it("should apply REJECT event data", () => {
      const order = createTestOrder({ status: "SUBMITTED" });
      const result = transitionOrder(order, { type: "REJECT", error: "Insufficient balance" });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.state.rejectError).toBe("Insufficient balance");
      }
    });

    it("should apply TIMEOUT event data", () => {
      const order = createTestOrder({ status: "SUBMITTED", submittedAt: new Date() });
      const result = transitionOrder(order, { type: "TIMEOUT", reason: "ack_timeout" });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.state.cancelReason).toContain("Timeout: ack_timeout");
      }
    });
  });

  describe("transitionOrder - invalid transitions", () => {
    it("should reject transition from CREATED to ACKED", () => {
      const order = createTestOrder({ status: "CREATED" });
      const result = transitionOrder(order, { type: "ACK", exchangeOrderId: "ex-123" });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Invalid transition");
      }
    });

    it("should reject transition from SUBMITTED to FILLED", () => {
      const order = createTestOrder({ status: "SUBMITTED" });
      const result = transitionOrder(order, {
        type: "FILL",
        filledQtyBase: 1000000n,
        avgPriceQuote: 50000000000n,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Invalid transition");
      }
    });

    it("should reject transition from FILLED to any state", () => {
      const order = createTestOrder({ status: "FILLED" });
      const result = transitionOrder(order, { type: "CANCEL", reason: "test" });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("terminal state");
      }
    });

    it("should reject transition from CANCELED to any state", () => {
      const order = createTestOrder({ status: "CANCELED" });
      const result = transitionOrder(order, { type: "ACK", exchangeOrderId: "ex-123" });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("terminal state");
      }
    });

    it("should reject transition from REJECTED to any state", () => {
      const order = createTestOrder({ status: "REJECTED" });
      const result = transitionOrder(order, { type: "SUBMIT", orderId: "order-1" });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("terminal state");
      }
    });
  });

  describe("transitionOrder - timeout handling", () => {
    it("should allow TIMEOUT from SUBMITTED to CANCELED", () => {
      const order = createTestOrder({ status: "SUBMITTED", submittedAt: new Date() });
      const result = transitionOrder(order, { type: "TIMEOUT", reason: "ack_timeout" });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.to).toBe("CANCELED");
      }
    });

    it("should allow TIMEOUT from ACKED to CANCELED", () => {
      const order = createTestOrder({
        status: "ACKED",
        submittedAt: new Date(),
        ackedAt: new Date(),
      });
      const result = transitionOrder(order, { type: "TIMEOUT", reason: "fill_timeout" });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.to).toBe("CANCELED");
      }
    });

    it("should allow TIMEOUT from PARTIAL to CANCELED", () => {
      const order = createTestOrder({
        status: "PARTIAL",
        submittedAt: new Date(),
        ackedAt: new Date(),
        filledQuantityBase: 500000n,
      });
      const result = transitionOrder(order, { type: "TIMEOUT", reason: "fill_timeout" });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.to).toBe("CANCELED");
      }
    });
  });
});
