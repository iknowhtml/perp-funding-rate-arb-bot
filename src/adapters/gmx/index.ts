/**
 * GMX adapter: Oracle API client, adapter type, and factory.
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

export { createGmxAdapter } from "./adapter";
export type { GmxAdapter, GmxAdapterConfig } from "./adapter";
