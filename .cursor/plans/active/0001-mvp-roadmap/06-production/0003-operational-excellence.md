---
name: Operational Excellence
overview: Create runbooks, incident response procedures, and operational documentation.
todos:
  - id: runbook
    content: Create operational runbook for common tasks
    status: pending
  - id: incident-response
    content: Document incident response procedures
    status: pending
  - id: monitoring-dashboards
    content: Create monitoring dashboards documentation
    status: pending
  - id: troubleshooting-guide
    content: Create troubleshooting guide
    status: pending
  - id: performance-reviews
    content: Establish regular performance review cadence
    status: pending
  - id: lifecycle-management
    content: Move plan to implemented/ directory after completion (update todos, check validation boxes, update roadmap link, move file, delete from active/)
    status: pending
isProject: false
---

> **Note**: This plan is part of Phase 6 (Production) in [MVP Roadmap](../README.md).

# Operational Excellence

## Overview

Create comprehensive operational documentation for:
- Daily operations runbook
- Incident response procedures
- Monitoring and alerting
- Troubleshooting guide
- Performance reviews

## Tasks

### 1. Operational Runbook

Create `docs/runbook.md`:

```markdown
# Funding Rate Arbitrage Bot - Operations Runbook

## Daily Operations

### Morning Check (9:00 AM)

1. **Check Bot Health**
   ```bash
   curl https://funding-rate-arb-bot.fly.dev/health
   ```
   Expected: `{"status":"healthy","timestamp":"..."}`

2. **Review Overnight Alerts**
   - Check Discord for any alerts
   - Review any WARNING or CRITICAL alerts

3. **Check Position Status**
   - Current position (if any)
   - Unrealized P&L
   - Margin utilization

4. **Review Metrics Dashboard**
   - Daily P&L
   - Trade count
   - Win rate

### Weekly Tasks

1. **Performance Review** (Monday)
   - Calculate weekly return
   - Review Sharpe ratio
   - Analyze losing trades

2. **System Maintenance** (Wednesday)
   - Check disk usage
   - Review memory trends
   - Check for dependency updates

3. **Strategy Review** (Friday)
   - Analyze funding rate trends
   - Review slippage data
   - Consider parameter adjustments

## Common Operations

### View Logs

```bash
# Live logs
fly logs -a funding-rate-arb-bot

# Last 100 lines
fly logs -a funding-rate-arb-bot --no-tail
```

### Check Metrics

```bash
curl https://funding-rate-arb-bot.fly.dev/metrics
```

### SSH into Instance

```bash
fly ssh console -a funding-rate-arb-bot
```

### Restart Bot

```bash
fly machines restart -a funding-rate-arb-bot
```

### Deploy Update

```bash
./scripts/deploy.sh
```

### Scale Resources

```bash
# Scale memory
fly scale memory 1024 -a funding-rate-arb-bot

# Scale CPU
fly scale vm shared-cpu-2x -a funding-rate-arb-bot
```

## Configuration Changes

### Update Risk Limits

1. Update configuration in code
2. Run tests
3. Deploy with `./scripts/deploy.sh`

### Update Strategy Parameters

1. Update configuration in code
2. Run backtests to validate
3. Deploy with `./scripts/deploy.sh`

### Rotate API Keys

1. Generate new API keys on exchange
2. Update Fly.io secrets:
   ```bash
   fly secrets set COINBASE_API_KEY=new_key -a funding-rate-arb-bot
   fly secrets set COINBASE_API_SECRET=new_secret -a funding-rate-arb-bot
   ```
3. Verify bot reconnects successfully
```

### 2. Incident Response

Create `docs/incident-response.md`:

```markdown
# Incident Response Procedures

## Severity Levels

| Level | Description | Response Time | Examples |
|-------|-------------|---------------|----------|
| P1 - Critical | Immediate action required | < 15 min | Kill switch triggered, position not flat |
| P2 - High | Urgent attention | < 1 hour | Execution failures, WebSocket down > 5 min |
| P3 - Medium | Timely attention | < 4 hours | High slippage, reconciliation issues |
| P4 - Low | Scheduled attention | < 24 hours | Warning alerts, performance degradation |

## P1 - Critical Incidents

### Kill Switch Triggered

**Symptoms:**
- Discord alert: "🚨 KILL SWITCH ACTIVATED"
- All trading stopped

**Response:**
1. Acknowledge alert in Discord
2. Check position status:
   ```bash
   fly logs -a funding-rate-arb-bot | grep -i position
   ```
3. If position not flat, manually close on exchange
4. Investigate root cause in logs
5. Fix issue
6. Restart bot: `fly machines restart -a funding-rate-arb-bot`

### Position Not Flat After Exit

**Symptoms:**
- Discord alert: "🚨 Position Not Flat"
- Bot may be in reduce-only mode

**Response:**
1. Immediately log into exchange
2. Check open positions
3. Manually close any remaining positions
4. Check for partial fills in order history
5. Investigate why exit didn't complete
6. Fix any issues found
7. Resume normal operation

## P2 - High Priority Incidents

### Execution Failures

**Symptoms:**
- Discord alert: "🚨 Execution Anomaly"
- Multiple failed trade attempts

**Response:**
1. Check exchange status (is API working?)
2. Check rate limiting status
3. Review recent logs:
   ```bash
   fly logs -a funding-rate-arb-bot | grep -i error
   ```
4. If exchange issue, wait and monitor
5. If bot issue, fix and redeploy

### WebSocket Disconnected > 5 min

**Symptoms:**
- Discord alert: "⚠️ WebSocket Disconnected"
- No price updates

**Response:**
1. Check if position is open
2. If in position and WS down > 30s, bot should force exit
3. Check exchange WebSocket status
4. Review logs for reconnection attempts
5. If stuck, restart bot: `fly machines restart -a funding-rate-arb-bot`

## P3 - Medium Priority Incidents

### High Slippage

**Symptoms:**
- Discord alert: "⚠️ Slippage Anomaly"
- Realized slippage > estimated + 20 bps

**Response:**
1. Review trade details
2. Check market conditions at trade time
3. Compare to order book depth
4. If systematic, consider:
   - Reducing position size
   - Adjusting slippage limits
   - Reviewing execution strategy

### Reconciliation Inconsistency

**Symptoms:**
- Discord alert: "⚠️ State Inconsistency"
- Mismatch between bot state and exchange

**Response:**
1. Check current position on exchange
2. Compare to bot's internal state
3. If critical mismatch, pause bot
4. Manually correct position if needed
5. Restart bot to re-sync state

## Post-Incident

After any P1 or P2 incident:

1. **Document** the incident in incident log
2. **Analyze** root cause
3. **Identify** preventive measures
4. **Implement** fixes or improvements
5. **Review** in weekly meeting
```

### 3. Monitoring Dashboards

Create `docs/monitoring.md`:

```markdown
# Monitoring Guide

## Key Metrics to Watch

### Trading Metrics

| Metric | Healthy Range | Alert Threshold |
|--------|---------------|-----------------|
| Evaluations/min | 25-35 | < 20 or > 40 |
| Executions/day | 2-10 | > 20 |
| Win rate | > 50% | < 40% |
| Avg slippage | < 30 bps | > 50 bps |

### Risk Metrics

| Metric | Healthy Range | Alert Threshold |
|--------|---------------|-----------------|
| Leverage | 0-300% | > 300% |
| Margin utilization | 0-70% | > 80% |
| Liquidation distance | > 30% | < 20% |
| Daily P&L | > -2% | < -5% |

### System Metrics

| Metric | Healthy Range | Alert Threshold |
|--------|---------------|-----------------|
| Heap memory | < 300MB | > 400MB |
| REST latency P99 | < 500ms | > 1000ms |
| WS connected | 1 | 0 |
| Error rate | < 1% | > 5% |

## Prometheus Queries

### P&L Tracking
```promql
# Daily P&L
bot_daily_pnl_cents / 100

# Total P&L
bot_total_pnl_cents / 100

# Return percentage
bot_total_return_bps / 100
```

### Risk Monitoring
```promql
# Current leverage
bot_leverage_bps / 100

# Margin utilization
bot_margin_utilization_bps / 100

# Risk level (0=SAFE, 4=BLOCKED)
bot_risk_level
```

### Execution Quality
```promql
# Success rate
sum(rate(bot_executions_total{result="success"}[1h])) /
sum(rate(bot_executions_total[1h]))

# Average execution time
histogram_quantile(0.95, sum(rate(bot_execution_duration_ms_bucket[1h])) by (le))
```
```

### 4. Troubleshooting Guide

Create `docs/troubleshooting.md`:

```markdown
# Troubleshooting Guide

## Common Issues

### Bot Not Trading

**Check List:**
1. Is bot running? `fly status -a funding-rate-arb-bot`
2. Is health endpoint returning healthy? 
3. Are funding rates below threshold?
4. Is bot in PAUSED mode due to risk limits?
5. Is execution queue stuck?

**Resolution:**
- Check logs for "Intent generated" messages
- If no intents, funding rates may be too low
- If intents but no execution, check risk limits

### High Memory Usage

**Symptoms:**
- Memory > 400MB
- Possible OOM kills

**Check List:**
1. Check memory metrics over time
2. Look for memory leaks in logs
3. Check funding history size

**Resolution:**
- Restart bot to clear memory
- If persistent, check for leaking data structures
- Review recent code changes

### API Rate Limiting

**Symptoms:**
- 429 errors in logs
- Slow response times

**Check List:**
1. Check rate limiter metrics
2. Review recent request volume
3. Check circuit breaker state

**Resolution:**
- Rate limiter should handle automatically
- If persistent, reduce polling frequency
- Check for request loops in code

### WebSocket Connection Issues

**Symptoms:**
- Frequent reconnections
- Stale price data

**Check List:**
1. Check WS connected metric
2. Review reconnection logs
3. Check exchange status page

**Resolution:**
- Usually auto-recovers
- If persistent, check network
- Verify exchange credentials

## Diagnostic Commands

```bash
# Check process status
fly ssh console -a funding-rate-arb-bot -C "ps aux"

# Check network
fly ssh console -a funding-rate-arb-bot -C "curl -I https://api.coinbase.com"

# Check disk space
fly ssh console -a funding-rate-arb-bot -C "df -h"

# Check memory details
fly ssh console -a funding-rate-arb-bot -C "cat /proc/meminfo"
```
```

### 5. Performance Review Template

Create `docs/performance-review-template.md`:

```markdown
# Weekly Performance Review - Week of [DATE]

## Executive Summary
- Total P&L: $X,XXX (X.XX%)
- Win Rate: XX.X%
- Sharpe Ratio: X.XX
- Max Drawdown: X.XX%

## Trading Activity

| Metric | This Week | Last Week | Change |
|--------|-----------|-----------|--------|
| Total Trades | XX | XX | +/- XX |
| Winning Trades | XX | XX | +/- XX |
| Losing Trades | XX | XX | +/- XX |
| Avg Trade P&L | $XX | $XX | +/- $XX |

## Position Analysis

| Trade Date | Entry | Exit | Size | P&L | Reason |
|------------|-------|------|------|-----|--------|
| ... | ... | ... | ... | ... | ... |

## Risk Analysis

- Max leverage used: X.XX%
- Max margin utilization: XX.X%
- Risk limit breaches: X

## Execution Quality

- Avg slippage (estimated): XX bps
- Avg slippage (realized): XX bps
- Execution success rate: XX.X%

## System Health

- Uptime: XX.X%
- WebSocket disconnects: X
- API errors: X

## Funding Rate Analysis

- Avg funding rate: XX bps
- Max funding rate: XX bps
- Min funding rate: XX bps
- Entries above threshold: X

## Action Items

- [ ] Action item 1
- [ ] Action item 2

## Notes

[Any additional observations or concerns]
```

## File Structure

```
docs/
├── runbook.md                    # Daily operations
├── incident-response.md          # Incident procedures
├── monitoring.md                 # Monitoring guide
├── troubleshooting.md            # Troubleshooting guide
└── performance-review-template.md # Weekly review template
```

## Validation

- [ ] Runbook covers all common operations
- [ ] Incident response covers all alert types
- [ ] Monitoring guide explains all key metrics
- [ ] Troubleshooting guide covers common issues
- [ ] Team can operate bot using documentation

## References

- [MVP Roadmap](../README.md)
- [ADR-0008: Monitoring & Observability](../../../../adrs/0008-monitoring-observability.md)
