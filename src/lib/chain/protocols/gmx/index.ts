/**
 * GMX adapter: Oracle API client, reads, adapter type, and factory.
 *
 * @see {@link ../../../../../adrs/0019-on-chain-perps-pivot.md ADR-0019: On-Chain Perps Pivot}
 */

export type { GmxProtocolAdapterConfig } from "./config";
export { ChainError } from "./errors";
export type { ChainErrorCode } from "./errors";

export {
  BTC_USD_MARKET,
  ETH_USD_MARKET,
  fetchGmxMarketsInfo,
  fetchGmxTickers,
} from "./api";
export type { GmxMarket, GmxTicker } from "./api";

export {
  getAccountPositions,
  compute4hMaFundingRateBps,
  getFundingRateForMarket,
  getGmBalance,
  getMarketsInfo,
  getOiSkewForMarket,
  getPositionState,
  getTickers,
  getTokenBalance,
} from "./reads";
export type {
  GmxAccountPositionRaw,
  GmxFundingRateRaw,
  GmxOiSkew,
  GmxReadsDeps,
  GetExecutionPriceResult,
  GetExecutionPriceFromReaderParams,
} from "./reads";

export { createGmxProtocolAdapter as createGmxAdapter } from "./adapter";
export type { GmxProtocolAdapter } from "./adapter";
