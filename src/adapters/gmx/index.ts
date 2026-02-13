export { BTC_USD_MARKET, ETH_USD_MARKET, GMX_CONTRACTS } from "./contracts";
export { fetchGmxMarketsInfo, fetchGmxTickers } from "./rest";
export { readMarketAddresses, readMarketCount } from "./reader";
export {
  marketInfoSchema,
  tickerSchema,
  tickersResponseSchema,
  marketsInfoResponseSchema,
} from "./schemas";

export type { MarketInfo, Ticker } from "./schemas";
