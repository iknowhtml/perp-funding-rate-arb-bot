import { env } from "./env/env";

export const config = {
  database: {
    url: env.DATABASE_URL,
  },
  server: {
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
  },
  logging: {
    level: env.LOG_LEVEL ?? (env.NODE_ENV === "production" ? "info" : "debug"),
  },
  chain: {
    rpcUrl: env.ARBITRUM_RPC_URL,
    privateKey: env.ARBITRUM_PRIVATE_KEY,
    chainId: env.ARBITRUM_CHAIN_ID,
    gmxOracleUrl: env.GMX_ORACLE_URL,
  },
} as const;
