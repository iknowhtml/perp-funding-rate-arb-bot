/**
 * Chain adapter error types.
 *
 * @see {@link ../../../../adrs/0020-contract-interaction-patterns.md ADR-0020: Contract Interaction Patterns}
 */

export type ChainErrorCode =
  | "RPC_ERROR"
  | "SIMULATION_FAILED"
  | "TX_REVERTED"
  | "KEEPER_TIMEOUT"
  | "KEEPER_CANCELLED"
  | "NONCE_ERROR"
  | "GAS_TOO_HIGH";

export class ChainError extends Error {
  public override readonly name = "ChainError";

  constructor(
    message: string,
    public readonly code: ChainErrorCode,
    public override readonly cause?: unknown,
  ) {
    super(message, { cause });
  }
}
