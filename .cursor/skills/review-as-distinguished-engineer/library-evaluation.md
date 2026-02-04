# Library Evaluation Criteria

Detailed framework for evaluating whether to use a library or build your own.

## Build vs Buy Decision Matrix

| Factor | Weight | Build Own | Use Library |
|--------|--------|-----------|-------------|
| Implementation Complexity | High | <100 LOC, simple logic | >200 LOC, many edge cases |
| Customization Needs | High | Highly specific to domain | Standard implementation works |
| Library Maturity | High | No good options exist | Battle-tested, >3 years old |
| Maintenance Burden | Medium | Willing to own forever | Prefer community maintenance |
| Performance Critical | Medium | Need full control | Library is optimized |
| Team Expertise | Low | Deep domain knowledge | Unfamiliar with problem space |

## Library Health Scorecard

Rate each library on these criteria (1-5 scale):

### Maintenance Health

| Criteria | Score 1 | Score 3 | Score 5 |
|----------|---------|---------|---------|
| Last commit | >1 year | 3-6 months | <1 month |
| Open issues | >500 | 100-200 | <50 |
| Issue response time | >30 days | 7-14 days | <3 days |
| Release frequency | None in 2y | Yearly | Quarterly+ |

### Community & Adoption

| Criteria | Score 1 | Score 3 | Score 5 |
|----------|---------|---------|---------|
| GitHub stars | <100 | 1k-5k | >10k |
| npm weekly downloads | <1k | 10k-100k | >500k |
| StackOverflow questions | <10 | 50-200 | >500 |
| Corporate backing | None | Small company | Major tech company |

### Technical Quality

| Criteria | Score 1 | Score 3 | Score 5 |
|----------|---------|---------|---------|
| TypeScript support | None | @types/ pkg | Built-in |
| Test coverage | Unknown | 50-80% | >90% |
| Documentation | README only | Good docs | Excellent + examples |
| Bundle size | >500KB | 50-200KB | <20KB |
| Dependencies | >20 transitive | 5-10 | 0-3 |

### Minimum Acceptable Scores

For **production use** in critical paths:
- Maintenance Health: ≥3
- Community & Adoption: ≥3
- Technical Quality: ≥3
- **Total: ≥12/15**

For **development tooling**:
- Maintenance Health: ≥2
- Community & Adoption: ≥2
- Technical Quality: ≥3
- **Total: ≥9/15**

## Red Flags (Automatic Rejection)

Reject a library if ANY of these are true:

- ❌ No commits in >2 years (abandoned)
- ❌ Security vulnerabilities (check `npm audit`)
- ❌ Incompatible license (GPL in commercial project)
- ❌ No TypeScript support (types or @types/)
- ❌ Maintainer unresponsive to security issues
- ❌ Major version 0.x with breaking changes

## Node.js Specific Considerations

### Prefer Native Over Library

Node.js 18+ has excellent built-in support. Avoid libraries for:

| Need | Native Solution |
|------|-----------------|
| HTTP requests | `fetch` (global) |
| File system | `node:fs/promises` |
| Crypto | `node:crypto` |
| Testing | `node:test` (if simple) |
| Assert | `node:assert` |
| Timers | `node:timers/promises` |

### Node.js Library Ecosystem Tiers

**Tier 1 - Safe to Use (battle-tested, well-maintained)**
- `express`, `fastify`, `hono` (HTTP frameworks)
- `ws` (WebSocket)
- `pg`, `mysql2` (Database drivers)
- `drizzle-orm`, `prisma` (ORMs)
- `valibot`, `zod` (Validation)
- `pino`, `winston` (Logging)
- `vitest`, `jest` (Testing)

**Tier 2 - Evaluate Carefully**
- Newer libraries (<2 years old)
- Libraries with <5k stars
- Libraries from single maintainers

**Tier 3 - Avoid Unless Necessary**
- Libraries with no TypeScript support
- Libraries last updated >1 year ago
- Libraries with >100 open issues and no triage

## Trading Bot Specific Guidance

For trading/financial applications, extra scrutiny on:

### Must Have
- **Deterministic behavior** - no random failures
- **Precision handling** - BigInt or Decimal support
- **Timeout handling** - configurable timeouts
- **Error granularity** - distinguishable error types

### Circuit Breaker Libraries

| Library | Pros | Cons | Recommendation |
|---------|------|------|----------------|
| `opossum` | Mature, Netflix-inspired, metrics | Older callback style | ✅ Production ready |
| `cockatiel` | Modern, TypeScript-first, composable | Newer, smaller community | ✅ Good for new projects |
| `mollitia` | Plugin architecture | Less popular | ⚠️ Evaluate carefully |
| Roll own | Full control | Miss edge cases | ❌ Unless very simple |

### Rate Limiting Libraries

| Library | Pros | Cons | Recommendation |
|---------|------|------|----------------|
| `bottleneck` | Feature-rich, clustering | Heavier | ✅ If need features |
| `p-throttle` | Simple, sindresorhus | Basic | ✅ For simple cases |
| `limiter` | Token bucket, lightweight | Less features | ✅ Simple token bucket |
| Roll own | Exchange-specific customization | More code | ✅ If highly custom |

### WebSocket Libraries

| Library | Pros | Cons | Recommendation |
|---------|------|------|----------------|
| `ws` | De facto standard, fast | Low-level | ✅ Always |
| `socket.io-client` | Reconnection, rooms | Heavy, not raw WS | ❌ For exchange APIs |

## Evaluation Checklist

Before adding any library to production:

```markdown
## Library: [name]

### Basic Info
- npm: `package-name`
- Version evaluating: x.x.x
- GitHub: [link]
- Purpose: [why we need it]

### Health Check
- [ ] Last commit: [date] - within 6 months?
- [ ] Open issues: [count] - <200?
- [ ] npm weekly: [count] - >10k?
- [ ] TypeScript: native / @types / none
- [ ] License: [license] - compatible?
- [ ] `npm audit`: no vulnerabilities?

### Technical Evaluation
- [ ] Read source code of critical paths
- [ ] Tested with our use case
- [ ] Acceptable bundle size impact
- [ ] Dependencies reviewed

### Scores
- Maintenance: [1-5]
- Community: [1-5]
- Technical: [1-5]
- **Total: [X/15]** - meets threshold?

### Decision
- [ ] APPROVED for production
- [ ] REJECTED - reason: [why]
- [ ] NEEDS MORE EVALUATION
```
