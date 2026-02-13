/**
 * Reader contract helpers for GMX v2.
 * Phase 0: Minimal reads - market count/addresses from DataStore.
 * DataStore.getAddressCount and getAddressValuesAt require specific keys.
 * For Phase 0 we rely on REST API for market data; Reader is for future RPC fallback.
 */

import type { PublicClient } from "viem";

export const readMarketCount = async (_client: PublicClient): Promise<bigint> => {
  // Phase 0: REST is primary source. DataStore market list key varies by GMX config.
  // Return 0 as placeholder - markets come from fetchGmxMarketsInfo.
  return 0n;
};

export const readMarketAddresses = async (
  _client: PublicClient,
  count: bigint,
): Promise<string[]> => {
  // Phase 0: REST is primary. Return empty when count is 0.
  if (count === 0n) return [];
  return [];
};
