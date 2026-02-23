import { getEnv } from "./env";

interface Config {
  database: { url: string };
  server: { port: number; nodeEnv: string };
  logging: { level: "debug" | "info" | "warn" | "error" };
  chain: {
    rpcUrl: string;
    privateKey: string | undefined;
    chainId: number;
    gmxOracleUrl: string | undefined;
  };
}
let config: Config | null = null;

export const getConfig = (): Config => {
  if (!config) {
    const env = getEnv();

    config = {
      database: { url: env.DATABASE_URL },
      server: { port: env.PORT, nodeEnv: env.NODE_ENV },
      logging: {
        level: (env.LOG_LEVEL ?? (env.NODE_ENV === "production" ? "info" : "debug")) as
          | "debug"
          | "info"
          | "warn"
          | "error",
      },
      chain: {
        rpcUrl: env.ARBITRUM_RPC_URL,
        privateKey: env.ARBITRUM_PRIVATE_KEY,
        chainId: env.ARBITRUM_CHAIN_ID ?? 42161,
        gmxOracleUrl: env.GMX_ORACLE_URL,
      },
    };
  }

  return config;
};
