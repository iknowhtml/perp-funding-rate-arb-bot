/**
 * GMX adapter: Oracle API client, reads, adapter type, and factory.
 *
 * @see {@link ../../adrs/0019-on-chain-perps-pivot.md ADR-0019: On-Chain Perps Pivot}
 */

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
} from "./reads";

export { createGmxProtocolAdapter as createGmxAdapter } from "./adapter";
export type { GmxProtocolAdapter, GmxProtocolAdapterConfig } from "./adapter";
