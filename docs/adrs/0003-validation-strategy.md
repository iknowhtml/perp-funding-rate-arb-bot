# ADR 0003: Validation Strategy

- **Status:** Accepted
- **Date:** 2026-02-04
- **Updated:** 2026-03-04
- **Owners:** -
- **Related:**
  - [ADR-0031: Bot Architecture (On-Chain)](0031-bot-architecture-on-chain.md)
  - [ADR-0019: On-Chain Perps Pivot](0019-on-chain-perps-pivot.md)
  - [ADR-0020: Contract Interaction Patterns](0020-contract-interaction-patterns.md)

## Context

The bot operates at system boundaries where untrusted data enters the system:

1. **Environment variables** — Database URL, RPC URL, private key, GMX Oracle URL, chain ID, logging
2. **GMX REST API responses** — Markets info (funding, OI, borrow rates), price tickers
3. **RPC / contract reads** — Addresses, position data (Reader contract), balances
4. **Domain configuration** — Strategy and risk parameters (thresholds, limits)
5. **Optional: WebSocket messages** — Real-time feeds when used (validation via message parser)

TypeScript's type system only provides compile-time safety. At runtime, we receive `unknown` data that must be validated before use. Without runtime validation:

- Type casts (`as`) create false safety
- Invalid data propagates silently
- Errors occur far from the source
- Debugging becomes difficult

For a trading bot, invalid data can lead to incorrect decisions and financial loss.

## Decision

We will use **Valibot** for all runtime validation.

### Why Valibot Over Zod

| Criteria | Zod | Valibot |
|----------|-----|---------|
| **Bundle Size** | ~57KB (minified) | ~6KB (tree-shaken) |
| **Performance** | Good | Faster (benchmark-tested) |
| **API Style** | Method chaining | Functional composition |
| **Tree-shaking** | Partial | Full (modular design) |
| **Type Inference** | Excellent | Excellent |
| **Ecosystem** | Larger | Growing |

**Decision:** Valibot's smaller bundle size and better performance make it ideal for a long-running bot where startup time and memory matter less than Zod's larger ecosystem. The functional API also aligns with our functional programming preference.

### Validation Use Cases

All schemas are **manual**. The bot uses Valibot at each boundary; there are no OpenAPI-generated schemas in the current codebase (on-chain GMX REST API and RPC, no CEX adapters).

#### 1. Environment Variables

Validate all environment variables at startup. Fail fast if required values are missing.

**Approach:** A single Valibot schema (e.g. `envSchema`) defines required and optional env vars; use `v.pipe` with `v.transform` for numbers and picklists, and viem's `isAddress` / `isHex` for addresses and private keys. Parse once at startup with `v.parse(envSchema, process.env)`; on `ValiError`, log issues and `process.exit(1)`. Schema and parser live in `src/lib/env/` (`schema.ts`, `env.ts`). See the source for the current field list and defaults.

#### 2. GMX REST API Responses

Validate GMX Oracle API responses (markets/info, prices/tickers) at the boundary. Define Valibot schemas for the raw response shape (e.g. market rows with string amounts); the API client fetches, then `v.parse(schema, json)` and maps to domain types (string → bigint). Schemas and client live in `src/lib/chain/protocols/gmx/` (schema, api). See the source for current schema fields and `fetchGmxMarketsInfo` (or equivalent).

#### 3. RPC / Contract Data

Validate addresses and contract return shapes at the RPC boundary. GMX schema includes `addressSchema` (viem `isAddress`) and `gmxAccountPositionRawSchema` for Reader contract position data; use `v.parse()` or `v.safeParse()` before using in domain logic.

#### 4. Domain Configuration

Strategy and risk configuration use Valibot schemas with domain constraints (e.g. `v.minValue`, `v.maxValue` for bps, decimals, leverage). Types are inferred from schemas (`v.InferOutput`); defaults are exported alongside. See `domains/strategy/config.ts` and `domains/risk/config.ts` for current schemas.

#### 5. Optional: WebSocket Messages

When WebSocket feeds are used, the message parser (`src/worker/websocket/message-parser/`) accepts handlers that provide a Valibot schema per message type; `safeParse` is used so unknown event types are logged and ignored without crashing.

### Validation Patterns

#### Pattern 1: Parse at System Boundaries

Validate data immediately when it enters the system. After validation, trust the types.

```typescript
// ✅ Good: Validate at boundary (e.g. API response)
const fetchAndValidate = async (url: string): Promise<DomainType[]> => {
  const json: unknown = await (await fetch(url)).json();
  const data = v.parse(ResponseSchema, json);
  return data.items.map(mapToDomain); // string → bigint etc.
};

// ✅ Good: Validate env at startup
const env = v.parse(envSchema, process.env);

// Internal code can trust the type
const evaluate = (data: DomainType[]): Decision => { /* no validation needed */ };
```

#### Pattern 2: Safe Parse for Recoverable Errors

Use `safeParse` when validation failure is expected and recoverable (e.g. optional RPC data, WebSocket message types).

```typescript
// ✅ Good: Safe parse for optional or polymorphic data
const result = v.safeParse(SomeSchema, rawFromRpc);
if (result.success) {
  useData(result.output);
} else {
  logger.warn("Validation failed", { issues: result.issues });
}
```

#### Pattern 3: Type Guards with `is()`

Use `v.is()` for type guards without throwing.

```typescript
// ✅ Good: Type guard for conditional logic
const isValidConfig = (data: unknown): data is Config =>
  v.is(ConfigSchema, data);

if (isValidConfig(config)) {
  useConfig(config);
}
```

#### Pattern 4: Transform During Validation

Use `transform` to convert data types during validation.

```typescript
// ✅ Good: Transform strings to appropriate types
const PriceSchema = v.pipe(
  v.string(),
  v.transform((val) => {
    const num = Number(val);
    if (Number.isNaN(num)) throw new Error("Invalid number");
    return num;
  }),
);

// ✅ Good: Transform to bigint for financial values
const AmountSchema = v.pipe(
  v.string(),
  v.transform((val) => BigInt(val)),
);
```

#### Pattern 5: Custom Validation Messages

Provide clear error messages for custom validators (e.g. viem `isAddress` / `isHex` with a descriptive second argument).

### File Organization

```
src/
├── lib/
│   ├── env/
│   │   ├── schema.ts             # envSchema (DATABASE_URL, ARBITRUM_*, GMX_*, etc.)
│   │   └── env.ts                # parseEnv, getEnv
│   ├── logger/
│   │   └── schema.ts             # logLevelSchema (for env and logger config)
│   ├── chain/
│   │   └── protocols/
│   │       └── gmx/
│   │           ├── schema.ts    # GMX API + RPC (markets, tickers, positions, addressSchema)
│   │           ├── api/
│   │           │   └── api.ts   # fetchGmxMarketsInfo, fetchGmxTickers (v.parse at boundary)
│   │           └── types.ts     # Domain types (GmxMarket, GmxTicker, etc.)
│   ├── protocols/
│   │   ├── schema.ts            # order/balance/fill schemas (exchange-order shape)
│   │   └── config.ts            # Protocol adapter config validation
│   └── db/
│       └── schema.ts             # Drizzle schema (tables); Valibot where needed at boundaries
├── domains/
│   ├── strategy/
│   │   ├── config.ts            # StrategyConfigSchema, defaults
│   │   └── types.ts             # Strategy input/output types (Valibot where needed)
│   ├── risk/
│   │   ├── config.ts            # RiskConfigSchema, defaults
│   │   └── types.ts
│   ├── position/
│   │   └── types.ts
│   └── state/
│       ├── types.ts
│       ├── order-state/
│       │   └── order-state.ts   # OrderStatus schema, transition helpers
│       └── hedge-state/
│           └── hedge-state.ts   # HedgeState, HedgeEvent schemas
└── worker/
    ├── execution/
    │   └── types.ts              # Execution params/result schemas
    ├── reconciler/
    │   └── types.ts              # Reconciler input/output schemas
    ├── freshness/
    │   └── freshness.ts          # Staleness config schemas
    └── websocket/
        └── message-parser/       # Optional: schema per handler, safeParse for messages
```

### Conventions

1. **Schema suffix**: All schema variables end with `Schema` (e.g., `envSchema`, `StrategyConfigSchema`)
2. **Co-locate types**: Export inferred types alongside schemas (`v.InferOutput<typeof XSchema>`)
3. **Namespace import**: Always import as `import * as v from "valibot"`
4. **Fail fast**: Use `parse` at startup (env) and at API/RPC boundaries; use `safeParse` for optional or polymorphic runtime data
5. **Transform early**: Convert strings to numbers/bigints during validation (e.g. GMX API string amounts → bigint in domain types)
6. **Boundary-only**: Validate at boundaries (env, HTTP response, RPC return); trust internal data once validated

## Consequences

### Positive

- **Runtime Safety**: Invalid data caught at system boundaries
- **Type Inference**: No manual type definitions needed (`InferOutput`)
- **Small Bundle**: Valibot's modular design keeps bundle size minimal
- **Clear Errors**: Validation errors pinpoint exactly what's wrong
- **Testable**: Schemas can be unit tested independently

### Negative

- **Learning Curve**: Team must learn Valibot's functional API
- **Smaller Ecosystem**: Fewer integrations than Zod (rarely an issue for this use case)
- **Verbosity**: Schema definitions add code (but provide safety)

### Risks

| Risk | Mitigation |
|------|------------|
| Schema drift from GMX API | Test against live GMX Oracle API; update `lib/chain/protocols/gmx/schema.ts` when API changes |
| RPC/contract return shape change | Update GMX position/address schemas when Reader contract or SDK types change |
| Over-validation | Only validate at boundaries, trust internal data |
| Performance overhead | Validation is fast; measure if concerned |

## References

- [Valibot Documentation](https://valibot.dev/)
- [ADR-0031: Bot Architecture (On-Chain)](0031-bot-architecture-on-chain.md) — Data plane and boundaries
- [ADR-0020: Contract Interaction Patterns](0020-contract-interaction-patterns.md) — RPC and contract data
- [TypeScript Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)
