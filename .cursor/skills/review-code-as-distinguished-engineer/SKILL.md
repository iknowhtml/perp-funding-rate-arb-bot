---
name: review-code-as-distinguished-engineer
description: Review code from a distinguished Node.js trading/arbitrage bot engineer perspective. Spawns parallel subagents for multi-perspective analysis covering architecture, library decisions (build vs buy), performance, security, and production readiness. Use when reviewing plans, reviewing implementations, or making technology decisions.
---

# Distinguished Node Engineer Review

Review code, plans, and architecture decisions from a senior Node.js engineer perspective using parallel multi-perspective analysis.

## Quick Start

When asked to review code/plans as a distinguished Node engineer:

1. **Spawn parallel subagents** for multi-perspective evaluation
2. **Synthesize findings** into actionable recommendations
3. **Provide build vs buy recommendations** with clear rationale

## Multi-Perspective Evaluation via Subagents

Spawn **3 parallel subagents** with different evaluation angles:

### Subagent Configuration

```
┌─────────────────────────────────────────────────────────────────────┐
│ PARALLEL SUBAGENT EVALUATION                                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Architecture │  │  Libraries   │  │  Production  │              │
│  │   Analyst    │  │   Expert     │  │   Readiness  │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│         │                 │                 │                       │
│         ▼                 ▼                 ▼                       │
│  • Design patterns  • Build vs buy    • Error handling             │
│  • Scalability      • Library health  • Observability              │
│  • Maintainability  • Dependencies    • Security                   │
│  • SOLID/DRY        • Alternatives    • Performance                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

Future Model Mapping (when available):
- Architecture Analyst  → opus-4.5 (deep reasoning)
- Libraries Expert      → gemini-3-pro (broad knowledge)  
- Production Readiness  → chatgpt-5.2 (practical focus)

Current: All use 'fast' model with specialized prompts
```

### Spawning Subagents

Use the Task tool with `subagent_type: "generalPurpose"` and these specialized prompts:

#### 1. Architecture Analyst

```typescript
{
  description: "Architecture analysis",
  subagent_type: "generalPurpose",
  model: "fast", // Future: opus-4.5
  prompt: `You are a distinguished Node.js trading/arbitrage bot architect. Evaluate this code/plan:

<code_or_plan>
${CODE_OR_PLAN}
</code_or_plan>

Analyze for:
1. **Design Patterns**: Are patterns appropriate? Over/under-engineered?
2. **Scalability**: Will this scale? Bottlenecks?
3. **Maintainability**: Easy to understand, modify, test?
4. **SOLID Principles**: Single responsibility, open/closed, etc.
5. **Node.js Idioms**: Event loop awareness, async patterns, streams

Return structured findings with severity (critical/warning/suggestion).`
}
```

#### 2. Libraries Expert

```typescript
{
  description: "Library evaluation",
  subagent_type: "generalPurpose", 
  model: "fast", // Future: gemini-3-pro
  prompt: `You are a Node.js ecosystem expert. Evaluate library decisions:

<code_or_plan>
${CODE_OR_PLAN}
</code_or_plan>

For each component that could use a library:
1. **Identify Candidates**: What battle-tested libraries exist?
2. **Build vs Buy Analysis**:
   - Implementation complexity (lines of code, edge cases)
   - Library maintenance health (stars, last commit, issues)
   - Dependency cost (bundle size, transitive deps)
   - Customization needs (how specific are requirements?)
3. **Recommendation**: Build, buy, or hybrid?

Use this decision matrix:
| Factor              | Build Own | Use Library |
|---------------------|-----------|-------------|
| Complex edge cases  | ❌        | ✅          |
| Exchange-specific   | ✅        | ❌          |
| <100 lines          | ✅        | ❌          |
| Critical path       | ❌        | ✅          |
| Well-tested lib     | ❌        | ✅          |

Return specific library recommendations with npm package names.`
}
```

#### 3. Production Readiness Reviewer

```typescript
{
  description: "Production readiness review",
  subagent_type: "generalPurpose",
  model: "fast", // Future: chatgpt-5.2
  prompt: `You are a Node.js SRE/DevOps expert. Evaluate production readiness:

<code_or_plan>
${CODE_OR_PLAN}
</code_or_plan>

Check for:
1. **Error Handling**: Graceful degradation, retry logic, circuit breakers
2. **Observability**: Logging, metrics, tracing hooks
3. **Security**: Input validation, secrets handling, injection risks
4. **Performance**: Memory leaks, blocking operations, connection pooling
5. **Reliability**: Idempotency, timeouts, health checks

Rate each area: ✅ Ready | ⚠️ Needs Work | ❌ Blocking Issue

Return actionable fixes for any non-ready items.`
}
```

## Synthesis Template

After subagents return, synthesize findings:

```markdown
## Distinguished Node Engineer Review

### Executive Summary
[1-2 sentence overall assessment]

### Architecture Assessment
[Findings from Architecture Analyst]
- Strengths: ...
- Concerns: ...

### Library Recommendations

| Component | Recommendation | Rationale |
|-----------|----------------|-----------|
| [name]    | Build/Buy      | [reason]  |

**Suggested Libraries:**
- `package-name` - [purpose] - [npm weekly downloads, last update]

### Production Readiness

| Area | Status | Notes |
|------|--------|-------|
| Error Handling | ✅/⚠️/❌ | ... |
| Observability | ✅/⚠️/❌ | ... |
| Security | ✅/⚠️/❌ | ... |
| Performance | ✅/⚠️/❌ | ... |

### Action Items

**Critical (must fix):**
1. ...

**Recommended:**
1. ...

**Nice to have:**
1. ...
```

## Library Evaluation Framework

For detailed library evaluation criteria, see [library-evaluation.md](library-evaluation.md).

### Quick Build vs Buy Decision

```
Should I use a library?

       Is the implementation >200 lines?
              /            \
            Yes             No
             |               |
    Does a well-maintained   |
    library exist?           |
         /     \             |
       Yes     No            |
        |       |            |
   USE LIBRARY  |      BUILD YOUR OWN
                |
        Are there many
        edge cases?
           /    \
         Yes    No
          |      |
    BUILD OWN   BUILD YOUR OWN
    (carefully)
```

### Library Health Checklist

Before recommending a library, verify:

- [ ] **Maintenance**: Updated in last 6 months
- [ ] **Popularity**: >1000 GitHub stars or >10k weekly npm downloads
- [ ] **Issues**: <100 open issues, responsive maintainers
- [ ] **TypeScript**: Has types (built-in or @types/)
- [ ] **Dependencies**: Minimal transitive dependencies
- [ ] **License**: Compatible (MIT, Apache 2.0, BSD)

## Common Node.js Library Recommendations

### Rate Limiting & Resilience

| Need | Library | Notes |
|------|---------|-------|
| Circuit Breaker | `opossum` or `cockatiel` | Critical for API resilience |
| Rate Limiting | `bottleneck` | Feature-rich, clustering support |
| Retry Logic | `p-retry` | Simple, sindresorhus ecosystem |
| Queue Management | `p-queue` | Already in project |

### Validation & Parsing

| Need | Library | Notes |
|------|---------|-------|
| Schema Validation | `valibot` | Already in project, excellent |
| Environment Vars | `@t3-oss/env-core` | Type-safe env validation |

### HTTP & WebSocket

| Need | Library | Notes |
|------|---------|-------|
| HTTP Server | `hono` | Already in project |
| WebSocket Client | `ws` | De facto standard |
| HTTP Client | Native `fetch` | Node 18+, no library needed |

## Additional Resources

- [Library Evaluation Criteria](library-evaluation.md)
- [Production Checklist](production-checklist.md)
