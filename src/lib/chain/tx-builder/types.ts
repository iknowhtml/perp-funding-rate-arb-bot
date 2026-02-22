/**
 * Tx-builder types for multicall payloads.
 *
 * @see {@link ../../../../adrs/0020-contract-interaction-patterns.md ADR-0020: Contract Interaction Patterns}
 */

import type { Address, Hex } from "viem";

export type MulticallPayload = {
  /** Encoded call data for each call in the multicall. */
  calls: readonly Hex[];
  /** Native token value to send with the multicall (wei). */
  valueWei: bigint;
};

export type BuildIncreaseOrderParams = {
  account: Address;
  market: Address;
  collateralToken: Address;
  collateralAmountWei: bigint;
  sizeDeltaUsd: bigint;
  isLong: boolean;
  acceptablePrice: bigint;
  executionFeeWei: bigint;
};

export type BuildDecreaseOrderParams = {
  account: Address;
  market: Address;
  /** Collateral token of the position (for decrease). */
  collateralToken: Address;
  sizeDeltaUsd: bigint;
  isLong: boolean;
  acceptablePrice: bigint;
  executionFeeWei: bigint;
};

export type BuildDepositParams = {
  account: Address;
  market: Address;
  initialLongToken: Address;
  initialShortToken: Address;
  minMarketTokens: bigint;
  executionFeeWei: bigint;
};

export type BuildWithdrawalParams = {
  account: Address;
  market: Address;
  minLongTokenAmount: bigint;
  minShortTokenAmount: bigint;
  executionFeeWei: bigint;
};
