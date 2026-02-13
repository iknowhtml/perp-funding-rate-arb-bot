import * as v from "valibot";

import { marketsInfoResponseSchema, tickersResponseSchema } from "./schemas";

import type { MarketInfo, Ticker } from "./schemas";

export const fetchGmxTickers = async (oracleUrl: string): Promise<Ticker[]> => {
  const url = `${oracleUrl.replace(/\/$/, "")}/prices/tickers`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GMX tickers fetch failed: ${res.status} ${res.statusText}`);
  }
  const data: unknown = await res.json();
  return v.parse(tickersResponseSchema, data);
};

export const fetchGmxMarketsInfo = async (oracleUrl: string): Promise<MarketInfo[]> => {
  const url = `${oracleUrl.replace(/\/$/, "")}/markets/info`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GMX markets info fetch failed: ${res.status} ${res.statusText}`);
  }
  const data: unknown = await res.json();
  const parsed = v.parse(marketsInfoResponseSchema, data);
  return parsed.markets;
};
