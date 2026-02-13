import { DEFAULT_BLOCK_STALE_THRESHOLD_SEC } from "./constants";

import type { PublicClient } from "viem";

export type RpcHealthStatus =
  | { status: "healthy"; blockNumber: bigint; blockAgeSec: bigint; chainId: number }
  | {
      status: "unhealthy";
      blockNumber?: bigint;
      blockAgeSec?: bigint;
      chainId?: number;
      error?: string;
    };

export const checkRpcHealth = async (
  client: PublicClient,
  thresholdSec: bigint = DEFAULT_BLOCK_STALE_THRESHOLD_SEC,
): Promise<RpcHealthStatus> => {
  try {
    const [block, chainId] = await Promise.all([client.getBlock(), client.getChainId()]);
    const now = BigInt(Math.floor(Date.now() / 1000));
    const blockTimestamp = block.timestamp;
    const blockAgeSec = now - blockTimestamp;

    if (blockAgeSec > thresholdSec) {
      return {
        status: "unhealthy",
        blockNumber: block.number,
        blockAgeSec,
        chainId,
        error: `Block age ${blockAgeSec}s exceeds threshold ${thresholdSec}s`,
      };
    }

    return {
      status: "healthy",
      blockNumber: block.number,
      blockAgeSec,
      chainId,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      status: "unhealthy",
      error,
    };
  }
};
