import { describe, expect, it, vi } from "vitest";

import { createStateTransition, createTransitionLogger } from "./persistence";

// Mock logger to avoid environment variable requirements in tests
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("persistence", () => {
  describe("createStateTransition", () => {
    it("should create transition with auto-generated ID and timestamp", () => {
      const transition = createStateTransition({
        entityType: "order",
        entityId: "order-1",
        fromState: "CREATED",
        toState: "SUBMITTED",
        event: { type: "SUBMIT", orderId: "order-1" },
        correlationId: "corr-1",
      });

      expect(transition.id).toBeTruthy();
      expect(transition.timestamp).toBeInstanceOf(Date);
      expect(transition.entityType).toBe("order");
      expect(transition.entityId).toBe("order-1");
      expect(transition.fromState).toBe("CREATED");
      expect(transition.toState).toBe("SUBMITTED");
      expect(transition.event).toEqual({ type: "SUBMIT", orderId: "order-1" });
      expect(transition.correlationId).toBe("corr-1");
    });

    it("should generate unique IDs", () => {
      const t1 = createStateTransition({
        entityType: "order",
        entityId: "order-1",
        fromState: "CREATED",
        toState: "SUBMITTED",
        event: {},
        correlationId: "corr-1",
      });
      const t2 = createStateTransition({
        entityType: "order",
        entityId: "order-1",
        fromState: "CREATED",
        toState: "SUBMITTED",
        event: {},
        correlationId: "corr-1",
      });

      expect(t1.id).not.toBe(t2.id);
    });
  });

  describe("createTransitionLogger", () => {
    it("should create logger instance", () => {
      const logger = createTransitionLogger();
      expect(logger).toBeDefined();
      expect(typeof logger.log).toBe("function");
      expect(typeof logger.getTransitions).toBe("function");
      expect(typeof logger.getAll).toBe("function");
      expect(typeof logger.clear).toBe("function");
    });

    describe("log", () => {
      it("should record transitions", () => {
        const logger = createTransitionLogger();
        const transition = createStateTransition({
          entityType: "order",
          entityId: "order-1",
          fromState: "CREATED",
          toState: "SUBMITTED",
          event: { type: "SUBMIT" },
          correlationId: "corr-1",
        });

        logger.log(transition);

        const all = logger.getAll();
        expect(all.length).toBe(1);
        expect(all[0]).toEqual(transition);
      });

      it("should record multiple transitions", () => {
        const logger = createTransitionLogger();
        const t1 = createStateTransition({
          entityType: "order",
          entityId: "order-1",
          fromState: "CREATED",
          toState: "SUBMITTED",
          event: {},
          correlationId: "corr-1",
        });
        const t2 = createStateTransition({
          entityType: "order",
          entityId: "order-1",
          fromState: "SUBMITTED",
          toState: "ACKED",
          event: {},
          correlationId: "corr-1",
        });

        logger.log(t1);
        logger.log(t2);

        const all = logger.getAll();
        expect(all.length).toBe(2);
        expect(all[0]).toEqual(t1);
        expect(all[1]).toEqual(t2);
      });
    });

    describe("getTransitions", () => {
      it("should filter transitions by entityId", () => {
        const logger = createTransitionLogger();
        const t1 = createStateTransition({
          entityType: "order",
          entityId: "order-1",
          fromState: "CREATED",
          toState: "SUBMITTED",
          event: {},
          correlationId: "corr-1",
        });
        const t2 = createStateTransition({
          entityType: "order",
          entityId: "order-2",
          fromState: "CREATED",
          toState: "SUBMITTED",
          event: {},
          correlationId: "corr-2",
        });
        const t3 = createStateTransition({
          entityType: "order",
          entityId: "order-1",
          fromState: "SUBMITTED",
          toState: "ACKED",
          event: {},
          correlationId: "corr-1",
        });

        logger.log(t1);
        logger.log(t2);
        logger.log(t3);

        const order1Transitions = logger.getTransitions("order-1");
        expect(order1Transitions.length).toBe(2);
        expect(order1Transitions[0]).toEqual(t1);
        expect(order1Transitions[1]).toEqual(t3);

        const order2Transitions = logger.getTransitions("order-2");
        expect(order2Transitions.length).toBe(1);
        expect(order2Transitions[0]).toEqual(t2);
      });

      it("should return empty array for non-existent entityId", () => {
        const logger = createTransitionLogger();
        const transitions = logger.getTransitions("non-existent");
        expect(transitions.length).toBe(0);
      });
    });

    describe("getAll", () => {
      it("should return all transitions", () => {
        const logger = createTransitionLogger();
        const t1 = createStateTransition({
          entityType: "order",
          entityId: "order-1",
          fromState: "CREATED",
          toState: "SUBMITTED",
          event: {},
          correlationId: "corr-1",
        });
        const t2 = createStateTransition({
          entityType: "hedge",
          entityId: "hedge-1",
          fromState: "IDLE",
          toState: "ENTERING_PERP",
          event: {},
          correlationId: "corr-2",
        });

        logger.log(t1);
        logger.log(t2);

        const all = logger.getAll();
        expect(all.length).toBe(2);
        expect(all).toContainEqual(t1);
        expect(all).toContainEqual(t2);
      });

      it("should return empty array when no transitions logged", () => {
        const logger = createTransitionLogger();
        const all = logger.getAll();
        expect(all.length).toBe(0);
      });

      it("should return readonly array", () => {
        const logger = createTransitionLogger();
        const t1 = createStateTransition({
          entityType: "order",
          entityId: "order-1",
          fromState: "CREATED",
          toState: "SUBMITTED",
          event: {},
          correlationId: "corr-1",
        });
        logger.log(t1);

        const all = logger.getAll();
        // TypeScript should prevent mutation, but verify at runtime
        expect(() => {
          // @ts-expect-error - Testing readonly behavior
          all.push(t1);
        }).not.toThrow(); // Runtime doesn't enforce readonly, but TypeScript does
      });
    });

    describe("clear", () => {
      it("should clear all transitions", () => {
        const logger = createTransitionLogger();
        const t1 = createStateTransition({
          entityType: "order",
          entityId: "order-1",
          fromState: "CREATED",
          toState: "SUBMITTED",
          event: {},
          correlationId: "corr-1",
        });
        const t2 = createStateTransition({
          entityType: "order",
          entityId: "order-2",
          fromState: "CREATED",
          toState: "SUBMITTED",
          event: {},
          correlationId: "corr-2",
        });

        logger.log(t1);
        logger.log(t2);
        expect(logger.getAll().length).toBe(2);

        logger.clear();
        expect(logger.getAll().length).toBe(0);
        expect(logger.getTransitions("order-1").length).toBe(0);
        expect(logger.getTransitions("order-2").length).toBe(0);
      });
    });
  });
});
