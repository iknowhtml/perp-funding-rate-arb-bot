import { CONTRACTS_CHAIN_IDS_DEV } from "@gmx-io/sdk/configs/chains";
import * as v from "valibot";
import { isAddress, isHex } from "viem";
import type { Address, Hex } from "viem";
import { logLevelSchema } from "../logger/schema";

export const envSchema = v.object({
  // Database
  DATABASE_URL: v.pipe(v.string(), v.minLength(1)),

  // Server
  PORT: v.pipe(v.string(), v.transform(Number), v.number(), v.minValue(1), v.maxValue(65535)),
  NODE_ENV: v.picklist(["development", "production", "test"]),

  // Logging
  LOG_LEVEL: v.optional(v.pipe(v.string(), logLevelSchema)),

  // Arbitrum/GMX chain infrastructure
  ARBITRUM_RPC_URL: v.pipe(v.string(), v.minLength(1)),
  ARBITRUM_PRIVATE_KEY: v.optional(v.custom<Hex>(isHex, "Expected valid hex private key")),
  ARBITRUM_CHAIN_ID: v.pipe(
    v.optional(v.string()),
    v.transform((s) => (s === undefined || s === "" ? 42161 : Number(s))),
    v.picklist(CONTRACTS_CHAIN_IDS_DEV),
  ),
  GMX_ORACLE_URL: v.optional(v.string(), "https://arbitrum-api.gmxinfra.io"),
  /** GM token (pool) contract address for liquidity balance reads. When unset, liquidity is not fetched. */
  GMX_GM_POOL: v.optional(
    v.custom<Address>(
      (address) => typeof address === "string" && isAddress(address),
      "Must be a valid 20-byte hex address",
    ),
  ),

  /** Impact sampling interval in ms (min 60_000, max 3600_000). Default 300_000 (5 min) when unset. */
  IMPACT_SAMPLE_INTERVAL_MS: v.optional(
    v.pipe(v.string(), v.transform(Number), v.number(), v.minValue(60_000), v.maxValue(3600_000)),
  ),
});

export type Env = v.InferOutput<typeof envSchema>;
