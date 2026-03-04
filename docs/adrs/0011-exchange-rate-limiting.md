# ADR 0011: Exchange Rate Limiting & API Safety

- **Status:** Accepted
- **Date:** 2026-02-04
- **Updated:** 2026-03-04
- **Owners:** -
- **Related:**
  - [ADR-0001: Bot Architecture](0001-bot-architecture.md)
  - [ADR-0010: Exchange Adapters](0010-exchange-adapters.md)
  - [ADR-0008: Monitoring & Observability](0008-monitoring-observability.md)

## Context

Exchange APIs enforce **rate limits** to prevent abuse and ensure fair access. Violating rate limits results in:

- **HTTP 429 (Too Many Requests)** errors
- **Temporary IP bans** (minutes to hours)
- **Permanent API key revocation** (worst case)

For a trading bot, rate limit violations are catastrophic:
- **Cannot place orders** during critical moments
- **Cannot fetch account state** for reconciliation
- **Cannot monitor positions** for risk management
- **May miss exit signals** if API is blocked

Different exchanges use different rate limiting strategies:
- **Binance**: Request weight system (different endpoints have different weights)
- **Bybit**: Requests per second (RPS) limits per endpoint category
- **Coinbase**: Requests per second with burst allowance

## Decision

**Implement a comprehensive rate limiting system** that:
1. Tracks request rates per exchange endpoint using token bucket algorithm
2. Uses a unified **request-policy wrapper** that combines rate limiting, circuit breaker, retry logic, and timeouts
3. Handles 429 errors with exponential backoff (respecting `Retry-After` headers)
4. Uses **cockatiel library** for circuit breaker (not rolling our own)
5. Logs all rate limit events for monitoring

### Unified Request Policy Wrapper

All REST API calls go through a single `request-policy.ts` wrapper that enforces:

**Order of operations:**
1. Acquire tokens from appropriate bucket (global + endpoint-specific)
2. Enforce request timeout (timeouts count as failures)
3. Execute inside circuit breaker
4. Apply retry/backoff for retryable errors (429/5xx/timeouts/network)
5. Persist metrics/events (wait time, retries, breaker state)

**Key rules:**
- Do not retry non-retryable errors (401/403, validation, insufficient balance, order rejected)
- Respect `Retry-After` and exchange rate-limit headers when present (override computed backoff)
- Support weighted endpoints (Binance) via `acquire(weight)`

### Rate Limit Strategy: Token Bucket

Use **token bucket algorithm** for rate limiting: bucket capacity (max burst), refill rate per time window, and per-endpoint (or per-scope) tracking. Config supports both weight-based (Binance-style) and request-count (Bybit-style) limits plus burst allowance. See source for `RateLimitConfig` and endpoint classification.

### Endpoint Classification

Different endpoints have different rate limits and priorities:

| Endpoint Type | Priority | Weight | Limit |
|--------------|----------|--------|-------|
| **Trading (Place Order)** | Critical | 1 | 10 req/min |
| **Trading (Cancel Order)** | Critical | 1 | 10 req/min |
| **Account (Balances)** | High | 5 | 1200 req/min |
| **Account (Positions)** | High | 5 | 50 req/min |
| **Market Data (Ticker)** | Low | 1 | 1200 req/min |
| **Market Data (Funding)** | Medium | 1 | 60 req/min |

### Token Bucket and Rate Limiter

Token bucket: functional pattern with closure; namespaced buckets (e.g. `public`, `private`, `orders`, `account`). Rate limiter exposes `acquire`, `waitTime`, `reset`, `penalize`. Errors: exchange API errors (e.g. `ExchangeError` with code/endpoint/headers) and `RateLimitError` for limit violations. Bucket selection by endpoint (trading vs account vs market) is in source. See `src/lib/rate-limiter/` for token bucket, rate limiter interface, and error types.

### Handling HTTP 429 Errors and Retry Policy

Exponential backoff with jitter is implemented in `src/lib/rate-limiter/backoff.ts` (config: initial/max delay, multiplier, jitter factor). See source for `BackoffConfig` and `calculateBackoffMs`.

**Retry Policy:**
- **Retryable**: 429, 5xx, network errors, timeouts
- **Not retryable**: 401/403, bad params, insufficient balance, order rejections
- **If `Retry-After` header exists**, use it instead of computed backoff
- **If exchange rate-limit headers present**, respect them (override computed backoff)

When a 429 error is received:
1. Extract `Retry-After` header (if present) - use it instead of computed backoff
2. Use exponential backoff with jitter (if `Retry-After` not present)
3. Update rate limit state (reduce bucket capacity temporarily)
4. Log rate limit violation (alert if frequent)

### Circuit Breaker Pattern

**Use the `cockatiel` library** for circuit breaker implementation. Do not roll our own - circuit breakers have many edge cases that are difficult to get right.

**Requirements:**
- Timeouts count as failures
- HALF_OPEN failure immediately returns to OPEN
- Require N consecutive successes in HALF_OPEN before closing
- Prefer rate-based thresholds where possible (avoid opening on a tiny number of failures amidst high volume)
- Provide optional fallback behavior when OPEN (e.g., fail fast with a typed error)

Circuit breaker is a thin wrapper around **cockatiel** in `src/lib/rate-limiter/circuit-breaker.ts` (config: failure threshold, success threshold, reset timeout). See source for `CircuitBreakerConfig` and `CircuitBreaker` interface.


### Exchange-Specific Rate Limiters

Represent limits as layered buckets: a global REST bucket + optional per-endpoint buckets (weights) and separate buckets per scope (public/private/orders). WebSocket limits are handled by connection-level pacing, not the REST request policy.

Exchange-specific rate limit configs (Coinbase, Binance, Bybit — rest/websocket tokens and refill rates) and per-exchange rate limiter factories (Binance weight-based, Bybit RPS-based) live in source. Each adapter uses the appropriate limiter. See `src/lib/rate-limiter/` for exchanges and adapter integration.

### Integration with Exchange Adapters

All REST calls go through the unified **request-policy** wrapper: acquire tokens, timeout, circuit breaker, retry/backoff, then execute. Adapters call `requestPolicy.execute(fn, { endpoint, weight?, timeoutMs?, retryable? })`. See `src/lib/rate-limiter/request-policy.ts` and adapter implementations.

**File structure:**

```
src/lib/rate-limiter/
├── token-bucket.ts        # Token bucket implementation
├── token-bucket.test.ts   # Token bucket tests
├── circuit-breaker.ts     # Circuit breaker wrapper (cockatiel)
├── circuit-breaker.test.ts
├── backoff.ts             # Exponential backoff utilities
├── backoff.test.ts
├── exchanges.ts           # Exchange-specific configurations
├── request-policy.ts      # Unified wrapper for rate limit + breaker + retries
├── request-policy.test.ts # Request policy tests (retryability, header handling, breaker integration)
└── index.ts               # Re-exports
```

### Monitoring & Alerting

Track: 429 hits, wait time (histogram), bucket penalties, circuit breaker trips. See monitoring module and ADR-0008 for metric shapes.

Alert on:
- **Frequent 429 errors** (> 5 in 5 minutes)
- **Circuit breaker opens** (critical)
- **Rate limit wait time** > 1 second (performance degradation)

## Consequences

### Positive

1. **API Compliance**: Never violates exchange rate limits
2. **Resilience**: Handles 429 errors gracefully with backoff
3. **Performance**: Prevents unnecessary waits by tracking limits proactively
4. **Observability**: All rate limit events logged and metered

### Negative

1. **Latency**: May add small delays when approaching rate limits
2. **Complexity**: Exchange-specific implementations required
3. **Configuration**: Requires tuning limits for each exchange

### Risks

| Risk | Mitigation |
|------|------------|
| Rate limit config incorrect | Start conservative, monitor and adjust |
| Exchange changes limits | Version rate limit configs, alert on 429s |
| Circuit breaker false positives | Tune thresholds based on historical data |
| Token bucket drift | Use precise timestamps, reconcile periodically |

## Future Considerations

1. **Dynamic Rate Limits**: Adjust limits based on exchange announcements
2. **IP Rotation**: Use multiple IPs for higher rate limits (if supported)
3. **Priority Queuing**: Prioritize critical requests (orders) over data requests
4. **Rate Limit Prediction**: Predict when limits will be hit and throttle proactively

## Dependencies

**Add:**
- `cockatiel` - Circuit breaker and resilience patterns library

**Existing:**
- `p-queue` - Remains useful for serializing higher-level work, but rate limiting is enforced in `request-policy.ts`

## References

- [ADR-0001: Bot Architecture](0001-bot-architecture.md) — REST polling intervals
- [ADR-0010: Exchange Adapters](0010-exchange-adapters.md) — Adapter interface
- [ADR-0008: Monitoring & Observability](0008-monitoring-observability.md) — Metrics and alerting
- [Binance API Rate Limits](https://binance-docs.github.io/apidocs/spot/en/#limits)
- [Bybit API Rate Limits](https://bybit-exchange.github.io/docs/v5/rate-limit)
- [Coinbase Rate Limits](https://docs.cdp.coinbase.com/advanced-trade/docs/rest-api-rate-limits)
- [Cockatiel Library](https://github.com/connor4312/cockatiel)
