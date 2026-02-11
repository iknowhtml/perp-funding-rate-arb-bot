# ADR 0020: Contract Interaction Patterns

- **Status:** Accepted
- **Date:** 2026-02-10
- **Owners:** -
- **Related:**
  - [ADR-0019: On-Chain Perps Pivot](0019-on-chain-perps-pivot.md)
  - [ADR-0003: Validation Strategy (Valibot)](0003-validation-strategy.md)

## Context

ADR-0019 establishes that the bot interacts with GMX v2 smart contracts on Arbitrum. This ADR decides **how** we interface with those contracts: which libraries to use, how to manage ABIs, how to build transactions, and how to monitor asynchronous order execution.

The two candidate approaches:

### Option A: SDK-First (`@gmx-io/sdk`)

Use `GmxSdk` class for everything -- reads and writes.

```typescript
const sdk = new GmxSdk({ chainId: 42161, rpcUrl, oracleUrl, walletClient, publicClient });
const { marketsInfoData, tokensData } = await sdk.markets.getMarketsInfo();
await sdk.orders.short({ marketAddress, payAmount, collateralTokenAddress, leverage, allowedSlippageBps });
```

**Pros:**
- Less code. Amount calculations, swap paths, fee estimation, and multicall construction are handled by the SDK.
- Maintained by GMX team. Tracks contract upgrades.
- Helper methods (`long()`, `short()`) auto-fetch market data and calculate everything.

**Cons:**
- **Alpha quality** (v1.5.0-alpha-1, 39 versions published). Breaking changes expected.
- **Large** (12.9MB, 710 files). Pulls in lodash, graphql, gelato-relay-sdk, crypto-js.
- **Class-based** `GmxSdk` -- minor stylistic friction with our functional codebase, but acceptable for 3rd-party (per CODE_GUIDELINES.md).
- **Write methods send transactions directly.** The SDK's `createIncreaseOrder()` builds and submits the tx via `walletClient.writeContract()`. We lose control over:
  - Pre-flight simulation (we want to simulate before committing capital)
  - Gas estimation strategy (we want our own gas circuit breaker)
  - Nonce management (serial queue needs deterministic nonces)
  - Error handling granularity (SDK throws generic errors)
- **Opaque internals.** When a tx fails, debugging requires reading SDK source to understand what it built. For a bot managing real money, we need to know exactly what's being sent.
- **Dependency risk.** If the SDK breaks or lags behind a contract upgrade, we're blocked until they ship a fix.

### Option B: Raw viem

Use `viem` directly with contract ABIs. Build every transaction ourselves.

```typescript
const positions = await publicClient.readContract({
  address: READER,
  abi: readerAbi,
  functionName: "getAccountPositions",
  args: [DATA_STORE, account, 0n, 100n],
});
```

**Pros:**
- Full control over every read and write.
- Transparent -- we see exactly what's being sent.
- Small dependency footprint (just `viem`).
- Matches functional style (no classes, just function calls).

**Cons:**
- **Much more code.** We'd need to reimplement:
  - Amount calculations (collateral, size delta, leverage)
  - Swap path finding (which markets to route through)
  - Fee estimation (position fee, funding fee, borrow fee, price impact)
  - Execution fee calculation (`GasUtils.estimateExecuteOrderGasLimit` equivalent)
  - Multicall construction (token transfer + createOrder atomically)
- **Easy to get wrong.** GMX v2 has subtle mechanics (price impact, acceptable price calculation, min output amounts). Getting these wrong means lost funds.
- **Maintenance burden.** When GMX upgrades contracts, we maintain our own ABI copies and calculations.

### Option C: Hybrid (SDK utilities + raw viem for tx lifecycle)

Use the SDK package for its **exported utilities, ABIs, and types** -- but not its `GmxSdk` class for transaction submission. Build and send transactions ourselves with raw viem.

```typescript
// Import ABIs and utilities from SDK (no GmxSdk class instantiation)
import { readerAbi } from "@gmx-io/sdk/abis/Reader";
import { convertToContractPrice } from "@gmx-io/sdk/utils/tokens";
import type { MarketInfo } from "@gmx-io/sdk/types/markets";

// Read with raw viem using SDK's ABIs
const positions = await publicClient.readContract({
  address: READER,
  abi: readerAbi,
  functionName: "getAccountPositions",
  args: [DATA_STORE, account, 0n, 100n],
});

// Build tx ourselves, simulate, then send
const { request } = await publicClient.simulateContract({
  address: EXCHANGE_ROUTER,
  abi: exchangeRouterAbi,
  functionName: "multicall",
  args: [encodedCalls],
  value: executionFee,
});
const hash = await walletClient.writeContract(request);
```

## Decision

**Option C: Hybrid.** Use `@gmx-io/sdk` as a utility library (ABIs, types, calculation helpers), not as a transaction manager. All transaction building, simulation, and submission goes through raw `viem`.

### What We Import from `@gmx-io/sdk`

| Import | What | Why |
|---|---|---|
| `@gmx-io/sdk/abis/*` | Contract ABIs (Reader, ExchangeRouter, DataStore, etc.) | Avoids manually vendoring ABIs. Updated when SDK updates. |
| `@gmx-io/sdk/utils/tokens` | `convertToContractPrice`, `convertToTokenAmount`, `convertToUsd`, `getMidPrice` | GMX uses 30-decimal USD precision internally. These conversions are easy to get wrong. |
| `@gmx-io/sdk/utils/markets` | Market info parsing, pool value calculations | Complex calculations with many edge cases. |
| `@gmx-io/sdk/utils/fees` | Fee calculation utilities | Position fees, funding fees, borrow fees, price impact. |
| `@gmx-io/sdk/utils/orders` | Order parameter helpers (acceptable price, size delta) | Acceptable price calculation has subtle rounding. |
| `@gmx-io/sdk/configs/*` | Chain configs, contract addresses, batch configs | Canonical contract addresses per chain. Don't hardcode. |
| `@gmx-io/sdk/types/*` | TypeScript types for markets, positions, orders, tokens | Type safety without reimplementing type definitions. |

### What We Do NOT Import

| Skip | Why |
|---|---|
| `GmxSdk` class | Sends txs directly. We need simulation + gas control + nonce management. |
| `sdk.orders.long()` / `short()` / `createIncreaseOrder()` | These auto-submit. We want to build → simulate → send as separate steps. |
| `sdk.markets.getMarketsInfo()` | Fetches too much data. We batch-read only what we need via multicall. |
| graphql/subsquid integration | We use the REST API for market data, not the indexer. |

### Read Pattern: Batched Multicall via viem

GMX reads benefit from batching. A single evaluation tick needs: positions, balances, market info, funding rates, gas price. Fetching these sequentially wastes round trips.

viem's built-in multicall batching handles this. When configured with the SDK's batch config, multiple `readContract` calls issued in the same tick are automatically batched into a single RPC `eth_call`:

```typescript
import { createPublicClient, http } from "viem";
import { arbitrum } from "viem/chains";
import { BATCH_CONFIGS } from "@gmx-io/sdk/configs/batch";

export const createArbitrumClient = (rpcUrl: string): PublicClient =>
  createPublicClient({
    chain: arbitrum,
    transport: http(rpcUrl),
    batch: {
      multicall: BATCH_CONFIGS[42161].client.multicall,
    },
  });
```

With this config, concurrent reads are automatically batched:

```typescript
// These fire concurrently and get batched into one RPC call
const [positions, balances, marketInfo] = await Promise.all([
  publicClient.readContract({
    address: READER,
    abi: readerAbi,
    functionName: "getAccountPositions",
    args: [DATA_STORE, account, 0n, 100n],
  }),
  publicClient.readContract({
    address: collateralToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account],
  }),
  publicClient.readContract({
    address: READER,
    abi: readerAbi,
    functionName: "getMarketInfo",
    args: [DATA_STORE, marketPrices, marketAddress],
  }),
]);
```

### Write Pattern: Build → Simulate → Send

All writes follow a three-step lifecycle. This is non-negotiable for a bot managing real capital.

#### Step 1: Build

Construct the multicall payload. GMX writes require token transfer + router call in a single tx:

```typescript
import { encodeFunctionData } from "viem";
import { exchangeRouterAbi } from "@gmx-io/sdk/abis/ExchangeRouter";

const buildIncreaseOrderTx = (params: {
  market: Address;
  collateralToken: Address;
  collateralAmount: bigint;
  sizeDeltaUsd: bigint;
  isLong: boolean;
  acceptablePrice: bigint;
  executionFee: bigint;
}): EncodedMulticall => {
  const sendWnt = encodeFunctionData({
    abi: exchangeRouterAbi,
    functionName: "sendWnt",
    args: [ORDER_VAULT, params.executionFee],
  });

  const sendTokens = encodeFunctionData({
    abi: exchangeRouterAbi,
    functionName: "sendTokens",
    args: [params.collateralToken, ORDER_VAULT, params.collateralAmount],
  });

  const createOrder = encodeFunctionData({
    abi: exchangeRouterAbi,
    functionName: "createOrder",
    args: [{
      addresses: {
        receiver: account,
        cancellationReceiver: account,
        callbackContract: zeroAddress,
        uiFeeReceiver: zeroAddress,
        market: params.market,
        initialCollateralToken: params.collateralToken,
        swapPath: [],
      },
      numbers: {
        sizeDeltaUsd: params.sizeDeltaUsd,
        initialCollateralDeltaAmount: 0n,
        triggerPrice: 0n,
        acceptablePrice: params.acceptablePrice,
        executionFee: params.executionFee,
        callbackGasLimit: 0n,
        minOutputAmount: 0n,
      },
      orderType: 2, // MarketIncrease
      decreasePositionSwapType: 0, // NoSwap
      isLong: params.isLong,
      shouldUnwrapNativeToken: false,
      autoCancel: false,
      referralCode: zeroHash,
    }],
  });

  return {
    address: EXCHANGE_ROUTER,
    abi: exchangeRouterAbi,
    functionName: "multicall",
    args: [[sendWnt, sendTokens, createOrder]],
    value: params.executionFee,
  };
};
```

#### Step 2: Simulate

Simulate before committing capital. Catches errors (insufficient collateral, market disabled, bad acceptable price) without spending gas:

```typescript
const simulateResult = await publicClient.simulateContract(txRequest);
// If simulation throws, the order would fail on-chain. Don't send.
```

#### Step 3: Send and Confirm

Submit the transaction. Wait for receipt. Then wait for keeper execution:

```typescript
const hash = await walletClient.writeContract(simulateResult.request);
const receipt = await publicClient.waitForTransactionReceipt({ hash });

if (receipt.status === "reverted") {
  throw new ChainError("Transaction reverted", { hash, receipt });
}

// Tx confirmed = order created. Now wait for keeper execution.
// See "Keeper Monitoring" below.
```

### Keeper Monitoring: EventEmitter Polling

GMX orders are asynchronous. After our tx confirms (order created), a keeper bot must execute it. We need to know when that happens.

GMX emits all events through a single `EventEmitter` contract. We poll for our order's execution or cancellation:

```typescript
const waitForOrderExecution = async (
  orderKey: Hex,
  timeoutMs: number,
): Promise<OrderExecutionResult> => {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const logs = await publicClient.getLogs({
      address: EVENT_EMITTER,
      event: parseAbiItem("event EventLog1(address msgSender, string eventName, string eventNameHash, bytes32 topic1, bytes eventData)"),
      args: { eventName: "OrderExecuted" },
      fromBlock: orderCreationBlock,
    });

    const executionLog = logs.find((log) => extractOrderKey(log) === orderKey);
    if (executionLog) {
      return { status: "executed", log: executionLog };
    }

    // Also check for cancellation
    const cancelLogs = await publicClient.getLogs({
      address: EVENT_EMITTER,
      event: parseAbiItem("event EventLog1(address msgSender, string eventName, string eventNameHash, bytes32 topic1, bytes eventData)"),
      args: { eventName: "OrderCancelled" },
      fromBlock: orderCreationBlock,
    });

    const cancelLog = cancelLogs.find((log) => extractOrderKey(log) === orderKey);
    if (cancelLog) {
      return { status: "cancelled", log: cancelLog, reason: extractCancelReason(cancelLog) };
    }

    await sleep(2000); // Poll every 2s
  }

  return { status: "timeout" };
};
```

**Why polling over `eth_subscribe`:**
- Arbitrum RPC providers often don't support `eth_subscribe` reliably (varies by provider).
- Polling is simpler and debuggable. We already use polling for market data.
- 2s poll interval is fine -- keeper execution takes 1-30s anyway.
- If we later need lower latency, we can switch to subscriptions without changing the interface.

### ABI Management

ABIs come from the `@gmx-io/sdk` package. No manual vendoring.

```typescript
// ABIs imported directly from SDK package
import { readerAbi } from "@gmx-io/sdk/abis/Reader";
import { exchangeRouterAbi } from "@gmx-io/sdk/abis/ExchangeRouter";
import { dataStoreAbi } from "@gmx-io/sdk/abis/DataStore";
```

Contract addresses come from the SDK's config exports:

```typescript
import { getContract } from "@gmx-io/sdk/configs/contracts";

const READER = getContract(42161, "Reader");
const EXCHANGE_ROUTER = getContract(42161, "ExchangeRouter");
const DATA_STORE = getContract(42161, "DataStore");
const ORDER_VAULT = getContract(42161, "OrderVault");
const EVENT_EMITTER = getContract(42161, "EventEmitter");
```

**If the SDK breaks or lags behind a contract upgrade:**
- ABIs can be sourced from Arbiscan (verified contracts) as a fallback.
- Contract addresses can be hardcoded from the [gmx-synthetics deployments folder](https://github.com/gmx-io/gmx-synthetics/tree/updates/deployments).
- The SDK is a convenience, not a hard dependency. We can vendor ABIs if needed.

### Nonce Management

The serial execution queue (ADR-0018) ensures one transaction at a time. viem handles nonces automatically within a single `walletClient` instance. No custom nonce management needed as long as we don't parallelize writes.

If keeper monitoring reveals a stuck order, we cancel it before the next write:

```typescript
// Cancel stale order before proceeding
const cancelHash = await walletClient.writeContract({
  address: EXCHANGE_ROUTER,
  abi: exchangeRouterAbi,
  functionName: "cancelOrder",
  args: [staleOrderKey],
});
await publicClient.waitForTransactionReceipt({ hash: cancelHash });
```

### Execution Fee Estimation

GMX orders require ETH for keeper gas. We estimate this using DataStore parameters:

```typescript
const estimateExecutionFee = async (orderType: "increase" | "decrease" | "deposit" | "withdrawal"): Promise<bigint> => {
  const gasLimit = await publicClient.readContract({
    address: DATA_STORE,
    abi: dataStoreAbi,
    functionName: "getUint",
    args: [executionGasLimitKey(orderType)],
  });

  const gasPrice = await publicClient.getGasPrice();

  // Add buffer (1.5x) to avoid rejection from gas price fluctuation
  const executionFee = (gasLimit * gasPrice * 3n) / 2n;

  return executionFee;
};
```

### Validation at Boundaries

Per ADR-0003 (Valibot), we validate all contract return values at the adapter boundary. Contract calls return raw tuples -- we parse them into domain types with Valibot:

```typescript
import * as v from "valibot";

const GmxPositionSchema = v.object({
  sizeInUsd: v.bigint(),
  sizeInTokens: v.bigint(),
  collateralAmount: v.bigint(),
  isLong: v.boolean(),
  // ...
});

const normalizePosition = (raw: unknown): Position => {
  const parsed = v.parse(GmxPositionSchema, raw);
  return {
    symbol: marketToSymbol(parsed.market),
    side: parsed.isLong ? "LONG" : "SHORT",
    sizeBase: parsed.sizeInTokens,
    entryPriceQuote: parsed.sizeInUsd / parsed.sizeInTokens,
    // ... normalize to domain types
  };
};
```

### Error Handling

Contract interactions can fail at multiple levels. Each gets a distinct error:

```typescript
export type ChainErrorCode =
  | "RPC_ERROR"           // RPC endpoint unreachable or rate limited
  | "SIMULATION_FAILED"   // simulateContract reverted (bad params, insufficient balance)
  | "TX_REVERTED"         // Transaction confirmed but reverted on-chain
  | "KEEPER_TIMEOUT"      // Order created but no keeper executed within timeout
  | "KEEPER_CANCELLED"    // Keeper cancelled the order (bad price, etc.)
  | "NONCE_ERROR"         // Nonce conflict (should not happen with serial queue)
  | "GAS_TOO_HIGH";       // Gas price exceeds circuit breaker threshold

export class ChainError extends Error {
  public override readonly name = "ChainError";

  constructor(
    message: string,
    public readonly code: ChainErrorCode,
    public override readonly cause?: unknown,
  ) {
    super(message, { cause });
  }
}
```

## Consequences

### Positive

1. **Full tx lifecycle control.** We simulate before sending, manage gas budgets, and handle keeper timeouts. Essential for a bot managing real money.
2. **SDK as utility, not runtime.** We get ABIs, types, and calculation helpers without coupling to the SDK's transaction flow. If the SDK breaks, we can vendor the pieces we need.
3. **Transparent execution.** Every tx is built by our code. When something fails, we know exactly what was sent and can debug without reading SDK internals.
4. **Consistent validation.** Valibot at the boundary means contract return values are validated before entering domain logic, same pattern as CEX API responses (ADR-0003).
5. **Minimal new concepts.** viem's `readContract` / `writeContract` / `simulateContract` are the entire API surface. No framework, no abstraction layers.

### Negative

1. **More code than pure SDK approach.** We build multicall payloads, calculate execution fees, and monitor keeper events ourselves. This is more code but more control.
2. **SDK dependency for ABIs.** If `@gmx-io/sdk` stops publishing or restructures exports, we need to vendor ABIs. Low risk -- ABIs are also available from Arbiscan.
3. **Calculation helpers may drift.** If GMX changes fee logic and the SDK's utility functions update, we're fine. If we bypass a utility and calculate manually, we could drift. Mitigation: use SDK utilities for all non-trivial calculations.

### Risks

| Risk | Mitigation |
|---|---|
| SDK alpha breakage | We import utilities/ABIs, not the class. If exports break, vendor the specific files. |
| Contract upgrade changes ABI | SDK update or re-vendor from Arbiscan. Monitor GMX update channels. |
| Execution fee estimation too low | 1.5x buffer on gas price. If rejected, retry with higher fee. |
| Keeper monitoring misses events | Poll from order creation block. If timeout, read position state to verify. |
| RPC rate limiting | Use private RPC endpoint (Alchemy/Infura). Batch reads via multicall. |

## References

- [@gmx-io/sdk npm](https://www.npmjs.com/package/@gmx-io/sdk) -- v1.5.0-alpha-1
- [GMX SDK source](https://github.com/gmx-io/gmx-interface/tree/master/sdk)
- [GMX v2 Contracts](https://docs.gmx.io/docs/api/contracts-v2)
- [gmx-synthetics repo](https://github.com/gmx-io/gmx-synthetics) -- contract source, ABIs, deployments
- [viem documentation](https://viem.sh/)
