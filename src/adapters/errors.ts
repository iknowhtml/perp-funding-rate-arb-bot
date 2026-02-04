/**
 * Exchange adapter error types.
 *
 * @see {@link ../../adrs/0010-exchange-adapters.md ADR-0010: Exchange Adapters}
 */

export type ExchangeErrorCode =
  | "AUTHENTICATION_FAILED"
  | "RATE_LIMITED"
  | "INSUFFICIENT_BALANCE"
  | "ORDER_NOT_FOUND"
  | "INVALID_ORDER"
  | "NETWORK_ERROR"
  | "UNKNOWN";

export class ExchangeError extends Error {
  public override readonly name = "ExchangeError";

  constructor(
    message: string,
    public readonly code: ExchangeErrorCode,
    public readonly exchange: string,
    public override readonly cause?: unknown,
  ) {
    super(message, { cause });
  }
}
