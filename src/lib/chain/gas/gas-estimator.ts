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
import { type Hex, type PublicClient, isHex } from "viem";
import { ChainError } from "../errors";

export type GasOrderType = "increase" | "decrease" | "deposit" | "withdrawal";

const EXECUTION_FEE_BUFFER_NUMERATOR = 3n;
const EXECUTION_FEE_BUFFER_DENOMINATOR = 2n;

export type GasEstimatorDeps = {
  publicClient: PublicClient;
  chainId?: ContractsChainId;
  maxExecutionFeeWei: bigint;
};

const getExecutionGasLimitKey = (orderType: GasOrderType): Hex => {
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
  orderType: GasOrderType,
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
  orderType: GasOrderType,
): Promise<bigint> => {
  const feeWei = await estimateExecutionFeeWei(deps, orderType);
  checkExecutionFeeOrThrow(deps, feeWei);
  return feeWei;
};

export type CreateGasEstimatorConfig = GasEstimatorDeps;

export type GasEstimator = {
  estimateExecutionFeeWei: (orderType: GasOrderType) => Promise<bigint>;
  checkExecutionFeeOrThrow: (feeWei: bigint) => void;
  estimateExecutionFeeWeiOrThrow: (orderType: GasOrderType) => Promise<bigint>;
};

/**
 * Factory for gas estimation and circuit breaker. Returns functions that use the given deps.
 */
export const createGasEstimator = (config: CreateGasEstimatorConfig): GasEstimator => ({
  estimateExecutionFeeWei: (orderType: GasOrderType) => estimateExecutionFeeWei(config, orderType),
  checkExecutionFeeOrThrow: (feeWei: bigint) => checkExecutionFeeOrThrow(config, feeWei),
  estimateExecutionFeeWeiOrThrow: (orderType: GasOrderType) =>
    estimateExecutionFeeWeiOrThrow(config, orderType),
});
