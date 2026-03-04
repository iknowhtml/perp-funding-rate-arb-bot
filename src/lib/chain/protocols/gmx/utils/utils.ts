/**
 * GMX adapter read operations: positions, token balances, market data.
 *
 * @see {@link ../../../../../../adrs/0020-contract-interaction-patterns.md ADR-0020}
 * @see {@link ../../../../../../adrs/0022-regime-based-gmx-arb.md ADR-0022}
 */

import syntheticsReaderAbi from "@gmx-io/sdk/abis/SyntheticsReader";
import tokenAbi from "@gmx-io/sdk/abis/Token";
import { ARBITRUM } from "@gmx-io/sdk/configs/chainIds";
import type { ContractsChainId } from "@gmx-io/sdk/configs/chains";
import { getContract } from "@gmx-io/sdk/configs/contracts";
import { PRECISION } from "@gmx-io/sdk/utils/numbers";
import type { Address } from "viem";

import * as v from "valibot";

import type { PerpPositionState, PositionState } from "@/lib/protocols";
import { fetchGmxMarketsInfo, fetchGmxTickers } from "../api";
import { ChainError } from "../errors";
import { gmxAccountPositionsArraySchema } from "../schema";
import type { GmxAccountPositionRaw, GmxMarket, GmxReadsDeps, GmxTicker } from "../types";

const getReaderAndDataStore = (
  chainId: ContractsChainId,
): { reader: Address; dataStore: Address } => ({
  reader: getContract(chainId, "SyntheticsReader"),
  dataStore: getContract(chainId, "DataStore"),
});

const toPerpPositionState = (raw: GmxAccountPositionRaw): PerpPositionState => ({
  sizeUsd: raw.numbers.sizeInUsd,
  entryPrice: 0n,
  pnlUsd: 0n,
  liquidationPrice: null,
});

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

export const getMarketsInfo = async (baseUrl: string): Promise<GmxMarket[]> => {
  try {
    return await fetchGmxMarketsInfo(baseUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ChainError(`getMarketsInfo failed: ${message}`, "RPC_ERROR", err);
  }
};

export const getTickers = async (baseUrl: string): Promise<GmxTicker[]> => {
  try {
    return await fetchGmxTickers(baseUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ChainError(`getTickers failed: ${message}`, "RPC_ERROR", err);
  }
};

export const getFundingRateForMarket = (
  markets: GmxMarket[],
  marketAddress: Address,
): { fundingRateLong: bigint; fundingRateShort: bigint } | null => {
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

export const compute4hMaFundingRateBps = (samples: bigint[]): bigint => {
  if (samples.length === 0) {
    return 0n;
  }
  const sum = samples.reduce((acc, sample) => acc + sample, 0n);
  return sum / BigInt(samples.length);
};

export const getOiSkewForMarket = (
  markets: GmxMarket[],
  marketAddress: Address,
): { longOi: bigint; shortOi: bigint } | null => {
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

export const getGmBalance = async (
  deps: GmxReadsDeps,
  gmTokenAddress: Address,
  account: Address,
): Promise<bigint> => getTokenBalance(deps, gmTokenAddress, account);

export const getExecutionPriceFromReader = async (params: {
  deps: GmxReadsDeps;
  market: Address;
  price: { min: bigint; max: bigint };
  positionSizeUsd: bigint;
  isLong: boolean;
}): Promise<{ executionPrice: bigint; priceImpactUsd: bigint }> => {
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
        0n,
        0n,
        positionSizeUsd,
        0n,
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
