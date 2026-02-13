import { http, createPublicClient, createWalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { ARBITRUM_CHAIN } from "./constants";

import type { PublicClient, WalletClient } from "viem";

export const createArbitrumPublicClient = (rpcUrl: string): PublicClient =>
  createPublicClient({
    chain: ARBITRUM_CHAIN,
    transport: http(rpcUrl),
    batch: { multicall: true },
  });

export const createArbitrumWalletClient = (
  rpcUrl: string,
  privateKey: `0x${string}`,
): WalletClient =>
  createWalletClient({
    account: privateKeyToAccount(privateKey),
    chain: ARBITRUM_CHAIN,
    transport: http(rpcUrl),
  });
