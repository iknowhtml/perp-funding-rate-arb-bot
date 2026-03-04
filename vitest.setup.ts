/**
 * Vitest setup: set minimal env vars so modules that call getEnv()/parseEnv() (e.g. via
 * createLogger -> getConfig) do not call process.exit(1) when tests load.
 * Required by env schema: DATABASE_URL, PORT, NODE_ENV, ARBITRUM_RPC_URL.
 */
const required = {
  DATABASE_URL: "postgresql://localhost:5432/test",
  PORT: "3000",
  NODE_ENV: "test",
  ARBITRUM_RPC_URL: "https://arb1.arbitrum.io/rpc",
  ARBITRUM_CHAIN_ID: "42161",
};

for (const [key, value] of Object.entries(required)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}
