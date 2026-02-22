/**
 * Tx-sender dependencies and types.
 *
 * @see {@link ../../../../adrs/0020-contract-interaction-patterns.md ADR-0020: Contract Interaction Patterns}
 */

import type { ContractsChainId } from "@gmx-io/sdk/configs/chains";
import type { PublicClient, WalletClient } from "viem";

export type TxSenderDeps = {
  publicClient: PublicClient;
  /** Wallet client must have an account (e.g. from createArbitrumWalletClient). */
  walletClient: WalletClient;
  chainId?: ContractsChainId;
};
