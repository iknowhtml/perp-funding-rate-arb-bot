# ADR 0019: Pivot to On-Chain Perpetuals (GMX v2 on Arbitrum)

- **Status:** Accepted
- **Date:** 2026-02-10
- **Owners:** -
- **Related:**
  - [ADR-0001: Bot Architecture](0001-bot-architecture.md)
  - [ADR-0002: Hexagonal-Inspired Architecture](0002-hexagonal-inspired-architecture.md)
  - [ADR-0010: Exchange Adapters](0010-exchange-adapters.md)
  - [ADR-0014: Funding Rate Strategy](0014-funding-rate-strategy.md)
  - [ADR-0015: Execution Safety & Slippage](0015-execution-safety-slippage.md)

## Context

The original design targets CEX perpetual funding rate arbitrage (short perp + long spot on exchanges like Coinbase, Binance, Bybit). While phases 1-3 of the CEX roadmap are largely complete, **geographic restrictions block access to perpetual futures on major centralized exchanges.** This is the forcing function for the pivot -- without access to CEX perps, the existing strategy cannot execute.

On-chain perpetual protocols are permissionless by design: a wallet and an RPC endpoint are all that's needed. No KYC, no geographic gating, no API approval tiers. This removes the access barrier entirely.

Beyond solving the access problem, on-chain perps (specifically pool-based designs like GMX v2) also offer structural advantages:

1. **Funding imbalances persist**: GMX's adaptive funding is driven by open interest skew, not microsecond price competition. Imbalances last hours or days, not milliseconds. Logic and discipline beat infrastructure arms races.
2. **Clean delta-neutral hedge**: Short perp + long GM tokens (liquidity pool shares) achieves delta neutrality in a single protocol. No stitching together multiple exchanges.
3. **Capital efficiency**: GM tokens earn LP fees (trading fees, borrow fees) on top of the funding rate edge. The hedge leg generates yield instead of sitting idle as spot.
4. **No counterparty risk**: Funds stay in your wallet or in audited smart contracts. No exchange insolvency exposure.
5. **Architecture compatibility**: The existing hexagonal architecture (ADR-0002), state machines (ADR-0012), and evaluation pipeline (ADR-0001) port almost directly. We're swapping order placement for transaction building, not reinventing the bot.

### Why GMX v2 Specifically

| Protocol | Assessment |
|---|---|
| **GMX v2 (Arbitrum)** | Pool-based, adaptive funding from OI skew, GM tokens as hedge leg, official TypeScript SDK, deep liquidity, Arbitrum L2 costs |
| **Perpetual Protocol v2** | Funding settles per trade (edge vanishes faster), vAMM slippage punishes size, less persistent mispricing |
| **Synthetix** | Synth abstraction adds fragility, awkward hedge paths, history of oracle edge cases |
| **dYdX** | Orderbook-based (effectively a CEX with extra steps), capital inefficient, doesn't escape the problems motivating this pivot |
| **Drift (Solana)** | Strong protocol, but Solana tooling/infra adds complexity. Different execution model. Better as phase 2 after EVM is proven |

GMX v2 wins because the structural edge (OI skew persistence) matches our existing strategy logic, the hedge model is clean (one protocol, two legs), and the TypeScript SDK exists.

## Decision

**Pivot the bot from CEX perpetual funding rate arbitrage to on-chain perpetual funding rate arbitrage, starting with GMX v2 on Arbitrum.**

### What This Means Concretely

1. **Archive CEX roadmap phases 4-6** (Simulation, Live Testing, Production). These plans are CEX-specific and no longer applicable.
2. **Keep phases 1-3 infrastructure**. The foundation (logging, config, database, scheduler, serial queue, HTTP server), state machines, risk engine, strategy engine, and evaluation pipeline all carry over.
3. **Delete `ExchangeAdapter` and CEX adapter code** (`src/adapters/coinbase/`, `binance/`, `bybit/`). It's in git history if ever needed. No replacement interface -- build a concrete GMX module instead (see rationale below).
4. **Implement a GMX adapter module** (`src/adapters/gmx/`) using `@gmx-io/sdk` utilities and `viem`. Domain code depends on it directly.
5. **Adapt the strategy engine** to use OI skew-derived funding signals instead of CEX-predicted funding rates.
6. **Adapt the execution engine** to build and submit on-chain transactions instead of calling exchange REST APIs.
7. **Extend the risk engine** with on-chain risk factors (gas costs, oracle risk, keeper execution delay).

### Hedge Model

The delta-neutral hedge changes from two separate venues to a single protocol:

| | CEX Model | GMX v2 Model |
|---|---|---|
| **Short leg** | Short perp on exchange (receive funding) | Short perp on GMX (receive funding from OI skew) |
| **Long leg** | Long spot on exchange (delta hedge) | Long GM tokens (delta hedge + earn LP fees) |
| **Entry** | API: place perp short + place spot buy | Tx: `ExchangeRouter.createOrder` + `ExchangeRouter.createDeposit` |
| **Exit** | API: sell spot + close perp | Tx: `ExchangeRouter.createOrder` (decrease) + `ExchangeRouter.createWithdrawal` |
| **Yield sources** | Funding rate only | Funding rate + LP fees (trading, borrow, price impact rebates) |
| **Settlement** | Every 8 hours (exchange-specific) | Continuous (adaptive funding adjusts per second) |

### Architecture Mapping

The existing two-loops-plus-queue architecture (ADR-0001) maps cleanly:

```
CEX Concept                → On-Chain GMX Equivalent
───────────────────────────────────────────────────
Funding rate snapshot      → OI skew-derived funding rate (REST API or Reader contract)
Spot + perp hedge          → GM tokens + perp position
Enter hedge job            → Build + simulate + send transaction
Exit hedge job             → Build + simulate + send reverse transaction
Reconciler (REST poll)     → Read chain state (Reader contract / RPC)
Risk engine                → Liquidation distance + slippage + gas cost + oracle health
Serial execution queue     → Still one tx at a time (prevents nonce conflicts)
WebSocket data plane       → REST polling (GMX has no WS; Arbitrum block time ~250ms)
Stale data response rules  → RPC health + oracle staleness checks
```

### New Dependencies

| Library | Purpose | Rationale |
|---|---|---|
| `viem` | Ethereum client (RPC, tx signing, ABI encoding) | TypeScript-first, tree-shakeable, functional API. Fits the project's functional programming style (vs `ethers.js` which is class-heavy). Battle-tested in production DeFi. |
| `@gmx-io/sdk` | GMX v2 SDK (ABIs, types, calculation utilities) | Official TypeScript SDK used as a utility library -- we import ABIs, types, and helper functions but not the `GmxSdk` class. See [ADR-0020](0020-contract-interaction-patterns.md) for details. |

### Why No Interface (Yet)

The existing `ExchangeAdapter` interface (ADR-0010) was designed for CEX API interactions. It doesn't fit GMX:

- `getOrderBook()` -- GMX is pool-based, no order book
- `subscribeTicker()` / `unsubscribeTicker()` -- GMX has no WebSocket
- `CreateOrderParams` -- assumes CEX-style orders (`timeInForce`, `stopPriceQuote`); GMX needs execution fees, acceptable prices, collateral token addresses
- `createOrder()` returns a filled/pending order; GMX orders are async (keeper-executed 1-30s later)
- GM token deposit/withdrawal (half the strategy) doesn't exist in the interface

Rather than design a new `ProtocolAdapter` interface upfront, we build a **concrete GMX module** and skip the interface entirely:

1. **We have exactly one protocol.** An interface designed for one implementation is speculative. The "common surface" between GMX and Drift (if we add it later) isn't knowable yet -- GMX has GM tokens and keepers, Drift has a different execution model entirely.
2. **Testing doesn't require an interface.** We use `vi.mock()` to mock modules. A concrete module is just as mockable as an interface.
3. **Extract later, don't design upfront.** When (if) we add a second protocol, we'll have two concrete implementations to compare. The common interface will be obvious, not guessed. This follows "extract interfaces from implementations."

The GMX module exports functions directly:

```typescript
// src/adapters/gmx/index.ts -- concrete exports, no interface
export { createGmxAdapter } from "./adapter";
export type { GmxAdapter } from "./adapter";
```

Domain code calls the adapter directly:

```typescript
// src/worker/execution/enter-hedge.ts
import type { GmxAdapter } from "@/adapters/gmx";

export const executeEnterHedge = async (
  adapter: GmxAdapter,
  params: EnterHedgeParams,
): Promise<ExecutionResult> => {
  const simulation = await adapter.simulateOrder(params.perpOrder);
  // ...
};
```

If we add Drift later, we extract the common surface into an interface at that point. Until then, the concrete type is the contract.

The CEX adapter code (`src/adapters/coinbase/`, `src/adapters/binance/`, `src/adapters/bybit/`) is deleted. It's in git history if ever needed.

### GMX v2 Funding Rate Mechanics

GMX v2 uses **adaptive funding** that adjusts continuously based on OI skew:

- When longs > shorts, longs pay shorts (and vice versa)
- The funding rate increases or decreases over time based on `FUNDING_INCREASE_FACTOR_PER_SECOND` and `FUNDING_DECREASE_FACTOR_PER_SECOND`
- A `THRESHOLD_FOR_STABLE_FUNDING` determines when the rate stops changing
- A `THRESHOLD_FOR_DECREASE_FUNDING` determines when the rate starts declining

These parameters are readable from the DataStore contract. The REST API at `https://arbitrum-api.gmxinfra.io/markets/info` provides pre-computed funding rates, borrow rates, and net rates per market.

The strategy signal becomes:

```
High OI skew (longs >> shorts)
  + Stable or increasing funding rate
  + Funding rate exceeds minimum threshold
  + GM token yield supplements funding income
  = ENTER: short perp + deposit GM tokens
```

This is structurally identical to the CEX strategy (ADR-0014) but the data source changes from exchange-predicted rates to on-chain OI skew.

### Transaction Lifecycle

On-chain execution differs fundamentally from CEX API calls. GMX orders are **asynchronous**: they are submitted to the ExchangeRouter, then executed by keeper bots. This introduces a new lifecycle:

```
Build Tx → Simulate → Send → Wait for Keeper → Confirm/Cancel
```

Specifically:

1. **Token approval**: ERC20 `approve` for collateral token to ExchangeRouter
2. **Multicall**: Transfer collateral to OrderVault + call `ExchangeRouter.createOrder` in a single transaction (mandatory — separate txs would allow frontrunning)
3. **Execution fee**: Include ETH for keeper gas (estimated via `GasUtils.estimateExecuteOrderGasLimit`)
4. **Keeper execution**: External keeper bots pick up the order and execute it against the oracle price. This is not instant — typical latency is 1-30 seconds.
5. **Confirmation**: Monitor the EventEmitter contract for execution or cancellation events
6. **Timeout handling**: If no keeper executes within a configurable timeout, cancel the order and reclaim collateral

The serial execution queue (ADR-0018) remains critical: it prevents nonce conflicts and ensures one transaction lifecycle completes before the next begins.

### Simulation Before Execution

GMX provides `ExchangeRouter.simulateExecuteDeposit`, `simulateExecuteWithdrawal`, and `simulateExecuteOrder` functions. These allow pre-flight checks before committing capital:

```typescript
// Before creating a real order, simulate to check for errors
const simulateResult = await publicClient.simulateContract({
  address: EXCHANGE_ROUTER,
  abi: exchangeRouterAbi,
  functionName: "simulateExecuteOrder",
  args: [orderParams, oracleParams],
});
```

This replaces the pre-trade slippage estimation from order book depth (ADR-0015) with a contract-level simulation that accounts for:
- Price impact from pool utilization
- Available liquidity in the GM pool
- Current oracle prices
- Fee calculations (position fee, funding fee, borrow fee)

### Data Plane Adaptation

GMX does not provide WebSocket feeds. The data plane shifts from WS-primary/REST-fallback to REST-only polling:

| Data | Source | Interval |
|---|---|---|
| Ticker prices | GMX REST API (`prices/tickers`) | 5s |
| Funding rates | GMX REST API (`markets/info`) | 30s |
| Position state | Reader contract via RPC | 30s |
| GM token balances | ERC20 `balanceOf` via RPC | 30s |
| Gas prices | Arbitrum RPC (`eth_gasPrice`) | 10s |
| Oracle health | Compare oracle price vs REST ticker | 30s |

Arbitrum's block time (~250ms) means REST polling at 5s intervals provides sufficient freshness. The per-stream health tracking (ADR-0001) adapts to track RPC health and oracle staleness instead of WebSocket connection state.

### Risk Engine Extensions

The risk engine (ADR-0013) gains on-chain-specific risk factors:

| Risk Factor | Check | Response |
|---|---|---|
| **Gas cost erosion** | Compare gas cost per tx vs expected funding yield | Block entry if gas > yield threshold |
| **Keeper execution delay** | Monitor time between order submission and execution | Alert if delay > threshold, cancel if > timeout |
| **Oracle staleness** | Compare Chainlink oracle timestamp vs current block | Pause trading if oracle age > threshold |
| **Oracle deviation** | Compare oracle price vs REST API price | Alert on divergence > threshold |
| **Liquidation distance** | Read from `Reader.getPositionInfo` | Same escalation as CEX (ADR-0013) but data from chain |
| **GM token impermanent loss** | Track GM token value vs deposited value | Alert if IL exceeds threshold, factor into exit signals |
| **Smart contract risk** | N/A (accepted risk) | Mitigate with small capital, testnet validation |

### Environment Configuration

New environment variables:

```bash
# Chain
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
ARBITRUM_PRIVATE_KEY=0x...

# GMX
GMX_ORACLE_URL=https://arbitrum-api.gmxinfra.io
GMX_SUBSQUID_URL=https://gmx.squids.live/gmx-synthetics-arbitrum:prod/api/graphql
GMX_MARKET_ADDRESS=0x...  # Target market (e.g., ETH/USD)

# Gas
MAX_GAS_PRICE_GWEI=1     # Circuit breaker for gas spikes
MIN_YIELD_AFTER_GAS_BPS=5 # Minimum yield after gas costs
```

### File Structure

```
src/adapters/
├── types.ts                    # Shared domain types (Balance, Position, Ticker, FundingRate, etc.)
├── errors.ts                   # Shared error types (renamed from ExchangeError to AdapterError)
├── paper/                      # Preserved (can wrap GMX adapter later)
└── gmx/                        # NEW
    ├── adapter.ts              # Concrete GMX adapter (no interface -- export GmxAdapter type)
    ├── adapter.test.ts
    ├── normalizers.ts          # Contract/API responses → domain types
    ├── normalizers.test.ts
    ├── schemas.ts              # Valibot schemas for GMX API responses
    ├── contracts.ts            # Contract addresses, ABIs, helpers
    ├── tx-builder.ts           # Transaction building utilities
    ├── tx-builder.test.ts
    ├── keeper-monitor.ts       # EventEmitter monitoring for order execution
    ├── keeper-monitor.test.ts
    └── index.ts

src/lib/chain/                  # NEW
├── client.ts                   # viem public + wallet client factory
├── client.test.ts
├── constants.ts                # Chain IDs, block times, gas defaults
└── index.ts
```

## Consequences

### Positive

1. **Removes the access barrier**: On-chain perps are permissionless. No geographic restrictions, KYC, or API approval tiers.
2. **Structural edge over speed edge**: OI skew imbalances persist for hours/days. Logic and discipline beat infrastructure arms races.
3. **Dual yield**: GM tokens earn LP fees on top of the funding rate edge. The hedge leg generates yield instead of sitting idle as spot.
4. **Architecture reuse**: ~60% of the codebase carries over unchanged. The hexagonal architecture proves its value -- the domain layer (strategy, risk, state machines) is adapter-agnostic.
5. **No speculative abstractions**: Concrete GMX module, no premature interface. Domain code calls what it means. If we add Drift later, we extract a common interface from two real implementations instead of guessing upfront.
6. **Path to multi-protocol**: When a second protocol is added, the common surface is extracted from concrete implementations. The adapter pattern emerges from reality, not speculation.
7. **Transparent execution**: All trades are on-chain and verifiable. No counterparty risk beyond smart contract risk.

### Negative

1. **Smart contract risk**: GMX contracts could have bugs. Mitigation: start with testnet, then tiny real capital. GMX is well-audited but risk is non-zero.
2. **Keeper execution latency**: Orders are asynchronous (1-30s delay for keeper execution). This means worse fills during volatility. Mitigation: simulation before submission, conservative acceptable price parameters.
3. **Gas cost overhead**: Every trade costs gas. On Arbitrum this is typically $0.01-$0.50 per tx, but can spike. Mitigation: gas price circuit breaker, minimum yield threshold that accounts for gas.
4. **No WebSocket**: GMX has no real-time push feed. Polling introduces latency vs CEX WebSocket. Mitigation: acceptable because the edge is structural (hours/days), not speed-based (milliseconds).
5. **Async order model**: CEX orders are (mostly) synchronous — place order, get fill. GMX orders go through keepers. This adds complexity to the execution engine. Mitigation: explicit state machine for order lifecycle, timeout + cancellation logic.
6. **Oracle risk**: GMX uses Chainlink oracles. Oracle manipulation or staleness could cause bad fills or liquidations. Mitigation: oracle health monitoring, price deviation alerts.

### Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Smart contract exploit | High impact, low probability | Small capital, testnet first, monitor GMX security channels |
| Keeper non-execution | Medium | Timeout + cancel logic, execution fee buffer |
| Gas spike during exit | Medium | Gas circuit breaker, pre-funded execution fee, emergency exit at any gas price |
| Oracle manipulation | High impact, low probability | Price deviation monitoring, position size limits |
| GM token impermanent loss | Medium | IL tracking, size limits, factor into yield calculation |
| Arbitrum sequencer downtime | Medium | Health monitoring, pause trading on sequencer issues |
| Private key compromise | High impact | Hardware wallet for production, separate hot wallet with limited funds |

## Migration Path

### Phase A: Chain Infrastructure
- Add `viem` and `@gmx-io/sdk` dependencies
- Create `src/lib/chain/` with Arbitrum client setup
- Create GMX contract integration (Reader, DataStore, ExchangeRouter)
- Implement transaction lifecycle (build, simulate, send, confirm)

### Phase B: GMX Adapter Module
- Define GMX-specific types (`TxResult`, `OpenPositionParams`, etc.) and shared domain types
- Implement GMX adapter: read operations (balance, position, funding rate, ticker, market info, OI)
- Implement GMX adapter: write operations (open/close position, deposit/withdraw GM tokens)
- Implement keeper monitoring (EventEmitter polling for async order confirmation)
- Delete CEX adapter code and `ExchangeAdapter` interface
- Update domain call sites to use concrete GMX adapter

### Phase C: Strategy & Risk Adaptation
- Redesign funding signal for OI skew + adaptive funding model
- Add GM token yield model (LP fees + funding)
- Extend risk engine with gas, oracle, and keeper delay factors
- Update entry/exit thresholds for on-chain economics

### Phase D: Execution Adaptation
- Adapt enter hedge: short perp tx + GM deposit tx
- Adapt exit hedge: close perp tx + GM withdrawal tx
- Handle execution fees, async order lifecycle, timeouts

### Phase E: Testing & Deployment
- End-to-end on Arbitrum Sepolia (GMX testnet)
- Small capital deployment on real Arbitrum
- Monitoring adaptation (gas spend, tx success rate, GM yield)

## References

- [GMX v2 Contracts Documentation](https://docs.gmx.io/docs/api/contracts-v2)
- [GMX v2 TypeScript SDK](https://github.com/gmx-io/gmx-interface/tree/master/sdk)
- [GMX v2 REST API](https://docs.gmx.io/docs/api/rest-v2)
- [GMX Adaptive Funding](https://docs.gmx.io/docs/trading/v2#adaptive-funding)
- [viem Documentation](https://viem.sh/)
- [Arbitrum Documentation](https://docs.arbitrum.io/)
- [50shadesofgwei/funding-rate-arbitrage](https://github.com/50shadesofgwei/funding-rate-arbitrage) — reference implementation (Python, GMX + Synthetix)
