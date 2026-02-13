---
name: Chain Infrastructure
overview: Viem client + GMX contract read helpers — foundation for Phase 0 data collector and impact sampler. Reads only; no tx lifecycle.
todos:
  - id: install-deps
    content: Install viem and @gmx-io/sdk dependencies
    status: pending
  - id: chain-constants
    content: Create src/lib/chain/constants.ts with Arbitrum chain config, contract addresses, gas defaults
    status: pending
  - id: public-client
    content: Create src/lib/chain/client.ts with createArbitrumPublicClient (multicall batching via SDK)
    status: pending
  - id: wallet-client
    content: Add createArbitrumWalletClient to client.ts (optional for Phase 0 — impact sampler needs it)
    status: pending
  - id: rpc-health
    content: Create src/lib/chain/health.ts with RPC health monitoring
    status: pending
  - id: gmx-contracts
    content: Create src/adapters/gmx/contracts.ts with GMX contract addresses from SDK
    status: pending
  - id: gmx-reader-rest
    content: Create GMX Reader + REST API helpers for market data (positions, funding, OI, tickers)
    status: pending
  - id: env-schema
    content: Update env schema with ARBITRUM_RPC_URL, ARBITRUM_PRIVATE_KEY, GMX_ORACLE_URL
    status: pending
  - id: tests
    content: Add unit tests for client factory, health monitor, GMX read helpers
    status: pending
  - id: smoke-tests
    content: Add smoke tests (live RPC + REST) — validate connectivity, multicall, REST parsing, health monitor
    status: pending
  - id: code-review
    content: Run code-reviewer subagent
    status: pending
  - id: lifecycle-management
    content: "Move plan to implemented/"
    status: pending
isProject: false
---

> **Phase 0-01** in [GMX Pivot Roadmap](../../README.md). Reference: [ADR-0022](../../../../../adrs/0022-regime-based-gmx-arb.md), [ADR-0024](../../../../../adrs/0024-data-plane-rest-polling.md)

# Chain Infrastructure

## Overview

Set up the Ethereum/Arbitrum client layer and GMX read helpers. This consolidates the foundation from the former Phase A-01 and A-02, scoped to **reads only** for Phase 0 (no transaction lifecycle yet).

Phase 0 needs:
- Public client for RPC reads (market data, OI, gas price)
- GMX REST API client (funding rates, borrow rates, OI long/short)
- Reader contract helpers for positions, balances (for later Phase 1)
- RPC health monitoring (circuit breaker input)

## Tasks

See deprecated [phase-a-chain-infra/0001-viem-client-setup.md](../../../deprecated/0002-gmx-pivot-v1/phase-a-chain-infra/0001-viem-client-setup.md) and [0002-gmx-contract-integration.md](../../../deprecated/0002-gmx-pivot-v1/phase-a-chain-infra/0002-gmx-contract-integration.md) for implementation details.

Scope for Phase 0:
- Viem public + wallet client (wallet needed for impact sampler simulation)
- GMX contract addresses, Reader helpers, REST API client
- Valibot schemas for REST responses and contract data
- No ExchangeRouter writes, no tx send/confirm

## Validation

- [ ] All code passes typecheck and biome
- [ ] Unit tests pass (`pnpm test:run`)
- [ ] Smoke tests pass against live Arbitrum RPC + GMX REST (`pnpm test:run --testPathPattern smoke`)

## Smoke Tests

Live integration tests that prove the infrastructure actually works. Gated behind `ARBITRUM_RPC_URL` env var — skipped in CI, run manually during development.

File: `src/lib/chain/chain.smoke.test.ts` + `src/adapters/gmx/gmx.smoke.test.ts`

### 1. RPC Connectivity (`chain.smoke.test.ts`)

```typescript
describe("Arbitrum RPC connectivity", () => {
  it("should connect and return a valid block number", async () => {
    const client = createArbitrumPublicClient(ARBITRUM_RPC_URL);
    const blockNumber = await client.getBlockNumber();
    expect(blockNumber).toBeGreaterThan(0n);
  });

  it("should confirm chain ID is 42161 (Arbitrum One)", async () => {
    const client = createArbitrumPublicClient(ARBITRUM_RPC_URL);
    const chainId = await client.getChainId();
    expect(chainId).toBe(42161);
  });

  it("should return a recent block (< 60s old)", async () => {
    const client = createArbitrumPublicClient(ARBITRUM_RPC_URL);
    const block = await client.getBlock({ blockTag: "latest" });
    const nowSec = BigInt(Math.floor(Date.now() / 1000));
    const ageSec = nowSec - block.timestamp;
    expect(ageSec).toBeLessThan(60n);
  });
});
```

**Validates**: env schema (`ARBITRUM_RPC_URL`), public client factory, basic RPC reads.

### 2. Multicall Batching (`chain.smoke.test.ts`)

```typescript
it("should batch concurrent reads into a single multicall", async () => {
  const client = createArbitrumPublicClient(ARBITRUM_RPC_URL);

  // Fire 3 reads concurrently — viem batches them into one eth_call
  const [blockNumber, gasPrice, chainId] = await Promise.all([
    client.getBlockNumber(),
    client.getGasPrice(),
    client.getChainId(),
  ]);

  expect(blockNumber).toBeGreaterThan(0n);
  expect(gasPrice).toBeGreaterThan(0n);
  expect(chainId).toBe(42161);
});
```

**Validates**: multicall config from `@gmx-io/sdk` BATCH_CONFIGS, concurrent read batching.

### 3. GMX REST API — Tickers (`gmx.smoke.test.ts`)

```typescript
it("should fetch and parse /prices/tickers", async () => {
  const tickers = await fetchGmxTickers(GMX_ORACLE_URL);

  expect(tickers.length).toBeGreaterThan(0);

  // Verify ETH market exists
  const ethTicker = tickers.find((t) => t.tokenSymbol === "ETH");
  expect(ethTicker).toBeDefined();
  expect(ethTicker!.maxPrice).toBeGreaterThan(0n);
  expect(ethTicker!.minPrice).toBeGreaterThan(0n);
});
```

**Validates**: REST client, Valibot schema for ticker response, GMX oracle URL config.

### 4. GMX REST API — Markets Info (`gmx.smoke.test.ts`)

```typescript
it("should fetch and parse /markets/info with funding and OI", async () => {
  const markets = await fetchGmxMarketsInfo(GMX_ORACLE_URL);

  expect(markets.length).toBeGreaterThan(0);

  // Verify a market has funding/OI data
  const ethMarket = markets.find((m) => m.marketName.includes("ETH"));
  expect(ethMarket).toBeDefined();
  expect(ethMarket!.longFundingRate).toBeDefined();
  expect(ethMarket!.shortFundingRate).toBeDefined();
  expect(ethMarket!.longOpenInterestUsd).toBeGreaterThan(0n);
});
```

**Validates**: REST client, Valibot schema for market info, funding rate + OI parsing.

### 5. Reader Contract — Market Data (`gmx.smoke.test.ts`)

```typescript
it("should read market data via Reader contract", async () => {
  const client = createArbitrumPublicClient(ARBITRUM_RPC_URL);

  const marketCount = await client.readContract({
    address: GMX_CONTRACTS.dataStore,
    abi: dataStoreAbi,
    functionName: "getAddressCount",
    args: [MARKET_LIST_KEY],
  });

  expect(marketCount).toBeGreaterThan(0n);
});
```

**Validates**: GMX contract addresses from SDK, ABI imports, Reader contract reads.

### 6. RPC Health Monitor (`chain.smoke.test.ts`)

```typescript
it("should report healthy for a live RPC", async () => {
  const client = createArbitrumPublicClient(ARBITRUM_RPC_URL);
  const health = await checkRpcHealth(client);

  expect(health.status).toBe("healthy");
  expect(health.blockNumber).toBeGreaterThan(0n);
  expect(health.blockAgeSec).toBeLessThan(60n);
  expect(health.chainId).toBe(42161);
});

it("should report unhealthy for an unreachable RPC", async () => {
  const client = createArbitrumPublicClient("http://localhost:1");
  const health = await checkRpcHealth(client);

  expect(health.status).toBe("unhealthy");
});
```

**Validates**: health monitor logic, stale block detection, error handling for dead RPCs.

### Test Config

Smoke tests use a `describe.runIf` guard so they skip when env vars are missing:

```typescript
const ARBITRUM_RPC_URL = process.env.ARBITRUM_RPC_URL;
const GMX_ORACLE_URL = process.env.GMX_ORACLE_URL ?? "https://arbitrum-api.gmxinfra.io";

describe.runIf(ARBITRUM_RPC_URL)("smoke: chain infrastructure", () => {
  // ... tests above
});
```

Run manually: `ARBITRUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/xxx pnpm test:run --testPathPattern smoke`

## References

- [ADR-0022: Regime-Based GMX v2 Funding Arb Bot](../../../../../adrs/0022-regime-based-gmx-arb.md)
- [ADR-0020: Contract Interaction Patterns](../../../../../adrs/0020-contract-interaction-patterns.md)
- [ADR-0024: Data Plane REST Polling](../../../../../adrs/0024-data-plane-rest-polling.md)
