# ADR 0024: Data Plane — REST Polling Model

- **Status:** Accepted
- **Date:** 2026-02-11
- **Owners:** -
- **Related:**
  - [ADR-0022: Regime-Based GMX v2 Funding Arb Bot](0022-regime-based-gmx-arb.md)
  - [ADR-0019: On-Chain Perps Pivot](0019-on-chain-perps-pivot.md)
  - [ADR-0001: Bot Architecture](0001-bot-architecture.md)
  - [ADR-0008: Monitoring & Observability](0008-monitoring-observability.md)

## Context

The CEX model used WebSocket-primary, REST-fallback data feeds. GMX has no WebSocket API. The data plane shifts entirely to REST polling (GMX HTTP API) and RPC reads (contract calls via viem).

ADR-0019 includes a polling interval table, but the rationale for those intervals, staleness policies, and failure modes need to be formalized.

### Data Sources

| Data | Source | Method |
|------|--------|--------|
| Ticker prices | GMX REST API (`/prices/tickers`) | HTTP GET |
| Funding rates | GMX REST API (`/markets/info`) | HTTP GET |
| OI skew | GMX REST API (`/markets/info`) or Reader contract | HTTP GET or RPC |
| Position state | Reader contract (`getPositionInfo`) | RPC multicall |
| GM token balance | ERC20 `balanceOf` | RPC |
| Gas prices | Arbitrum RPC (`eth_gasPrice`) | RPC |
| Oracle health | Chainlink oracle + REST ticker comparison | RPC + HTTP |
| Sequencer status | Chainlink L2 Sequencer Uptime Feed | RPC |

### Trade-offs

- **REST API vs direct contract reads**: REST is cheaper (no RPC calls) and pre-aggregated, but adds a dependency on GMX infrastructure. Contract reads are trustless but cost RPC calls.
- **Polling frequency vs RPC budget**: More frequent polling = fresher data but more RPC calls and API requests. Arbitrum RPCs have rate limits (typically 100-300 req/s for paid plans, less for free tiers).
- **Fixed vs adaptive intervals**: Fixed is simple. Adaptive (faster during active hedge, slower when idle) saves RPC budget but adds complexity.

### Resolved Decisions (ADR-0022)

1. **Polling intervals** (ADR-0022 Data Plane):
   - Funding/OI: 30–60s
   - Positions/balances: 30s
   - Gas: 10s
   - Fixed intervals for predictability.

2. **Staleness thresholds**: Circuit breakers in risk engine (ADR-0022) handle oracle staleness. When data is stale, pause trading per operational runbook.

3. **REST API vs contract reads** (ADR-0022): REST-primary for market data (GMX REST markets/info: funding, borrow, OI, market state); Chain RPC + Reader/DataStore for positions, balances, oracle health. Pragmatic split.

### Open Questions

4. **RPC call budget**: How many calls/second should the bot use?
   - Depends on RPC provider and plan
   - Should there be a rate limiter on RPC calls (reusing the existing token bucket from ADR-0011)?
   - Multicall batching (A-01) reduces individual calls — how does this affect the budget?

5. **Data consistency**: How to handle inconsistency between REST and RPC data?
   - Ticker from REST says price is X, but contract read shows a different state
   - **Option A**: Trust REST for display, trust contracts for execution — different sources for different purposes
   - **Option B**: Cross-validate and alert on divergence
   - **Option C**: Always use contracts for decisions, REST only for monitoring dashboards

6. **Failure handling**: What happens when a data source fails?
   - **Option A**: Mark data as stale, let staleness rules handle it (existing pattern from ADR-0001)
   - **Option B**: Circuit breaker per data source — stop polling after N failures, retry with backoff
   - **Option C**: Failover to alternate source (REST → contract or vice versa)

## Decision

**Accepted.** Polling cadences and source split per ADR-0022 Data Plane section. Funding/OI 30–60s, positions/balances 30s, gas 10s. REST for market data, RPC + Reader for account data. Staleness handled by risk engine circuit breakers.

## Consequences

### Positive

- Predictable RPC budget with fixed intervals.
- REST reduces RPC load for high-volume market data.
- Staleness gates prevent trading on stale data.

### Negative

- REST dependency on GMX infrastructure. Fallback to contract reads if REST unavailable (future work).

## References

- [GMX v2 REST API](https://docs.gmx.io/docs/api/rest-v2)
- [Arbitrum RPC Providers](https://docs.arbitrum.io/build-decentralized-apps/reference/node-providers)
- Plan A-01: Viem Client Setup (multicall batching)
- Plan B-02: GMX Adapter — Read Operations
