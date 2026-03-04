# ADR 0016: Backtesting & Simulation Framework

- **Status:** Accepted
- **Date:** 2026-02-04
- **Updated:** 2026-03-04
- **Owners:** -
- **Related:**
  - [ADR-0001: Bot Architecture](0001-bot-architecture.md)
  - [ADR-0010: Exchange Adapters](0010-exchange-adapters.md)
  - [ADR-0014: Funding Rate Prediction & Strategy](0014-funding-rate-strategy.md)
  - [ADR-0015: Execution Safety & Slippage Modeling](0015-execution-safety-slippage.md)

## Context

Before deploying capital, we must **validate the strategy** against historical data:

- **Backtesting** proves the strategy works in past market conditions
- **Paper trading** validates execution logic without real money
- **Simulation** tests edge cases and failure modes
- **Performance metrics** (Sharpe ratio, max drawdown) quantify risk-adjusted returns

Without proper validation:
- Strategy may be unprofitable (negative expected value)
- Execution logic may have bugs (slippage, order handling)
- Risk management may be insufficient (drawdowns exceed limits)
- Edge cases may cause catastrophic failures

## Decision

**Implement a comprehensive backtesting and simulation framework** that:
1. Ingests historical funding rate and price data
2. Simulates the bot's decision-making process
3. Tracks performance metrics (PnL, Sharpe, drawdown)
4. Validates execution logic with paper trading adapter
5. Tests edge cases and failure scenarios

### Historical Data Schema

Postgres tables: `historical_funding_rates` (exchange, symbol, funding_rate_bps, mark/index price, snapshot_at), `historical_prices` (exchange, symbol, price_quote, volume_24h, snapshot_at), `historical_order_books` (bids/asks JSONB, snapshot_at). Indexes on (exchange, symbol, snapshot_at DESC). See repo migrations/schema for current DDL.

### Backtesting Engine Architecture

BacktestConfig: start/end date, initial capital, strategy/risk/slippage config. BacktestResult: initial/final capital, total PnL, return bps, Sharpe ratio, max drawdown bps, win rate, total trades, average hold time, trades array, daily PnL. BacktestTrade: entry/exit time and price, size, PnL, return bps, funding received, slippage cost, reason. See source for interfaces.

### Type Definitions

HistoricalDataLoader: loadFundingRates, loadPrices, loadOrderBook. PriceSnapshot, BacktestState (capital, position, fundingHistory, prices), BacktestPosition (entry time/prices, funding rate). See source for full types (BacktestPosition, BacktestEvent, etc.).

### Helper Functions

Margin calculation (sizeQuote, leverageBps), mid price from order book, and a factory for HistoricalDataLoader that queries the Postgres tables. See source.

### Event-Driven Backtester (using ReplayAdapter + PaperAdapter)

The backtesting engine is a thin orchestration loop. It does **not** implement its own execution simulation -- instead it delegates to the `PaperAdapter` (which handles fills, slippage, balance/position tracking) with a `ReplayAdapter` as the market data source.

This ensures the same execution code path is tested in both paper trading and backtesting.

Engine: create ReplayAdapter from historical data, create PaperAdapter with replay as market data source and initial balances/slippage config, connect, generate timestamps (evaluation interval), then for each timestamp advance replay, run strategy evaluation, execute via paper adapter, process funding; close open positions at end and compute metrics from paper state. See source for `createBacktestEngine` and run loop.

**Key design benefits:**
- **No duplicate simulation logic**: Position tracking, balance management, fill simulation, and slippage are all handled by the paper adapter -- single source of truth
- **Same code path**: The strategy evaluation and execution path is identical between live paper trading and backtesting
- **Testable**: Both the ReplayAdapter and PaperAdapter are independently unit-testable with mocks

### Paper Trading Adapter (Delegating Pattern)

The paper adapter uses a **delegating pattern** (see [ADR-0010](0010-exchange-adapters.md) Section 7): it wraps a real `ExchangeAdapter` for market data and simulates execution locally. The `marketDataSource` slot is pluggable:

| Mode | `marketDataSource` | Data source |
|------|-------------------|-------------|
| Live paper trading | `CoinbaseAdapter` | Real-time exchange API |
| Backtesting | `ReplayAdapter` | Historical data from Postgres |
| Unit testing | Mock adapter | Controlled test data |

Paper adapter: in-memory state, delegates market data to source; createOrder simulates fills against source prices; balances and positions tracked locally; processFunding uses source rates. See source for `createPaperAdapter`.

### ReplayAdapter (for Backtesting)

The `ReplayAdapter` implements the adapter interface and replays historical data from Postgres. Config: dataLoader, exchange, symbol, start/end date. Pre-load data; tick() advances replay clock; getTicker/getFundingRate/getOrderBook return closest snapshot at or before current replay time. See source for `createReplayAdapter`. Connection methods are no-ops; createOrder throws (use PaperAdapter for execution).

### Performance Metrics

Metrics: returns (total and annualized bps), risk (Sharpe, Sortino, max drawdown, volatility), trade stats (total trades, win rate, average win/loss bps, profit factor), execution quality (average slippage bps, average hold time). See source for `PerformanceMetrics` and `calculateResults`.

### Backtesting CLI

CLI/command builds BacktestConfig from options (dates, capital, config paths), creates data loader and engine, runs backtest, logs results, optionally exports to CSV. See repo for `backtestCommand` and `exportResultsToCSV`.

## Consequences

### Positive

1. **Strategy Validation**: Proves strategy works before risking capital
2. **Parameter Optimization**: Tune strategy parameters based on historical performance
3. **Risk Assessment**: Quantifies max drawdown and volatility
4. **Bug Detection**: Catches execution logic errors before deployment

### Negative

1. **Data Requirements**: Requires historical data ingestion and storage
2. **Look-Ahead Bias**: Must ensure backtester doesn't use future data
3. **Overfitting Risk**: Optimizing parameters too much can reduce live performance
4. **Execution Simulation**: Paper trading may not perfectly simulate real exchange behavior

### Risks

| Risk | Mitigation |
|------|------------|
| Look-ahead bias | Use event-driven simulation, process events in chronological order |
| Overfitting | Use out-of-sample testing, validate on multiple time periods |
| Execution simulation inaccurate | Compare paper trading results with small live capital deployment |
| Data quality issues | Validate historical data, handle missing data gracefully |

## Architecture Summary

The simulation framework uses three composable components:

```
┌─────────────────────────────────────────────────────┐
│                Backtesting Engine                    │
│  (thin orchestration loop + metrics calculation)     │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │             PaperAdapter                       │  │
│  │  (execution simulation, balance/position mgmt) │  │
│  │                                               │  │
│  │  marketDataSource:                            │  │
│  │    ┌────────────────────────────────────────┐ │  │
│  │    │          ReplayAdapter                  │ │  │
│  │    │  (serves historical data from Postgres) │ │  │
│  │    └────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

For live paper trading, `ReplayAdapter` is replaced with the real `CoinbaseAdapter`. The `PaperAdapter` and strategy evaluation code remain identical.

## Future Considerations

1. **Walk-Forward Analysis**: Optimize parameters on rolling windows
2. **Monte Carlo Simulation**: Test strategy robustness with random market scenarios
3. **Multi-Exchange Backtesting**: Test cross-exchange arbitrage strategies
4. **Machine Learning**: Use ML to optimize strategy parameters

## References

- [ADR-0001: Bot Architecture](0001-bot-architecture.md) — Evaluation loop pattern
- [ADR-0010: Exchange Adapters](0010-exchange-adapters.md) — Paper trading adapter (delegating pattern)
- [ADR-0014: Funding Rate Prediction & Strategy](0014-funding-rate-strategy.md) — Strategy logic
- [ADR-0015: Execution Safety & Slippage Modeling](0015-execution-safety-slippage.md) — Slippage estimation
