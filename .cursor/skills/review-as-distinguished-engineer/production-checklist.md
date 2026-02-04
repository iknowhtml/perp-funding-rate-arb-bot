# Production Readiness Checklist

Comprehensive checklist for evaluating Node.js code production readiness.

## Error Handling

### Must Have

- [ ] **All async operations have error handling**
  ```typescript
  // ❌ Bad - unhandled rejection
  fetchData().then(process);
  
  // ✅ Good - explicit error handling
  fetchData().then(process).catch(handleError);
  // or
  try { await fetchData(); } catch (e) { handleError(e); }
  ```

- [ ] **Custom error classes with context**
  ```typescript
  export class ExchangeApiError extends Error {
    constructor(
      message: string,
      public readonly code: string,
      public readonly statusCode: number,
      public readonly cause?: unknown,
    ) {
      super(message, { cause });
      this.name = "ExchangeApiError";
    }
  }
  ```

- [ ] **Retryable vs non-retryable errors distinguished**
- [ ] **Error wrapping preserves original cause**
- [ ] **No swallowed errors** (empty catch blocks)

### Circuit Breaker Requirements

- [ ] Circuit breaker on all external API calls
- [ ] Configurable failure threshold
- [ ] Half-open state with gradual recovery
- [ ] Circuit state exposed via metrics

## Observability

### Logging

- [ ] **Structured logging** (JSON format)
  ```typescript
  logger.info("Order placed", {
    orderId: order.id,
    exchange: "binance",
    symbol: "BTC-USDT",
    side: order.side,
    quantity: order.quantity,
  });
  ```

- [ ] **Log levels used appropriately**
  - `error`: Failures requiring attention
  - `warn`: Unexpected but handled situations
  - `info`: Important business events
  - `debug`: Diagnostic information

- [ ] **Request/correlation IDs** for tracing
- [ ] **No sensitive data in logs** (API keys, passwords)
- [ ] **Log rotation/size limits** configured

### Metrics

- [ ] **Counter metrics** for operations
  - Requests sent/received
  - Errors by type
  - Rate limit hits

- [ ] **Histogram metrics** for latency
  - API response times
  - Processing duration

- [ ] **Gauge metrics** for state
  - Connection status
  - Queue depth
  - Circuit breaker state

### Health Checks

- [ ] **Liveness probe** - is the process alive?
- [ ] **Readiness probe** - can it serve traffic?
- [ ] **Dependency health** - are downstream services available?

## Security

### Input Validation

- [ ] **All external input validated** (Valibot/Zod)
- [ ] **Type coercion explicit** (no implicit conversions)
- [ ] **SQL injection prevention** (parameterized queries)
- [ ] **No eval/Function constructor** with user input

### Secrets Management

- [ ] **No secrets in code** or config files
- [ ] **Environment variables** for secrets
- [ ] **Secrets not logged**
- [ ] **API keys rotatable** without code change

### Authentication & Authorization

- [ ] **API keys validated** on every request
- [ ] **Rate limiting** per API key
- [ ] **Principle of least privilege**

## Performance

### Memory Management

- [ ] **No memory leaks**
  - Event listeners removed
  - Timers cleared
  - Connections closed

- [ ] **Bounded data structures**
  - Max queue sizes
  - Cache eviction policies
  - Buffer limits

### Event Loop Health

- [ ] **No blocking operations** on event loop
  ```typescript
  // ❌ Bad - blocks event loop
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512');
  
  // ✅ Good - async
  const hash = await crypto.pbkdf2(password, salt, 100000, 64, 'sha512');
  ```

- [ ] **CPU-intensive work** offloaded (worker threads)
- [ ] **Streams used** for large data

### Connection Management

- [ ] **Connection pooling** for databases
- [ ] **WebSocket reconnection** with backoff
- [ ] **HTTP keep-alive** configured
- [ ] **Timeouts** on all external calls

## Reliability

### Graceful Shutdown

- [ ] **SIGTERM/SIGINT handling**
  ```typescript
  process.on("SIGTERM", async () => {
    logger.info("Shutting down gracefully");
    await server.close();
    await db.close();
    process.exit(0);
  });
  ```

- [ ] **In-flight requests completed** before exit
- [ ] **Connections drained** properly
- [ ] **Shutdown timeout** to prevent hanging

### Idempotency

- [ ] **Retry-safe operations** where possible
- [ ] **Idempotency keys** for critical operations
- [ ] **Duplicate detection** mechanisms

### Timeouts

- [ ] **All external calls have timeouts**
  ```typescript
  const response = await fetch(url, {
    signal: AbortSignal.timeout(5000), // 5s timeout
  });
  ```

- [ ] **Reasonable timeout values** (not too long)
- [ ] **Timeout errors distinguishable**

## Trading-Specific Requirements

### Financial Precision

- [ ] **BigInt for all monetary values**
- [ ] **Unit suffixes on variable names** (`Cents`, `Bps`, `Sats`)
- [ ] **No floating-point arithmetic** for money
- [ ] **Rounding rules explicit**

### Order Management

- [ ] **Order state machine** with valid transitions
- [ ] **Reconciliation** between local and exchange state
- [ ] **Position tracking** accurate
- [ ] **PnL calculation** verified

### Risk Controls

- [ ] **Max position size** enforced
- [ ] **Loss limits** implemented
- [ ] **Kill switch** available
- [ ] **Pre-trade validation**

## Deployment Readiness

### Configuration

- [ ] **Environment-specific config** (dev/staging/prod)
- [ ] **Feature flags** for gradual rollout
- [ ] **Config validation** on startup

### Containerization (if applicable)

- [ ] **Non-root user** in container
- [ ] **Health check** in Dockerfile
- [ ] **Minimal base image**
- [ ] **Multi-stage build** for smaller images

### Monitoring Alerts

- [ ] **Error rate alerts**
- [ ] **Latency alerts** (p99 > threshold)
- [ ] **Circuit breaker open alerts**
- [ ] **Business metric alerts** (e.g., failed orders)

## Quick Assessment Matrix

| Area | Status | Blocking? |
|------|--------|-----------|
| Error Handling | ✅/⚠️/❌ | Yes |
| Logging | ✅/⚠️/❌ | Yes |
| Metrics | ✅/⚠️/❌ | No |
| Input Validation | ✅/⚠️/❌ | Yes |
| Secrets | ✅/⚠️/❌ | Yes |
| Memory Leaks | ✅/⚠️/❌ | Yes |
| Timeouts | ✅/⚠️/❌ | Yes |
| Graceful Shutdown | ✅/⚠️/❌ | No |
| Financial Precision | ✅/⚠️/❌ | Yes |

**Legend:**
- ✅ Production ready
- ⚠️ Needs improvement (non-blocking)
- ❌ Blocking issue (must fix)
