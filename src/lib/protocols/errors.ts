/**
 * Adapter error types (CEX and on-chain).
 *
 * @see {@link ../../../docs/adrs/0010-exchange-adapters.md ADR-0010: Exchange Adapters}
 * @see {@link ../../../docs/adrs/0019-on-chain-perps-pivot.md ADR-0019: On-Chain Perps Pivot}
 */

/** CEX and on-chain adapter error codes. */
export type AdapterErrorCode =
  | "AUTHENTICATION_FAILED"
  | "RATE_LIMITED"
  | "INSUFFICIENT_BALANCE"
  | "ORDER_NOT_FOUND"
  | "INVALID_ORDER"
  | "NETWORK_ERROR"
  | "UNKNOWN"
  | "SIMULATION_FAILED"
  | "GAS_ESTIMATE_FAILED"
  | "USER_REJECTED"
  | "TX_REVERTED"
  | "INSUFFICIENT_GAS"
  | "SLIPPAGE_EXCEEDED"
  | "KEEPER_TIMEOUT";

export class AdapterError extends Error {
  public override readonly name = "AdapterError";

  constructor(
    message: string,
    public readonly code: AdapterErrorCode,
    public readonly source: string,
    public override readonly cause?: unknown,
  ) {
    super(message, { cause });
  }
}

/** @deprecated Use AdapterError and AdapterErrorCode. */
export type ExchangeErrorCode = AdapterErrorCode;

/** @deprecated Use AdapterError. */
export const ExchangeError = AdapterError;
