# ADR 0010: Exchange Adapter Pattern

- **Status:** Accepted
- **Date:** 2026-02-04
- **Updated:** 2026-03-04
- **Owners:** -
- **Related:**
  - [ADR-0001: Bot Architecture](0001-bot-architecture.md)
  - [ADR-0012: State Machines](0012-state-machines.md)
  - [ADR-0016: Backtesting & Simulation](0016-backtesting-simulation.md)

## Context

The bot needs to:
- Support multiple exchanges (Binance, Bybit, etc.)
- Enable testing with mock/paper trading adapters
- Isolate exchange-specific quirks from core logic
- Handle WebSocket and REST API differences

## Decision

Use the Adapter pattern with a stable interface that hides exchange-specific implementation details.

**Note:** The current bot uses an on-chain protocol adapter (GMX; see [ADR-0019](0019-on-chain-perps-pivot.md), [ADR-0020](0020-contract-interaction-patterns.md)). This ADR describes the **CEX exchange adapter** pattern for when multiple exchanges or paper trading are supported.

### 1. Adapter Interface

Define a single adapter port that covers **market data** (e.g. tickers, funding), **trading** (place/cancel orders), **account state** (balances, positions, open orders, fills), and **connection lifecycle** (connect, disconnect, isConnected). Exact method names and signatures are implementation-defined and may differ for CEX vs on-chain. See adapter or protocol code for the current contract.

### 2. File Structure

Adapters live in a dedicated area (e.g. `adapters/` for CEX or `lib/chain/protocols/` for on-chain): per-exchange or per-protocol folders, shared types, and a factory. See repo layout for current structure.

### 3. Factory Pattern

Use a factory (e.g. by exchange or protocol name) to obtain the adapter. See source for current factory.

### 4. Normalization with Valibot

Validate at the boundary with Valibot and map exchange/protocol responses to domain types. Per-exchange or per-protocol schemas and normalizers are implementation-defined. See adapter or protocol code.

### 5. Error Handling

Use a dedicated error type (e.g. code, exchange/protocol, cause) for adapter failures. See adapter or `lib/chain/errors/` for current shape.

### 6. WebSocket + REST Strategy

- **Prefer WS** for real-time ticker/order updates
- **Use REST** as authoritative fallback for reconciliation
- Track connection state and staleness timestamps

### 7. Paper Trading Adapter (Delegating Pattern)

The paper adapter uses a **delegating pattern**: it wraps a real adapter for market data reads and simulates execution locally. This avoids duplicating market data fetching and ensures paper trades fill against real prices. See paper adapter implementation in source.

The market data source is pluggable, supporting three modes:
- **Live paper trading**: `marketDataSource` = real Coinbase adapter
- **Backtesting**: `marketDataSource` = ReplayAdapter serving historical data (see [ADR-0016](0016-backtesting-simulation.md))
- **Unit testing**: `marketDataSource` = mock adapter with `vi.fn()` stubs

### 8. Official SDK Usage

When official SDKs are available (e.g., Coinbase, Binance), prefer using them over custom implementations:

- **Authentication**: SDKs handle complex auth (ES256 JWT, HMAC-SHA256) correctly
- **Maintenance**: SDK updates track API changes, reducing drift risk
- **Classes allowed**: Third-party SDK classes are acceptable per CODE_GUIDELINES.md (type casts allowed for untyped 3rd party libraries)

Wrap SDKs with factory functions to: (1) integrate with rate limiting (e.g. `createRequestPolicy`), (2) add Valibot validation at boundaries, (3) normalize to domain types. See adapter code for examples when CEX adapters are present.

## Consequences

### Positive
- Exchange logic isolated from core strategy/risk engines
- Easy to add new exchanges without changing core code
- Testable with mock/paper adapters
- Consistent interface regardless of exchange quirks

### Negative
- Additional abstraction layer
- Need to maintain normalizers for each exchange
- May not expose all exchange-specific features

### Risks
- **API changes**: Mitigated by Valibot validation catching unexpected responses
- **Rate limiting**: Each adapter must implement rate limiting for its exchange

## References
- [ADR-0001: Bot Architecture](0001-bot-architecture.md) for how adapters fit in the system
- Binance API Documentation
- Bybit API Documentation
