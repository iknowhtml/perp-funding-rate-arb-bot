---
name: Rate Limiting
overview: Implement token bucket rate limiting with circuit breaker pattern per ADR-0011.
todos:
  - id: token-bucket
    content: Implement token bucket rate limiter
    status: completed
  - id: exchange-limiters
    content: Create exchange-specific rate limiters (Coinbase, Binance, Bybit)
    status: completed
  - id: circuit-breaker
    content: Implement circuit breaker pattern
    status: completed
  - id: error-handling
    content: Handle 429 errors with exponential backoff
    status: completed
  - id: tests
    content: Add unit tests for rate limiting
    status: completed
  - id: lifecycle-management
    content: Move plan to implemented/ directory after completion (update todos, check validation boxes, update roadmap link, move file, delete from active/)
    status: completed
isProject: false
---

> **Note**: This plan is part of Phase 2 (Connectivity) in [MVP Roadmap](../../../active/0001-mvp-roadmap/README.md).

# Rate Limiting

## Overview

Implement robust outbound request controls to prevent 429s and protect execution reliability. We use a token-bucket limiter (custom, exchange-specific weights), exponential backoff (custom), and a library-backed circuit breaker (cockatiel) wrapped behind a single request-policy used by all exchange adapters.

## Tasks

### 0. Request Policy Wrapper (Single Choke Point)

Create `src/lib/rate-limiter/request-policy.ts` to wrap **every** REST call:

Order of operations:
1) Acquire tokens from the appropriate bucket (global + endpoint)
2) Enforce request timeout (timeouts count as failures)
3) Execute inside circuit breaker
4) Apply retry/backoff for retryable errors (429/5xx/timeouts/network)
5) Persist metrics/events (wait time, retries, breaker state)

Key rules:
- Do not retry non-retryable errors (401/403, validation, insufficient balance, order rejected)
- Respect `Retry-After` and exchange rate-limit headers when present (override computed backoff)
- Support weighted endpoints (Binance) via `acquire(weight)`

### 1. Token Bucket Rate Limiter

Create `src/lib/rate-limiter/token-bucket.ts`:

```typescript
export interface TokenBucketConfig {
  maxTokens: number;        // Maximum bucket capacity
  refillRatePerSecond: number; // Tokens added per second (supports weights via consume(n))
  initialTokens?: number;   // Starting tokens (default: maxTokens)
}

export interface TokenBucket {
  tryConsume(tokens?: number): boolean;
  consume(tokens?: number): Promise<void>; // Waits if needed
  getAvailableTokens(): number;
  reset(): void;
}

export const createTokenBucket = (config: TokenBucketConfig): TokenBucket => {
  // Implementation...
};
```

Notes:
- Prefer **namespaced buckets** (e.g., `public`, `private`, `orders`, `account`) rather than one global bucket.
- Implement `consume(tokens)` to return/await the required delay; avoid hidden sleeps outside the policy wrapper.
- Expose lightweight metrics hooks (tokens remaining, computed waitMs) for observability.

### 2. Exchange-Specific Rate Limiters

Represent limits as layered buckets: a global REST bucket + optional per-endpoint buckets (weights) and separate buckets per scope (public/private/orders). WebSocket limits are handled by connection-level pacing, not the REST request policy.

```typescript
// Coinbase Advanced Trade limits
export const COINBASE_RATE_LIMITS = {
  rest: { maxTokens: 10, refillRatePerSecond: 10/1 },      // 10 req/s
  websocket: { maxTokens: 750, refillRatePerSecond: 750/1 }, // 750 msg/s
};

// Binance limits
export const BINANCE_RATE_LIMITS = {
  rest: { maxTokens: 1200, refillRatePerSecond: 1200/60 }, // 1200 req/min
  websocket: { maxTokens: 5, refillRatePerSecond: 5/1 },   // 5 msg/s
};

// Bybit limits
export const BYBIT_RATE_LIMITS = {
  rest: { maxTokens: 120, refillRatePerSecond: 120/5 },    // 120 req/5s
  websocket: { maxTokens: 100, refillRatePerSecond: 100/1 }, // 100 msg/s
};
```

### 3. Circuit Breaker Pattern

Use a library-backed circuit breaker (do **not** roll our own). Create `src/lib/rate-limiter/circuit-breaker.ts` as a thin wrapper around **cockatiel**.

Requirements:
- Timeouts count as failures
- HALF_OPEN failure immediately returns to OPEN
- Require N consecutive successes in HALF_OPEN before closing
- Prefer rate-based thresholds where possible (avoid opening on a tiny number of failures amidst high volume)
- Provide optional fallback behavior when OPEN (e.g., fail fast with a typed error)

Add dependency:
- `pnpm add cockatiel`

### 4. 429 Error Handling

Create `src/lib/rate-limiter/backoff.ts`:

```typescript
export interface BackoffConfig {
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  jitterFactor: number; // 0-1, adds randomness to prevent thundering herd
}

export const DEFAULT_BACKOFF_CONFIG: BackoffConfig = {
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  multiplier: 2,
  jitterFactor: 0.1,
};

export const calculateBackoffMs = (
  attempt: number,
  config: BackoffConfig = DEFAULT_BACKOFF_CONFIG,
): number => {
  // Implementation with jitter...
};
```

Retry policy:
- Retryable: 429, 5xx, network errors, timeouts
- Not retryable: 401/403, bad params, insufficient balance, order rejections
- If `Retry-After` header exists, use it instead of computed backoff

## File Structure

```
src/lib/rate-limiter/
├── token-bucket.ts        # Token bucket implementation
├── token-bucket.test.ts   # Token bucket tests
├── circuit-breaker.ts     # Circuit breaker implementation
├── circuit-breaker.test.ts
├── backoff.ts             # Exponential backoff utilities
├── backoff.test.ts
├── exchanges.ts           # Exchange-specific configurations
├── request-policy.ts      # Unified wrapper for rate limit + breaker + retries
├── request-policy.test.ts # Request policy tests (retryability, header handling, breaker integration)
└── index.ts               # Re-exports
```

## Dependencies

Add:
- `cockatiel` for circuit breaker + timeout composition

Existing:
- `p-queue` (already installed) remains useful for serializing higher-level work, but rate limiting should be enforced in `request-policy.ts`.

## Validation

- [x] All REST calls go through request-policy wrapper
- [x] Retry policy respects Retry-After / rate-limit headers when present
- [x] Circuit breaker correctly handles HALF_OPEN (fail -> OPEN, N successes -> CLOSED)
- [x] Token bucket correctly limits request rate
- [x] Circuit breaker opens after failures and recovers
- [x] Exponential backoff with jitter works correctly
- [x] Exchange-specific limits match documentation
- [x] 429 responses trigger backoff
- [x] Unit tests pass

## References

- [MVP Roadmap](../../../active/0001-mvp-roadmap/README.md)
- [ADR-0011: Exchange Rate Limiting](../../../../../adrs/0011-exchange-rate-limiting.md)
- [Coinbase Rate Limits](https://docs.cdp.coinbase.com/advanced-trade/docs/rest-api-rate-limits)
- [Binance Rate Limits](https://binance-docs.github.io/apidocs/futures/en/#limits)
- [Cockatiel](https://github.com/connor4312/cockatiel)
