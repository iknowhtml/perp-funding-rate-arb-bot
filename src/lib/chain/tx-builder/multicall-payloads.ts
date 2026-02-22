/**
 * Multicall payload builders for GMX ExchangeRouter.
 *
 * @see {@link ../../../../adrs/0020-contract-interaction-patterns.md ADR-0020: Contract Interaction Patterns}
 */

import exchangeRouterAbi from "@gmx-io/sdk/abis/ExchangeRouter";
import { ARBITRUM } from "@gmx-io/sdk/configs/chainIds";
import type { ContractsChainId } from "@gmx-io/sdk/configs/chains";
import { getContract } from "@gmx-io/sdk/configs/contracts";
import { encodeFunctionData, zeroAddress, zeroHash } from "viem";
import type { MulticallPayload } from "./types";
import type {
  BuildDecreaseOrderParams,
  BuildDepositParams,
  BuildIncreaseOrderParams,
  BuildWithdrawalParams,
} from "./types";

const ORDER_TYPE_MARKET_INCREASE = 2;
const ORDER_TYPE_MARKET_DECREASE = 4;
const DECREASE_POSITION_SWAP_TYPE_NO_SWAP = 0;

export type TxBuilderDeps = {
  chainId?: ContractsChainId;
};

const getOrderVault = (chainId: ContractsChainId) => getContract(chainId, "OrderVault");

/**
 * Builds multicall payload for an increase order (sendWnt + sendTokens + createOrder).
 */
export const buildIncreaseOrderPayload = (
  params: BuildIncreaseOrderParams,
  deps: TxBuilderDeps = {},
): MulticallPayload => {
  const chainId = deps.chainId ?? ARBITRUM;
  const orderVault = getOrderVault(chainId);

  const sendWnt = encodeFunctionData({
    abi: exchangeRouterAbi,
    functionName: "sendWnt",
    args: [orderVault, params.executionFeeWei],
  });

  const sendTokens = encodeFunctionData({
    abi: exchangeRouterAbi,
    functionName: "sendTokens",
    args: [params.collateralToken, orderVault, params.collateralAmountWei],
  });

  const createOrder = encodeFunctionData({
    abi: exchangeRouterAbi,
    functionName: "createOrder",
    args: [
      {
        addresses: {
          receiver: params.account,
          cancellationReceiver: params.account,
          callbackContract: zeroAddress,
          uiFeeReceiver: zeroAddress,
          market: params.market,
          initialCollateralToken: params.collateralToken,
          swapPath: [],
        },
        numbers: {
          sizeDeltaUsd: params.sizeDeltaUsd,
          initialCollateralDeltaAmount: 0n,
          triggerPrice: 0n,
          acceptablePrice: params.acceptablePrice,
          executionFee: params.executionFeeWei,
          callbackGasLimit: 0n,
          minOutputAmount: 0n,
          validFromTime: 0n,
        },
        orderType: ORDER_TYPE_MARKET_INCREASE,
        decreasePositionSwapType: DECREASE_POSITION_SWAP_TYPE_NO_SWAP,
        isLong: params.isLong,
        shouldUnwrapNativeToken: false,
        autoCancel: false,
        referralCode: zeroHash,
        dataList: [],
      },
    ],
  });

  return {
    calls: [sendWnt, sendTokens, createOrder],
    valueWei: params.executionFeeWei,
  };
};

/**
 * Builds multicall payload for a decrease order (sendWnt + createOrder).
 */
export const buildDecreaseOrderPayload = (
  params: BuildDecreaseOrderParams,
  deps: TxBuilderDeps = {},
): MulticallPayload => {
  const chainId = deps.chainId ?? ARBITRUM;
  const orderVault = getOrderVault(chainId);

  const sendWnt = encodeFunctionData({
    abi: exchangeRouterAbi,
    functionName: "sendWnt",
    args: [orderVault, params.executionFeeWei],
  });

  const createOrder = encodeFunctionData({
    abi: exchangeRouterAbi,
    functionName: "createOrder",
    args: [
      {
        addresses: {
          receiver: params.account,
          cancellationReceiver: params.account,
          callbackContract: zeroAddress,
          uiFeeReceiver: zeroAddress,
          market: params.market,
          initialCollateralToken: params.collateralToken,
          swapPath: [],
        },
        numbers: {
          sizeDeltaUsd: params.sizeDeltaUsd,
          initialCollateralDeltaAmount: 0n,
          triggerPrice: 0n,
          acceptablePrice: params.acceptablePrice,
          executionFee: params.executionFeeWei,
          callbackGasLimit: 0n,
          minOutputAmount: 0n,
          validFromTime: 0n,
        },
        orderType: ORDER_TYPE_MARKET_DECREASE,
        decreasePositionSwapType: DECREASE_POSITION_SWAP_TYPE_NO_SWAP,
        isLong: params.isLong,
        shouldUnwrapNativeToken: false,
        autoCancel: false,
        referralCode: zeroHash,
        dataList: [],
      },
    ],
  });

  return {
    calls: [sendWnt, createOrder],
    valueWei: params.executionFeeWei,
  };
};

/**
 * Builds multicall payload for a deposit (sendWnt + createDeposit, or sendTokens + createDeposit as needed).
 * Minimal path: execution fee via sendWnt, then createDeposit with minMarketTokens.
 */
export const buildDepositPayload = (
  params: BuildDepositParams,
  deps: TxBuilderDeps = {},
): MulticallPayload => {
  const chainId = deps.chainId ?? ARBITRUM;
  const depositVault = getContract(chainId, "DepositVault");

  const sendWnt = encodeFunctionData({
    abi: exchangeRouterAbi,
    functionName: "sendWnt",
    args: [depositVault, params.executionFeeWei],
  });

  const createDeposit = encodeFunctionData({
    abi: exchangeRouterAbi,
    functionName: "createDeposit",
    args: [
      {
        addresses: {
          receiver: params.account,
          callbackContract: zeroAddress,
          uiFeeReceiver: zeroAddress,
          market: params.market,
          initialLongToken: params.initialLongToken,
          initialShortToken: params.initialShortToken,
          longTokenSwapPath: [],
          shortTokenSwapPath: [],
        },
        minMarketTokens: params.minMarketTokens,
        shouldUnwrapNativeToken: false,
        executionFee: params.executionFeeWei,
        callbackGasLimit: 0n,
        dataList: [],
      },
    ],
  });

  return {
    calls: [sendWnt, createDeposit],
    valueWei: params.executionFeeWei,
  };
};

/**
 * Builds multicall payload for a withdrawal (sendWnt + createWithdrawal).
 */
export const buildWithdrawalPayload = (
  params: BuildWithdrawalParams,
  deps: TxBuilderDeps = {},
): MulticallPayload => {
  const chainId = deps.chainId ?? ARBITRUM;
  const withdrawalVault = getContract(chainId, "WithdrawalVault");

  const sendWnt = encodeFunctionData({
    abi: exchangeRouterAbi,
    functionName: "sendWnt",
    args: [withdrawalVault, params.executionFeeWei],
  });

  const createWithdrawal = encodeFunctionData({
    abi: exchangeRouterAbi,
    functionName: "createWithdrawal",
    args: [
      {
        addresses: {
          receiver: params.account,
          callbackContract: zeroAddress,
          uiFeeReceiver: zeroAddress,
          market: params.market,
          longTokenSwapPath: [],
          shortTokenSwapPath: [],
        },
        minLongTokenAmount: params.minLongTokenAmount,
        minShortTokenAmount: params.minShortTokenAmount,
        shouldUnwrapNativeToken: false,
        executionFee: params.executionFeeWei,
        callbackGasLimit: 0n,
        dataList: [],
      },
    ],
  });

  return {
    calls: [sendWnt, createWithdrawal],
    valueWei: params.executionFeeWei,
  };
};
