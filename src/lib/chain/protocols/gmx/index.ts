/**
 * GMX adapter: Oracle API client, reads, adapter type, and factory.
 *
 * @see {@link ../../../../../adrs/0019-on-chain-perps-pivot.md ADR-0019: On-Chain Perps Pivot}
 */

export type { GmxProtocolAdapterConfig } from "./adapter";
export { ChainError } from "./adapter";
export type { ChainErrorCode } from "./adapter";

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
} from "./utils";
export type {
  GmxAccountPositionRaw,
  GmxFundingRateRaw,
  GmxOiSkew,
  GmxReadsDeps,
  GetExecutionPriceResult,
  GetExecutionPriceFromReaderParams,
} from "./utils";

export { createGmxProtocolAdapter as createGmxAdapter } from "./adapter";
export type { GmxProtocolAdapter } from "./adapter";
