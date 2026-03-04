/**
 * GMX adapter read operations: positions, token balances, market data.
 * Uses SyntheticsReader (viem readContract) and REST API per ADR-0020.
 *
 * @see {@link ../../../adrs/0020-contract-interaction-patterns.md ADR-0020: Contract Interaction Patterns}
 * @see {@link ../../../adrs/0022-regime-based-gmx-arb.md ADR-0022: Regime-Based GMX Arb}
 */

import syntheticsReaderAbi from "@gmx-io/sdk/abis/SyntheticsReader";
import tokenAbi from "@gmx-io/sdk/abis/Token";
import { ARBITRUM } from "@gmx-io/sdk/configs/chainIds";
import type { ContractsChainId } from "@gmx-io/sdk/configs/chains";
import { getContract } from "@gmx-io/sdk/configs/contracts";
import { PRECISION } from "@gmx-io/sdk/utils/numbers";
import { type Address, type PublicClient, isAddress } from "viem";

import * as v from "valibot";

import { ChainError } from "../../lib/chain/errors";
import type { PerpPositionState, PositionState } from "../types";
import type { GmxMarket, GmxTicker } from "./api";
import { fetchGmxMarketsInfo, fetchGmxTickers } from "./api";

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

/** Valibot schema for address (0x-prefixed hex); validates at RPC boundary. Accepts any valid hex (strict: false) for RPC/API responses. */
const addressSchema = v.pipe(
  v.string(),
  v.custom<Address>(
    (s: unknown) => typeof s === "string" && isAddress(s, { strict: false }),
    "Expected valid 0x address",
  ),
);

/** Valibot schema for getAccountPositions raw return (validates at RPC boundary). */
const gmxAccountPositionRawSchema = v.object({
  addresses: v.object({
    account: addressSchema,
    market: addressSchema,
    collateralToken: addressSchema,
  }),
  numbers: v.object({
    sizeInUsd: v.bigint(),
    sizeInTokens: v.bigint(),
    collateralAmount: v.bigint(),
    increasedAtTime: v.bigint(),
    decreasedAtTime: v.bigint(),
  }),
  flags: v.object({ isLong: v.boolean() }),
});

const gmxAccountPositionsArraySchema = v.array(gmxAccountPositionRawSchema);

const getReaderAndDataStore = (
  chainId: ContractsChainId,
): { reader: Address; dataStore: Address } => ({
  reader: getContract(chainId, "SyntheticsReader"),
  dataStore: getContract(chainId, "DataStore"),
});

/**
 * Fetch raw account positions from SyntheticsReader.
 * Throws ChainError with RPC_ERROR on read failure.
 */
export const getAccountPositions = async (
  deps: GmxReadsDeps,
  account: Address,
  start = 0n,
  end = 100n,
): Promise<GmxAccountPositionRaw[]> => {
  const chainId = deps.chainId ?? ARBITRUM;
  const { reader, dataStore } = getReaderAndDataStore(chainId);
  try {
    const raw = await deps.publicClient.readContract({
      address: reader,
      abi: syntheticsReaderAbi,
      functionName: "getAccountPositions",
      args: [dataStore, account, start, end],
    });
    return v.parse(gmxAccountPositionsArraySchema, raw as unknown);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ChainError(`getAccountPositions failed: ${message}`, "RPC_ERROR", err);
  }
};

/**
 * Read ERC20 balance for an account.
 * Throws ChainError with RPC_ERROR on read failure.
 */
export const getTokenBalance = async (
  deps: GmxReadsDeps,
  tokenAddress: Address,
  account: Address,
): Promise<bigint> => {
  try {
    const balance = await deps.publicClient.readContract({
      address: tokenAddress,
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [account],
    });
    return balance;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ChainError(`getTokenBalance failed: ${message}`, "RPC_ERROR", err);
  }
};

/**
 * Map raw GMX position to perp subset. Entry price and liquidation not available from getAccountPositions; use 0n / null.
 */
const toPerpPositionState = (raw: GmxAccountPositionRaw): PerpPositionState => ({
  sizeUsd: raw.numbers.sizeInUsd,
  entryPrice: 0n,
  pnlUsd: 0n,
  liquidationPrice: null,
});

/**
 * Get position state for a single market (perp + GM placeholders).
 * GM balance / cost basis / mtm are filled by gm-balance and market-info reads; here we use 0n.
 */
export const getPositionState = async (
  deps: GmxReadsDeps,
  account: Address,
  market: Address,
): Promise<PositionState | null> => {
  const positions = await getAccountPositions(deps, account);
  const normalizedMarket = market.toLowerCase();
  const raw = positions.find(
    (pos) => pos.addresses.market.toLowerCase() === normalizedMarket && pos.numbers.sizeInUsd > 0n,
  );
  if (!raw) {
    return null;
  }
  const snapshotTime = new Date();
  return {
    ts: snapshotTime,
    market: raw.addresses.market,
    perpPosition: toPerpPositionState(raw),
    gmBalance: 0n,
    gmCostBasisUsd: 0n,
    gmMtmValueUsd: 0n,
  };
};

/**
 * Fetch market info (funding, OI, borrow rates) from GMX Oracle API.
 * Throws ChainError with RPC_ERROR on HTTP or parse failure.
 */
export const getMarketsInfo = async (baseUrl: string): Promise<GmxMarket[]> => {
  try {
    return await fetchGmxMarketsInfo(baseUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ChainError(`getMarketsInfo failed: ${message}`, "RPC_ERROR", err);
  }
};

/**
 * Fetch price tickers from GMX Oracle API.
 * Throws ChainError with RPC_ERROR on HTTP or parse failure.
 */
export const getTickers = async (baseUrl: string): Promise<GmxTicker[]> => {
  try {
    return await fetchGmxTickers(baseUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ChainError(`getTickers failed: ${message}`, "RPC_ERROR", err);
  }
};

/** Raw funding rate for a market (long/short in bps or protocol units). */
export interface GmxFundingRateRaw {
  fundingRateLong: bigint;
  fundingRateShort: bigint;
}

/**
 * Get raw funding rate for a market from markets info.
 * Returns protocol units (same as GmxMarket); caller may convert to bps.
 */
export const getFundingRateForMarket = (
  markets: GmxMarket[],
  marketAddress: Address,
): GmxFundingRateRaw | null => {
  const normalized = marketAddress.toLowerCase();
  const market = markets.find((candidate) => candidate.marketToken.toLowerCase() === normalized);
  if (!market) {
    return null;
  }
  return {
    fundingRateLong: market.fundingRateLong,
    fundingRateShort: market.fundingRateShort,
  };
};

/**
 * Compute 4h MA funding rate from a list of samples (e.g. hourly long funding rate in bps).
 * Used for regime detection (ADR-0022). If fewer than 4 samples, returns average of available.
 */
export const compute4hMaFundingRateBps = (samples: bigint[]): bigint => {
  if (samples.length === 0) {
    return 0n;
  }
  const sum = samples.reduce((acc, sample) => acc + sample, 0n);
  return sum / BigInt(samples.length);
};

/** OI skew: long and short open interest for a market. */
export interface GmxOiSkew {
  longOi: bigint;
  shortOi: bigint;
}

/**
 * Get OI skew (long/short open interest) for a market from markets info.
 */
export const getOiSkewForMarket = (
  markets: GmxMarket[],
  marketAddress: Address,
): GmxOiSkew | null => {
  const normalized = marketAddress.toLowerCase();
  const market = markets.find((candidate) => candidate.marketToken.toLowerCase() === normalized);
  if (!market) {
    return null;
  }
  return {
    longOi: market.openInterestLong,
    shortOi: market.openInterestShort,
  };
};

/**
 * Read GM token (LP share) balance for an account.
 * Wraps getTokenBalance for GM token address (pool-specific).
 */
export const getGmBalance = async (
  deps: GmxReadsDeps,
  gmTokenAddress: Address,
  account: Address,
): Promise<bigint> => getTokenBalance(deps, gmTokenAddress, account);

/** Result of SyntheticsReader getExecutionPrice. */
export interface GetExecutionPriceResult {
  executionPrice: bigint;
  priceImpactUsd: bigint;
}

/** Params for getExecutionPriceFromReader. positionSizeUsd is absolute order size in USD (30 decimals). */
export interface GetExecutionPriceFromReaderParams {
  deps: GmxReadsDeps;
  market: Address;
  /** Token price as returned by GMX Oracle API: USD_per_token × 10^(30 - tokenDecimals). Pass raw, no normalization. */
  price: { min: bigint; max: bigint };
  /** Absolute order size in USD (30 decimals). */
  positionSizeUsd: bigint;
  isLong: boolean;
}

/**
 * Get execution price and impact for an order from SyntheticsReader.
 * Used for simulateOrder (impact sampling).
 * Throws ChainError with RPC_ERROR on read failure.
 *
 * Price format: GMX Oracle API `/prices/tickers` returns prices as
 * `USD_per_token × 10^(30 - tokenDecimals)` — e.g. ETH (18 dec) ≈ 2e15,
 * BTC (8 dec) ≈ 8.7e26. This is exactly what the Reader contract expects;
 * no normalization needed.
 *
 * sizeDeltaUsd is always **positive** (= opening / increasing a position).
 * The contract branches on sign: positive → getExecutionPriceForIncrease,
 * negative → getExecutionPriceForDecrease. We want the increase path because
 * we're simulating a new order, not closing an existing one. The `isLong` flag
 * controls which side of OI is affected.
 *
 * positionSizeInUsd / positionSizeInTokens are zero (no existing position);
 * the increase path does not divide by them.
 */
export const getExecutionPriceFromReader = async (
  params: GetExecutionPriceFromReaderParams,
): Promise<GetExecutionPriceResult> => {
  const { deps, market, price, positionSizeUsd, isLong } = params;

  const chainId = deps.chainId ?? ARBITRUM;
  const { reader, dataStore } = getReaderAndDataStore(chainId);

  const shortTokenPrice = { min: PRECISION, max: PRECISION };

  try {
    const result = await deps.publicClient.readContract({
      address: reader,
      abi: syntheticsReaderAbi,
      functionName: "getExecutionPrice",
      args: [
        dataStore,
        market,
        { indexTokenPrice: price, longTokenPrice: price, shortTokenPrice },
        0n, // positionSizeInUsd: no existing position
        0n, // positionSizeInTokens: no existing position
        positionSizeUsd, // positive → increase path
        0n, // pendingImpactAmount
        isLong,
      ],
    });

    return {
      priceImpactUsd: result.priceImpactUsd,
      executionPrice: result.executionPrice,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ChainError(`getExecutionPrice failed: ${message}`, "RPC_ERROR", err);
  }
};
