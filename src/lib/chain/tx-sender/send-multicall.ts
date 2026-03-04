/**
 * Simulate → send → waitForReceipt pipeline for multicall payloads.
 *
 * @see {@link ../../../../docs/adrs/0020-contract-interaction-patterns.md ADR-0020: Contract Interaction Patterns}
 */

import exchangeRouterAbi from "@gmx-io/sdk/abis/ExchangeRouter";
import { ARBITRUM } from "@gmx-io/sdk/configs/chainIds";
import { getContract } from "@gmx-io/sdk/configs/contracts";
import type { TransactionReceipt } from "viem";
import { ChainError } from "../errors";
import type { MulticallPayload } from "../tx-builder";
import type { TxSenderDeps } from "./types";

/**
 * Simulates the multicall, then sends it and waits for the receipt.
 * Throws ChainError with SIMULATION_FAILED on simulation revert, TX_REVERTED if receipt status is reverted.
 */
export const sendMulticall = async (
  payload: MulticallPayload,
  deps: TxSenderDeps,
): Promise<TransactionReceipt> => {
  const account = deps.walletClient.account;
  if (!account) {
    throw new ChainError("Wallet client must have an account to send transactions", "RPC_ERROR");
  }

  const chainId = deps.chainId ?? ARBITRUM;
  const exchangeRouterAddress = getContract(chainId, "ExchangeRouter");

  const simulated = await deps.publicClient
    .simulateContract({
      address: exchangeRouterAddress,
      abi: exchangeRouterAbi,
      functionName: "multicall",
      args: [payload.calls],
      value: payload.valueWei,
      account,
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      throw new ChainError(`Simulation failed: ${message}`, "SIMULATION_FAILED", err);
    });

  const hash = await deps.walletClient.writeContract(simulated.request);
  const receipt = await deps.publicClient.waitForTransactionReceipt({ hash });

  if (receipt.status === "reverted") {
    throw new ChainError("Transaction reverted", "TX_REVERTED", receipt);
  }

  return receipt;
};
