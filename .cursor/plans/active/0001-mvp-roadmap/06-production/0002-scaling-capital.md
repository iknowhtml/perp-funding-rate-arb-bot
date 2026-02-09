---
name: Scaling Capital
overview: Gradually increase position size from small capital to target capital ($50K-$300K).
todos:
  - id: scaling-strategy
    content: Define capital scaling strategy and milestones
    status: pending
  - id: slippage-monitoring
    content: Monitor slippage impact at larger sizes
    status: pending
  - id: liquidity-analysis
    content: Analyze liquidity and adjust position sizing
    status: pending
  - id: risk-adjustment
    content: Adjust risk limits for larger capital
    status: pending
  - id: scaling-execution
    content: Execute scaling plan incrementally
    status: pending
  - id: lifecycle-management
    content: Move plan to implemented/ directory after completion (update todos, check validation boxes, update roadmap link, move file, delete from active/)
    status: pending
isProject: false
---

> **Note**: This plan is part of Phase 6 (Production) in [MVP Roadmap](../README.md).

# Scaling Capital

## Overview

Gradually increase position size from small capital to target capital ($50K-$300K) while monitoring:
- Slippage impact at larger sizes
- Liquidity constraints
- Execution quality
- Performance metrics

## Tasks

### 1. Scaling Strategy

#### Capital Milestones

| Stage | Capital | Max Position | Duration |
|-------|---------|--------------|----------|
| 1 | $5,000 | $500 | 2 weeks |
| 2 | $10,000 | $2,000 | 2 weeks |
| 3 | $25,000 | $5,000 | 2 weeks |
| 4 | $50,000 | $10,000 | 2 weeks |
| 5 | $100,000 | $20,000 | 4 weeks |
| 6 | $200,000 | $40,000 | 4 weeks |
| 7 | $300,000 | $60,000 | Ongoing |

#### Stage Graduation Criteria

Before advancing to next stage:

- [ ] Win rate > 50%
- [ ] Sharpe ratio > 1.5
- [ ] Max drawdown < 10%
- [ ] Slippage within 20% of estimate
- [ ] No execution failures
- [ ] No risk limit violations

### 2. Slippage Monitoring

#### Track Slippage vs Position Size

```typescript
interface SlippageAnalysis {
  positionSizeCents: bigint;
  estimatedSlippageBps: bigint;
  realizedSlippageBps: bigint;
  timestamp: Date;
}

// Store and analyze slippage data
const analyzeSlippageScaling = (
  analyses: SlippageAnalysis[],
): SlippageScalingReport => {
  // Group by position size buckets
  const buckets = [
    { min: 0n, max: 100000n, label: "$0-$1K" },
    { min: 100000n, max: 500000n, label: "$1K-$5K" },
    { min: 500000n, max: 1000000n, label: "$5K-$10K" },
    { min: 1000000n, max: 2000000n, label: "$10K-$20K" },
    { min: 2000000n, max: 5000000n, label: "$20K-$50K" },
    { min: 5000000n, max: 10000000n, label: "$50K-$100K" },
  ];

  return buckets.map((bucket) => {
    const inBucket = analyses.filter(
      (a) => a.positionSizeCents >= bucket.min && a.positionSizeCents < bucket.max
    );

    return {
      bucket: bucket.label,
      count: inBucket.length,
      avgEstimatedBps: calculateAverage(inBucket.map((a) => a.estimatedSlippageBps)),
      avgRealizedBps: calculateAverage(inBucket.map((a) => a.realizedSlippageBps)),
      maxRealizedBps: inBucket.reduce(
        (max, a) => a.realizedSlippageBps > max ? a.realizedSlippageBps : max,
        0n
      ),
    };
  });
};
```

#### Slippage Alert Thresholds by Capital Stage

| Stage | Warning Slippage | Block Slippage |
|-------|------------------|----------------|
| 1-2 | 30 bps | 50 bps |
| 3-4 | 40 bps | 60 bps |
| 5-6 | 50 bps | 75 bps |
| 7 | 60 bps | 100 bps |

### 3. Liquidity Analysis

#### Order Book Depth Requirements

```typescript
const calculateMinLiquidityRequirement = (
  positionSizeCents: bigint,
  maxSlippageBps: bigint,
): bigint => {
  // Require at least 3x position size in order book
  // to achieve acceptable slippage
  return positionSizeCents * 3n;
};

const checkLiquiditySufficient = (
  orderBook: OrderBookSnapshot,
  positionSizeCents: bigint,
  side: "BUY" | "SELL",
): boolean => {
  const levels = side === "BUY" ? orderBook.asks : orderBook.bids;
  const availableLiquidity = levels.reduce(
    (sum, level) => sum + level.quantity * level.price,
    0n
  );

  const minRequired = calculateMinLiquidityRequirement(positionSizeCents, 50n);
  return availableLiquidity >= minRequired;
};
```

#### Liquidity-Based Position Sizing

```typescript
const calculateMaxPositionByLiquidity = (
  orderBook: OrderBookSnapshot,
  maxSlippageBps: bigint,
): bigint => {
  // Binary search for max position that stays within slippage limit
  let low = 0n;
  let high = 10000000000n; // $100M in cents (upper bound)

  while (high - low > 1000n) { // $10 precision
    const mid = (low + high) / 2n;
    const estimate = estimateSlippage(orderBook, "BUY", mid, maxSlippageBps);

    if (estimate.canExecute) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return low;
};
```

### 4. Risk Limit Adjustments

#### Stage-Specific Risk Configuration

```typescript
const getRiskConfigForStage = (stage: number): RiskConfig => {
  const baseConfig = DEFAULT_RISK_CONFIG;

  // Scale limits with capital
  const multiplier = Math.pow(1.5, stage - 1); // 1.5x per stage

  return {
    ...baseConfig,
    maxPositionSizeUsd: Math.round(500 * multiplier),
    maxDailyLossCents: Math.round(10000 * multiplier), // Scale daily loss limit
    // Keep percentage-based limits constant
    maxLeverageBps: 30000, // 3x stays constant
    maxDrawdownBps: 1000, // 10% stays constant
    minLiquidationBufferBps: 2000, // 20% stays constant
    maxMarginUtilizationBps: 8000, // 80% stays constant
  };
};
```

### 5. Scaling Execution Plan

#### Pre-Scale Checklist

Before increasing capital:

- [ ] Current stage criteria met
- [ ] Slippage analysis shows acceptable degradation
- [ ] Liquidity analysis confirms sufficient depth
- [ ] Risk configuration updated for new stage
- [ ] Alert thresholds updated
- [ ] Exchange account funded with additional capital

#### Scale Process

```bash
# 1. Update risk configuration
fly secrets set RISK_STAGE=<new_stage>

# 2. Deploy updated configuration
fly deploy

# 3. Monitor first trades at new size
fly logs -f

# 4. Track metrics for 24 hours
# - Slippage
# - Execution time
# - Fill quality
```

#### Rollback Process

If issues detected:

```bash
# 1. Reduce position size immediately
fly secrets set RISK_STAGE=<previous_stage>

# 2. Deploy
fly deploy

# 3. Analyze what went wrong
```

## Performance Tracking

### Weekly Report Template

```markdown
# Week X Capital Scaling Report

## Capital Stage
- Current Stage: X
- Capital: $XX,XXX
- Max Position: $X,XXX

## Performance Metrics
- Total Return: X.XX%
- Sharpe Ratio: X.XX
- Max Drawdown: X.XX%
- Win Rate: XX.X%

## Execution Quality
- Avg Slippage (estimated): XX bps
- Avg Slippage (realized): XX bps
- Slippage Delta: +/- XX bps
- Execution Success Rate: XX.X%

## Liquidity Analysis
- Avg Order Book Depth (entry): $XX,XXX
- Avg Order Book Depth (exit): $XX,XXX
- Liquidity Sufficient: Yes/No

## Recommendation
[ ] Ready to advance to Stage X+1
[ ] Continue at current stage
[ ] Reduce to previous stage
```

## Success Criteria

Target metrics for full production capital ($300K):

| Metric | Target |
|--------|--------|
| Sharpe Ratio | > 1.5 |
| Max Drawdown | < 10% |
| Win Rate | > 55% |
| Avg Slippage | < 50 bps |
| Execution Success | > 99.5% |
| Uptime | > 99.9% |

## References

- [MVP Roadmap](../README.md)
- [ADR-0013: Risk Management Engine](../../../../../adrs/0013-risk-management.md)
- [ADR-0015: Execution Safety & Slippage](../../../../../adrs/0015-execution-safety-slippage.md)
