/**
 * GMX protocol types: market, ticker, reads deps, adapter config.
 *
 * @see {@link ../../../../../docs/adrs/0019-on-chain-perps-pivot.md ADR-0019: On-Chain Perps Pivot}
 */

import type { ContractsChainId } from "@gmx-io/sdk/configs/chains";
import type { Address, PublicClient } from "viem";

/** GMX Oracle API market address constants. */
export const ETH_USD_MARKET = "0x70d95587d40A2caf56bd97485aB3Eec10Bee6336";
export const BTC_USD_MARKET = "0x47c031236e19d024b42f8AE6780E44A573170703";

export interface GmxMarket {
  marketToken: string;
  name: string;
  openInterestLong: bigint;
  openInterestShort: bigint;
  fundingRateLong: bigint;
  fundingRateShort: bigint;
  borrowingRateLong: bigint;
  borrowingRateShort: bigint;
}

export interface GmxTicker {
  tokenSymbol: string;
  minPrice: bigint;
  maxPrice: bigint;
}

/** Dependencies for GMX read operations. */
export interface GmxReadsDeps {
  /** Viem public client (Arbitrum). */
  publicClient: PublicClient;
  /** Chain ID for contract addresses (default Arbitrum). */
  chainId?: ContractsChainId;
}

/** Result of SyntheticsReader getAccountPositions (single position). */
export interface GmxAccountPositionRaw {
  addresses: { account: Address; market: Address; collateralToken: Address };
  numbers: {
    sizeInUsd: bigint;
    sizeInTokens: bigint;
    collateralAmount: bigint;
    increasedAtTime: bigint;
    decreasedAtTime: bigint;
  };
  flags: { isLong: boolean };
}

/** Raw funding rate for a market (long/short in bps or protocol units). */
export interface GmxFundingRateRaw {
  fundingRateLong: bigint;
  fundingRateShort: bigint;
}

/** OI skew: long and short open interest for a market. */
export interface GmxOiSkew {
  longOi: bigint;
  shortOi: bigint;
}

/** Result of SyntheticsReader getExecutionPrice. */
export interface GetExecutionPriceResult {
  executionPrice: bigint;
  priceImpactUsd: bigint;
}

/** Params for getExecutionPriceFromReader. positionSizeUsd is absolute order size in USD (30 decimals). */
export interface GetExecutionPriceFromReaderParams {
  deps: GmxReadsDeps;
  market: Address;
  /** Token price as returned by GMX Oracle API. */
  price: { min: bigint; max: bigint };
  /** Absolute order size in USD (30 decimals). */
  positionSizeUsd: bigint;
  isLong: boolean;
}
