import { describe, expect, it } from "vitest";
import { ChainError } from "./chain-error";
import type { ChainErrorCode } from "./chain-error";

describe("ChainError", () => {
  it("has name ChainError", () => {
    const err = new ChainError("test", "RPC_ERROR");
    expect(err.name).toBe("ChainError");
  });

  it("preserves message and code", () => {
    const err = new ChainError("tx reverted", "TX_REVERTED");
    expect(err.message).toBe("tx reverted");
    expect(err.code).toBe("TX_REVERTED");
  });

  it("accepts optional cause", () => {
    const cause = new Error("underlying");
    const err = new ChainError("wrapped", "SIMULATION_FAILED", cause);
    expect(err.cause).toBe(cause);
  });

  it("is instanceof Error", () => {
    const err = new ChainError("x", "GAS_TOO_HIGH");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ChainError);
  });
});

describe("ChainErrorCode", () => {
  const codes: ChainErrorCode[] = [
    "RPC_ERROR",
    "SIMULATION_FAILED",
    "TX_REVERTED",
    "KEEPER_TIMEOUT",
    "KEEPER_CANCELLED",
    "NONCE_ERROR",
    "GAS_TOO_HIGH",
  ];

  it("all ADR-0020 codes are valid", () => {
    for (const code of codes) {
      const err = new ChainError("msg", code);
      expect(err.code).toBe(code);
    }
  });
});
