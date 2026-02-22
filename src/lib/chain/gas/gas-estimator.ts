/**
 * Execution fee estimation and gas price circuit breaker.
 *
 * @see {@link ../../../../adrs/0020-contract-interaction-patterns.md ADR-0020: Contract Interaction Patterns}
 */

import dataStoreAbi from "@gmx-io/sdk/abis/DataStore";
import { ARBITRUM } from "@gmx-io/sdk/configs/chainIds";
import type { ContractsChainId } from "@gmx-io/sdk/configs/chains";
import { getContract } from "@gmx-io/sdk/configs/contracts";
import {
  decreaseOrderGasLimitKey,
  depositGasLimitKey,
  increaseOrderGasLimitKey,
  withdrawalGasLimitKey,
} from "@gmx-io/sdk/configs/dataStore";
import type { PublicClient } from "viem";
import { ChainError } from "../errors";

export type OrderType = "increase" | "decrease" | "deposit" | "withdrawal";

const EXECUTION_FEE_BUFFER_NUMERATOR = 3n;
const EXECUTION_FEE_BUFFER_DENOMINATOR = 2n;

const isHex = (s: string): s is `0x${string}` => typeof s === "string" && s.startsWith("0x");

export type GasEstimatorDeps = {
  publicClient: PublicClient;
  chainId?: ContractsChainId;
  maxExecutionFeeWei: bigint;
};

const getExecutionGasLimitKey = (orderType: OrderType): `0x${string}` => {
  const raw =
    orderType === "increase"
      ? increaseOrderGasLimitKey()
      : orderType === "decrease"
        ? decreaseOrderGasLimitKey()
        : orderType === "deposit"
          ? depositGasLimitKey()
          : orderType === "withdrawal"
            ? withdrawalGasLimitKey()
            : ((): never => {
                const _: never = orderType;
                return _;
              })();
  if (!isHex(raw)) throw new Error("DataStore key must be hex");
  return raw;
};

/**
 * Estimates execution fee (wei) for the given order type using DataStore gas limit and current gas price, with 1.5x buffer.
 */
export const estimateExecutionFeeWei = async (
  deps: GasEstimatorDeps,
  orderType: OrderType,
): Promise<bigint> => {
  const chainId = deps.chainId ?? ARBITRUM;
  const dataStoreAddress = getContract(chainId, "DataStore");

  const [gasLimit, gasPriceWei] = await Promise.all([
    deps.publicClient.readContract({
      address: dataStoreAddress,
      abi: dataStoreAbi,
      functionName: "getUint",
      args: [getExecutionGasLimitKey(orderType)],
    }),
    deps.publicClient.getGasPrice(),
  ]);

  const feeWei =
    (gasLimit * gasPriceWei * EXECUTION_FEE_BUFFER_NUMERATOR) / EXECUTION_FEE_BUFFER_DENOMINATOR;
  return feeWei;
};

/**
 * Throws ChainError with code GAS_TOO_HIGH if feeWei exceeds the configured max (circuit breaker).
 */
export const checkExecutionFeeOrThrow = (deps: GasEstimatorDeps, feeWei: bigint): void => {
  if (feeWei > deps.maxExecutionFeeWei) {
    throw new ChainError(
      `Execution fee ${feeWei} exceeds max ${deps.maxExecutionFeeWei}`,
      "GAS_TOO_HIGH",
    );
  }
};

/**
 * Estimates execution fee and throws if over circuit breaker threshold.
 */
export const estimateExecutionFeeWeiOrThrow = async (
  deps: GasEstimatorDeps,
  orderType: OrderType,
): Promise<bigint> => {
  const feeWei = await estimateExecutionFeeWei(deps, orderType);
  checkExecutionFeeOrThrow(deps, feeWei);
  return feeWei;
};

export type CreateGasEstimatorConfig = GasEstimatorDeps;

/**
 * Factory for gas estimation and circuit breaker. Returns functions that use the given deps.
 */
export const createGasEstimator = (config: CreateGasEstimatorConfig) => ({
  estimateExecutionFeeWei: (orderType: OrderType) => estimateExecutionFeeWei(config, orderType),
  checkExecutionFeeOrThrow: (feeWei: bigint) => checkExecutionFeeOrThrow(config, feeWei),
  estimateExecutionFeeWeiOrThrow: (orderType: OrderType) =>
    estimateExecutionFeeWeiOrThrow(config, orderType),
});
