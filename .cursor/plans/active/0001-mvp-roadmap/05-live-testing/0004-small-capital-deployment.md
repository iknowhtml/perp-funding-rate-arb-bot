---
name: Small Capital Deployment
overview: Deploy with small capital ($1,000-$5,000) for live validation before scaling.
todos:
  - id: exchange-setup
    content: Set up exchange accounts and API keys for live trading
    status: pending
  - id: config-tuning
    content: Configure conservative risk limits for small capital
    status: pending
  - id: monitoring-setup
    content: Set up monitoring dashboards and alerts
    status: pending
  - id: initial-deployment
    content: Deploy bot with small capital
    status: pending
  - id: monitoring-period
    content: Monitor for 1-2 weeks and collect performance data
    status: pending
  - id: validation-checklist
    content: Complete validation checklist
    status: pending
  - id: lifecycle-management
    content: Move plan to implemented/ directory after completion (update todos, check validation boxes, update roadmap link, move file, delete from active/)
    status: pending
isProject: false
---

> **Note**: This plan is part of Phase 5 (Live Testing) in [MVP Roadmap](../README.md).

# Small Capital Deployment

## Overview

Deploy the bot with small capital ($1,000-$5,000) to validate live performance matches backtests before scaling to full capital. This phase is critical for:
- Validating execution logic in live conditions
- Comparing live performance vs backtest expectations
- Identifying edge cases not covered in simulation
- Building confidence before larger deployment

## Tasks

### 1. Exchange Setup

#### Coinbase Advanced Trade

1. Create or use existing Coinbase account
2. Complete identity verification
3. Enable Advanced Trade
4. Fund account with test capital ($1,000-$5,000)
5. Generate API keys with trading permissions:
   - View balance: ✅
   - Trade: ✅
   - Transfer: ❌ (not needed, safer to disable)
6. Store API keys securely (Fly.io secrets)

#### API Key Security Checklist

- [ ] API keys stored in Fly.io secrets (not in code)
- [ ] Transfer permission disabled
- [ ] IP whitelist configured (if supported)
- [ ] API keys not committed to git

### 2. Configuration for Small Capital

Create conservative configuration for initial deployment:

```typescript
// config/small-capital.ts

export const SMALL_CAPITAL_RISK_CONFIG: RiskConfig = {
  // Hard limits - very conservative
  maxPositionSizeUsd: 500, // Max $500 per position
  maxLeverageBps: 20000, // Max 2x leverage (conservative)
  maxDailyLossCents: 10000, // Max $100 daily loss
  maxDrawdownBps: 500, // Max 5% drawdown (tight)
  minLiquidationBufferBps: 3000, // Min 30% buffer (conservative)
  maxMarginUtilizationBps: 6000, // Max 60% margin usage

  // Soft limits - trigger warnings early
  warningPositionSizeUsd: 400,
  warningMarginUtilizationBps: 5000,
  warningLiquidationBufferBps: 4000,
};

export const SMALL_CAPITAL_STRATEGY_CONFIG: StrategyConfig = {
  // Entry thresholds - higher than normal (be selective)
  minFundingRateBps: 15, // Min 0.15% funding (higher threshold)
  minPredictedRateBps: 12, // Min 0.12% predicted

  // Exit thresholds - exit earlier
  exitFundingRateBps: 8, // Exit when funding drops to 0.08%
  targetYieldBps: 20, // Target 0.20% per trade

  // Trend analysis
  trendWindow: 24,
  trendThresholdBps: 5,
  volatilityThresholdBps: 5,
};

export const SMALL_CAPITAL_SLIPPAGE_CONFIG: SlippageConfig = {
  maxSlippageBps: 30n, // Max 0.3% slippage (tight)
  warningSlippageBps: 20n,
  maxOrderSizeBps: 50n, // Max 0.5% of 24h volume
  minLiquidityMultiplier: 3n, // Require 3x liquidity buffer
};
```

### 3. Monitoring Setup

#### Grafana Dashboard (if using)

Create dashboards for:
- **Trading Overview**: Trades, P&L, win rate
- **Risk Monitoring**: Position size, leverage, margin
- **System Health**: Latency, errors, WebSocket status
- **Market Data**: Funding rates, prices

#### Discord Alerts

Configure alerts for:

| Alert Type | Trigger | Severity |
|------------|---------|----------|
| Trade Entered | Every entry | Info |
| Trade Exited | Every exit | Info |
| Daily Summary | 00:00 UTC | Info |
| Risk Warning | Approaching limits | Warning |
| Kill Switch | Critical condition | Critical |
| WS Disconnect | > 30s | Warning |
| Execution Failed | Any failure | Critical |

### 4. Initial Deployment

#### Pre-Deployment Checklist

- [ ] Paper trading ran for 1+ week without issues
- [ ] Backtest shows positive Sharpe ratio (> 1.0)
- [ ] All unit tests pass
- [ ] API keys configured in Fly.io
- [ ] Discord webhook configured
- [ ] Small capital deposited to exchange
- [ ] Risk limits configured conservatively

#### Deployment Steps

```bash
# 1. Set production secrets
./scripts/fly-secrets.sh

# 2. Deploy
./scripts/deploy.sh

# 3. Monitor logs
fly logs

# 4. Check health
curl https://funding-rate-arb-bot.fly.dev/health

# 5. Check metrics
curl https://funding-rate-arb-bot.fly.dev/metrics
```

### 5. Monitoring Period (1-2 Weeks)

#### Daily Checklist

- [ ] Check Discord alerts
- [ ] Review daily P&L
- [ ] Check position status
- [ ] Review execution quality (slippage)
- [ ] Check system health metrics
- [ ] Review funding rate trends

#### Weekly Review

- [ ] Calculate weekly return
- [ ] Calculate realized Sharpe ratio
- [ ] Compare to backtest expectations
- [ ] Review max drawdown
- [ ] Review execution anomalies
- [ ] Identify any issues or improvements

#### Red Flags to Watch For

| Issue | Action |
|-------|--------|
| Slippage > 2x estimate | Reduce position size |
| Win rate < 40% | Review strategy parameters |
| Max drawdown > 5% | Pause and investigate |
| Execution failures > 2 | Fix before continuing |
| Inconsistent reconciliation | Pause and investigate |

### 6. Validation Checklist

After 1-2 weeks of live trading:

#### Performance Validation

- [ ] Live P&L matches backtest expectations (±20%)
- [ ] Win rate > 50%
- [ ] Sharpe ratio > 1.0
- [ ] Max drawdown < 5%

#### Execution Validation

- [ ] Slippage within estimates (±20%)
- [ ] No execution failures
- [ ] Hedge drift corrected properly
- [ ] Orders fill as expected

#### System Validation

- [ ] Bot runs 24/7 without crashes
- [ ] WebSocket reconnects properly
- [ ] REST API calls succeed
- [ ] Reconciliation finds no issues
- [ ] Alerts trigger appropriately

#### Risk Validation

- [ ] No risk limit violations
- [ ] Position sizing correct
- [ ] Leverage within limits
- [ ] Emergency exit works if tested

## Success Criteria

Before proceeding to Phase 6 (Production):

| Metric | Target | Status |
|--------|--------|--------|
| Uptime | > 99% | [ ] |
| Win Rate | > 50% | [ ] |
| Sharpe Ratio | > 1.0 | [ ] |
| Max Drawdown | < 5% | [ ] |
| Slippage Accuracy | ±20% | [ ] |
| Execution Success | > 99% | [ ] |
| Alert Reliability | 100% | [ ] |

## Rollback Plan

If issues are detected:

1. **Minor Issues**: Adjust parameters, continue monitoring
2. **Moderate Issues**: Pause entries, allow exits only
3. **Critical Issues**: Kill switch, exit all positions immediately

```bash
# Emergency: SSH and stop
fly ssh console
pkill -f "node dist/index.js"

# Or: Scale down
fly scale count 0
```

## References

- [MVP Roadmap](../README.md)
- [ADR-0013: Risk Management Engine](../../../../../adrs/0013-risk-management.md)
- [ADR-0008: Monitoring & Observability](../../../../../adrs/0008-monitoring-observability.md)
