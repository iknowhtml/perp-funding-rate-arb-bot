import { describe, expect, it } from "vitest";

import { type HedgeState, isTerminalHedgePhase, transitionHedge } from "./hedge-state";

describe("hedge state machine", () => {
  describe("isTerminalHedgePhase", () => {
    it("should return true for CLOSED phase", () => {
      expect(isTerminalHedgePhase("CLOSED")).toBe(true);
    });

    it("should return false for non-terminal phases", () => {
      expect(isTerminalHedgePhase("IDLE")).toBe(false);
      expect(isTerminalHedgePhase("ENTERING_PERP")).toBe(false);
      expect(isTerminalHedgePhase("ACTIVE")).toBe(false);
    });
  });

  describe("transitionHedge - entry flow", () => {
    it("should transition IDLE -> ENTERING_PERP -> ENTERING_SPOT -> ACTIVE", () => {
      let state: HedgeState = { phase: "IDLE" };

      // IDLE -> ENTERING_PERP
      const startResult = transitionHedge(state, {
        type: "START_ENTRY",
        intentId: "intent-1",
        symbol: "BTC-USD",
      });
      expect(startResult.ok).toBe(true);
      if (startResult.ok) {
        expect(startResult.from).toBe("IDLE");
        expect(startResult.to).toBe("ENTERING_PERP");
        expect(startResult.state.phase).toBe("ENTERING_PERP");
        if (startResult.state.phase === "ENTERING_PERP") {
          expect(startResult.state.intentId).toBe("intent-1");
          expect(startResult.state.symbol).toBe("BTC-USD");
        }
        state = startResult.state;
      }

      // ENTERING_PERP -> ENTERING_SPOT
      const perpFilledResult = transitionHedge(state, {
        type: "PERP_FILLED",
        filledQtyBase: 1000000n,
      });
      expect(perpFilledResult.ok).toBe(true);
      if (perpFilledResult.ok) {
        expect(perpFilledResult.from).toBe("ENTERING_PERP");
        expect(perpFilledResult.to).toBe("ENTERING_SPOT");
        expect(perpFilledResult.state.phase).toBe("ENTERING_SPOT");
        if (perpFilledResult.state.phase === "ENTERING_SPOT") {
          expect(perpFilledResult.state.perpFilled).toBe(true);
          expect(perpFilledResult.state.symbol).toBe("BTC-USD");
        }
        state = perpFilledResult.state;
      }

      // ENTERING_SPOT -> ACTIVE
      const spotFilledResult = transitionHedge(state, {
        type: "SPOT_FILLED",
        filledQtyBase: 1000000n,
      });
      expect(spotFilledResult.ok).toBe(true);
      if (spotFilledResult.ok) {
        expect(spotFilledResult.from).toBe("ENTERING_SPOT");
        expect(spotFilledResult.to).toBe("ACTIVE");
        expect(spotFilledResult.state.phase).toBe("ACTIVE");
        if (spotFilledResult.state.phase === "ACTIVE") {
          expect(spotFilledResult.state.symbol).toBe("BTC-USD");
          expect(spotFilledResult.state.spotQtyBase).toBe(1000000n);
        }
        state = spotFilledResult.state;
      }
    });
  });

  describe("transitionHedge - exit flow", () => {
    it("should transition ACTIVE -> EXITING_SPOT -> EXITING_PERP -> CLOSED", () => {
      let state: HedgeState = {
        phase: "ACTIVE",
        symbol: "BTC-USD",
        notionalQuote: 50000000000000n,
        spotQtyBase: 1000000n,
        perpQtyBase: 1000000n,
      };

      // ACTIVE -> EXITING_SPOT
      const startExitResult = transitionHedge(state, {
        type: "START_EXIT",
        reason: "Funding rate changed",
      });
      expect(startExitResult.ok).toBe(true);
      if (startExitResult.ok) {
        expect(startExitResult.from).toBe("ACTIVE");
        expect(startExitResult.to).toBe("EXITING_SPOT");
        expect(startExitResult.state.phase).toBe("EXITING_SPOT");
        if (startExitResult.state.phase === "EXITING_SPOT") {
          expect(startExitResult.state.symbol).toBe("BTC-USD");
        }
        state = startExitResult.state;
      }

      // EXITING_SPOT -> EXITING_PERP
      const spotSoldResult = transitionHedge(state, { type: "SPOT_SOLD" });
      expect(spotSoldResult.ok).toBe(true);
      if (spotSoldResult.ok) {
        expect(spotSoldResult.from).toBe("EXITING_SPOT");
        expect(spotSoldResult.to).toBe("EXITING_PERP");
        expect(spotSoldResult.state.phase).toBe("EXITING_PERP");
        if (spotSoldResult.state.phase === "EXITING_PERP") {
          expect(spotSoldResult.state.symbol).toBe("BTC-USD");
        }
        state = spotSoldResult.state;
      }

      // EXITING_PERP -> CLOSED
      const perpClosedResult = transitionHedge(state, {
        type: "PERP_CLOSED",
        pnlQuote: 1000000n,
      });
      expect(perpClosedResult.ok).toBe(true);
      if (perpClosedResult.ok) {
        expect(perpClosedResult.from).toBe("EXITING_PERP");
        expect(perpClosedResult.to).toBe("CLOSED");
        expect(perpClosedResult.state.phase).toBe("CLOSED");
        if (perpClosedResult.state.phase === "CLOSED") {
          expect(perpClosedResult.state.symbol).toBe("BTC-USD");
          expect(perpClosedResult.state.pnlQuote).toBe(1000000n);
        }
      }
    });
  });

  describe("transitionHedge - abort flow", () => {
    it("should abort from ENTERING_PERP back to IDLE", () => {
      const state: HedgeState = {
        phase: "ENTERING_PERP",
        intentId: "intent-1",
        symbol: "BTC-USD",
      };

      const result = transitionHedge(state, { type: "ABORT", reason: "Risk limit exceeded" });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.from).toBe("ENTERING_PERP");
        expect(result.to).toBe("IDLE");
        expect(result.state.phase).toBe("IDLE");
      }
    });

    it("should abort from ENTERING_SPOT back to IDLE", () => {
      const state: HedgeState = {
        phase: "ENTERING_SPOT",
        perpFilled: true,
        symbol: "BTC-USD",
      };

      const result = transitionHedge(state, { type: "ABORT", reason: "Market conditions changed" });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.from).toBe("ENTERING_SPOT");
        expect(result.to).toBe("IDLE");
        expect(result.state.phase).toBe("IDLE");
      }
    });
  });

  describe("transitionHedge - invalid transitions", () => {
    it("should reject transition from IDLE to ACTIVE", () => {
      const state: HedgeState = { phase: "IDLE" };
      const result = transitionHedge(state, {
        type: "SPOT_FILLED",
        filledQtyBase: 1000000n,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Invalid transition");
      }
    });

    it("should reject transition from ACTIVE to CLOSED", () => {
      const state: HedgeState = {
        phase: "ACTIVE",
        symbol: "BTC-USD",
        notionalQuote: 50000000000000n,
        spotQtyBase: 1000000n,
        perpQtyBase: 1000000n,
      };
      const result = transitionHedge(state, {
        type: "PERP_CLOSED",
        pnlQuote: 1000000n,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Invalid transition");
      }
    });

    it("should reject transition from CLOSED to any state", () => {
      const state: HedgeState = {
        phase: "CLOSED",
        symbol: "BTC-USD",
        pnlQuote: 1000000n,
      };
      const result = transitionHedge(state, {
        type: "START_ENTRY",
        intentId: "intent-2",
        symbol: "ETH-USD",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("terminal phase");
      }
    });
  });

  describe("transitionHedge - phase data validation", () => {
    it("should preserve symbol through transitions", () => {
      let state: HedgeState = { phase: "IDLE" };

      const startResult = transitionHedge(state, {
        type: "START_ENTRY",
        intentId: "intent-1",
        symbol: "BTC-USD",
      });
      expect(startResult.ok).toBe(true);
      if (startResult.ok) state = startResult.state;

      const perpResult = transitionHedge(state, { type: "PERP_FILLED", filledQtyBase: 1000000n });
      expect(perpResult.ok).toBe(true);
      if (perpResult.ok) {
        if (perpResult.state.phase === "ENTERING_SPOT") {
          expect(perpResult.state.symbol).toBe("BTC-USD");
        }
        state = perpResult.state;
      }

      const spotResult = transitionHedge(state, { type: "SPOT_FILLED", filledQtyBase: 1000000n });
      expect(spotResult.ok).toBe(true);
      if (spotResult.ok) {
        if (spotResult.state.phase === "ACTIVE") {
          expect(spotResult.state.symbol).toBe("BTC-USD");
        }
      }
    });

    it("should include pnlQuote in CLOSED state", () => {
      const state: HedgeState = {
        phase: "EXITING_PERP",
        symbol: "BTC-USD",
      };

      const result = transitionHedge(state, {
        type: "PERP_CLOSED",
        pnlQuote: 5000000n,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        if (result.state.phase === "CLOSED") {
          expect(result.state.pnlQuote).toBe(5000000n);
        }
      }
    });
  });

  describe("transitionHedge - event validation", () => {
    it("should reject PERP_FILLED from wrong phase", () => {
      const state: HedgeState = { phase: "IDLE" };
      const result = transitionHedge(state, { type: "PERP_FILLED", filledQtyBase: 1000000n });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Invalid transition");
      }
    });

    it("should reject SPOT_FILLED from wrong phase", () => {
      const state: HedgeState = {
        phase: "ENTERING_PERP",
        intentId: "intent-1",
        symbol: "BTC-USD",
      };
      const result = transitionHedge(state, { type: "SPOT_FILLED", filledQtyBase: 1000000n });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Invalid transition");
      }
    });
  });
});
