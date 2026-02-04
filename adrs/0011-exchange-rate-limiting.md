# ADR 0011: Exchange Rate Limiting & API Safety

- **Status:** Accepted
- **Date:** 2026-02-04
- **Updated:** 2026-02-04
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

Use **token bucket algorithm** for rate limiting:

- **Bucket capacity**: Maximum burst requests
- **Refill rate**: Tokens added per time window
- **Per-endpoint tracking**: Different limits for different endpoint types

```typescript
export interface RateLimitConfig {
  // Request weight limits (Binance-style)
  weightLimit: number;        // Max weight per window
  weightWindowMs: number;     // Time window (e.g., 60000ms = 1 minute)
  
  // Request count limits (Bybit-style)
  requestLimit: number;        // Max requests per window
  requestWindowMs: number;    // Time window
  
  // Burst allowance
  burstAllowance: number;     // Extra requests allowed in burst
}
```

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

### Token Bucket Implementation

Use functional pattern with closure for state management. Prefer **namespaced buckets** (e.g., `public`, `private`, `orders`, `account`) rather than one global bucket.

```typescript
export interface TokenBucketConfig {
  maxTokens: number;        // Maximum bucket capacity
  refillRatePerSecond: number; // Tokens added per second (supports weights via consume(n))
  initialTokens?: number;   // Starting tokens (default: maxTokens)
}

export interface TokenBucket {
  tryConsume(tokens?: number): boolean;
  consume(tokens?: number): Promise<void>; // Waits if needed, returns/awaits required delay
  getAvailableTokens(): number;
  reset(): void;
}

export interface TokenBucketState {
  tokens: number;
  capacity: number;
  refillRate: number; // tokens per second
  refillIntervalMs: number;
  lastRefill: number;
}

export const createTokenBucket = (
  capacity: number,
  refillRate: number, // tokens per second
  refillIntervalMs: number = 1000,
): TokenBucket => {
  let state: TokenBucketState = {
    tokens: capacity,
    capacity,
    refillRate,
    refillIntervalMs,
    lastRefill: Date.now(),
  };

  const refill = (): void => {
    const now = Date.now();
    const elapsed = now - state.lastRefill;
    const tokensToAdd = (elapsed / state.refillIntervalMs) * state.refillRate;

    state = {
      ...state,
      tokens: Math.min(state.capacity, state.tokens + tokensToAdd),
      lastRefill: now,
    };
  };

  return {
    consume: (tokens: number): boolean => {
      refill();

      if (state.tokens >= tokens) {
        state = { ...state, tokens: state.tokens - tokens };
        return true;
      }

      return false;
    },

    getWaitTime: (tokens: number): number => {
      refill();

      if (state.tokens >= tokens) {
        return 0;
      }

      const tokensNeeded = tokens - state.tokens;
      return Math.ceil((tokensNeeded / state.refillRate) * state.refillIntervalMs);
    },

    penalize: (multiplier: number): void => {
      // Reduce capacity temporarily
      state = {
        ...state,
        capacity: Math.floor(state.capacity * multiplier),
        tokens: Math.min(Math.floor(state.tokens * multiplier), Math.floor(state.capacity * multiplier)),
      };
    },

    reset: (): void => {
      state = {
        tokens: state.capacity,
        capacity: state.capacity,
        refillRate: state.refillRate,
        refillIntervalMs: state.refillIntervalMs,
        lastRefill: Date.now(),
      };
    },
  };
};
```

### Rate Limiter Interface

```typescript
export interface RateLimiter {
  acquire(endpoint: string, weight?: number): Promise<void>;
  waitTime(endpoint: string, weight?: number): number;
  reset(endpoint: string): void;
  penalize(endpoint: string, multiplier: number): void;
}
```

### Error Types

```typescript
// Error class for exchange API errors (defined in ADR-0010)
export interface ExchangeError extends Error {
  code: string;
  endpoint?: string;
  headers?: Record<string, string>;
  retryCount?: number;
}

// Error for rate limit violations
export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly endpoint: string,
  ) {
    super(message);
    this.name = "RateLimitError";
  }
}
```

### Helper Functions

```typescript
// Logger interface (defined in logging module)
export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

// Utility function for delays
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Get bucket for endpoint type
export const getBucketForEndpoint = (endpoint: string): string => {
  if (endpoint.includes("/order") || endpoint.includes("/trade")) {
    return "trading";
  }
  if (endpoint.includes("/account") || endpoint.includes("/balance") || endpoint.includes("/position")) {
    return "account";
  }
  return "market";
};
```

### Handling HTTP 429 Errors and Retry Policy

Create `src/lib/rate-limiter/backoff.ts` for exponential backoff with jitter:

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
  const delay = Math.min(
    config.initialDelayMs * Math.pow(config.multiplier, attempt),
    config.maxDelayMs,
  );
  const jitter = delay * config.jitterFactor * Math.random();
  return Math.floor(delay + jitter);
};
```

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

Create `src/lib/rate-limiter/circuit-breaker.ts` as a thin wrapper around **cockatiel**:

```typescript
import { circuitBreaker, handleAll, ConsecutiveBreaker } from "cockatiel";

export interface CircuitBreakerConfig {
  failureThreshold: number;     // Failures before opening
  successThreshold: number;     // Successes to close from half-open
  resetTimeoutMs: number;       // Time before trying half-open
}

export interface CircuitBreaker {
  execute<T>(fn: () => Promise<T>): Promise<T>;
  getState(): "CLOSED" | "OPEN" | "HALF_OPEN";
  reset(): void;
}
```


### Exchange-Specific Rate Limiters

Represent limits as layered buckets: a global REST bucket + optional per-endpoint buckets (weights) and separate buckets per scope (public/private/orders). WebSocket limits are handled by connection-level pacing, not the REST request policy.

**Exchange Rate Limit Configurations:**

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

Each exchange adapter implements rate limiting according to its API:

#### Binance Rate Limiter

```typescript
export const createBinanceRateLimiter = (): RateLimiter => {
  // Binance uses request weight system
  // - 1200 weight per minute (IP-based)
  // - 10 weight per order endpoint
  // - 5 weight per account endpoint
  // - 1 weight per market data endpoint

  const buckets = new Map<string, TokenBucket>([
    ["trading", createTokenBucket(1200, 20, 60000)], // 1200 weight per minute
    ["account", createTokenBucket(1200, 20, 60000)],
    ["market", createTokenBucket(1200, 20, 60000)],
  ]);

  return {
    acquire: async (endpoint: string, weight = 1): Promise<void> => {
      const bucketType = getBucketForEndpoint(endpoint);
      const bucket = buckets.get(bucketType);
      if (!bucket) {
        throw new Error(`Unknown bucket type: ${bucketType}`);
      }

      const waitTime = bucket.getWaitTime(weight);

      if (waitTime > 0) {
        await sleep(waitTime);
      }

      if (!bucket.consume(weight)) {
        throw new RateLimitError("Rate limit exceeded", endpoint);
      }
    },

    waitTime: (endpoint: string, weight = 1): number => {
      const bucketType = getBucketForEndpoint(endpoint);
      const bucket = buckets.get(bucketType);
      if (!bucket) {
        return 0;
      }
      return bucket.getWaitTime(weight);
    },

    reset: (endpoint: string): void => {
      const bucketType = getBucketForEndpoint(endpoint);
      buckets.set(bucketType, createTokenBucket(1200, 20, 60000));
    },

    penalize: (endpoint: string, multiplier: number): void => {
      const bucketType = getBucketForEndpoint(endpoint);
      const bucket = buckets.get(bucketType);
      if (bucket) {
        bucket.penalize(multiplier);
      }
    },
  };
};
```

#### Bybit Rate Limiter

```typescript
export const createBybitRateLimiter = (): RateLimiter => {
  // Bybit uses requests per second (RPS)
  // - 10 RPS for trading endpoints
  // - 50 RPS for account endpoints
  // - 120 RPS for market data endpoints

  const buckets = new Map<string, TokenBucket>([
    ["trading", createTokenBucket(10, 10, 1000)], // 10 requests per second
    ["account", createTokenBucket(50, 50, 1000)], // 50 requests per second
    ["market", createTokenBucket(120, 120, 1000)], // 120 requests per second
  ]);

  return {
    acquire: async (endpoint: string, weight = 1): Promise<void> => {
      const bucketType = getBucketForEndpoint(endpoint);
      const bucket = buckets.get(bucketType);
      if (!bucket) {
        throw new Error(`Unknown bucket type: ${bucketType}`);
      }

      const waitTime = bucket.getWaitTime(weight);

      if (waitTime > 0) {
        await sleep(waitTime);
      }

      if (!bucket.consume(weight)) {
        throw new RateLimitError("Rate limit exceeded", endpoint);
      }
    },

    waitTime: (endpoint: string, weight = 1): number => {
      const bucketType = getBucketForEndpoint(endpoint);
      const bucket = buckets.get(bucketType);
      if (!bucket) {
        return 0;
      }
      return bucket.getWaitTime(weight);
    },

    reset: (endpoint: string): void => {
      const bucketType = getBucketForEndpoint(endpoint);
      // Reset to original capacity based on endpoint type
      const capacities: Record<string, [number, number, number]> = {
        trading: [10, 10, 1000],
        account: [50, 50, 1000],
        market: [120, 120, 1000],
      };
      const [capacity, refillRate, interval] = capacities[bucketType] ?? [120, 120, 1000];
      buckets.set(bucketType, createTokenBucket(capacity, refillRate, interval));
    },

    penalize: (endpoint: string, multiplier: number): void => {
      const bucketType = getBucketForEndpoint(endpoint);
      const bucket = buckets.get(bucketType);
      if (bucket) {
        bucket.penalize(multiplier);
      }
    },
  };
};
```

### Integration with Exchange Adapters

**All REST calls go through the unified `request-policy.ts` wrapper.** The request policy handles rate limiting, circuit breaker, timeouts, and retries in a single place.

```typescript
// src/lib/rate-limiter/request-policy.ts

export interface RequestPolicy {
  execute<T>(
    fn: () => Promise<T>,
    options: {
      endpoint: string;
      weight?: number;
      timeoutMs?: number;
      retryable?: (error: unknown) => boolean;
    },
  ): Promise<T>;
}

// Usage in adapter:
export const createBinanceAdapter = (config: BinanceConfig): ExchangeAdapter => {
  const requestPolicy = createRequestPolicy({
    rateLimiter: createBinanceRateLimiter(),
    circuitBreaker: createCircuitBreaker(),
  });

  return {
    placeSpotOrder: async (params) => {
      return requestPolicy.execute(
        () => binanceClient.placeOrder(params),
        {
          endpoint: "/api/v3/order",
          weight: 10, // Binance weight for order endpoint
          timeoutMs: 5000,
        },
      );
    },

    getBalances: async () => {
      return requestPolicy.execute(
        () => binanceClient.getBalances(),
        {
          endpoint: "/api/v3/account",
          weight: 5, // Binance weight for account endpoint
          timeoutMs: 5000,
        },
      );
    },
    // ... other methods
  };
};
```

**File Structure:**

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

Track rate limit metrics:

```typescript
// Metrics to track
export interface RateLimitMetrics {
  rateLimitHits: Counter;           // Total 429 errors
  rateLimitWaitTime: Histogram;     // Time spent waiting for rate limits
  rateLimitPenalties: Counter;      // Bucket capacity reductions
  circuitBreakerTrips: Counter;     // Circuit breaker opens
}
```

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
