---
name: Backtesting CLI
overview: Implement command-line interface for running backtests with parameter configuration.
todos:
  - id: cli-command
    content: Implement backtest CLI command with options
    status: pending
  - id: results-output
    content: Implement console output formatting for results
    status: pending
  - id: csv-export
    content: Implement CSV export for trades and daily P&L
    status: pending
  - id: json-export
    content: Implement JSON export for full results
    status: pending
  - id: tests
    content: Add unit tests for CLI
    status: pending
  - id: lifecycle-management
    content: Move plan to implemented/ directory after completion (update todos, check validation boxes, update roadmap link, move file, delete from active/)
    status: pending
isProject: false
---

> **Note**: This plan is part of Phase 4 (Simulation) in [MVP Roadmap](../README.md).

# Backtesting CLI

## Overview

Implement a command-line interface for running backtests that:
1. Accepts configuration via command-line options or config file
2. Displays formatted results in the console
3. Exports trades and daily P&L to CSV
4. Exports full results to JSON

Reference: [ADR-0016: Backtesting & Simulation](../../../../adrs/0016-backtesting-simulation.md)

## Tasks

### 1. CLI Command

Create `src/commands/backtest/backtest.ts`:

```typescript
import { Command } from "commander";
import { createBacktestEngine } from "@/lib/backtest";
import { createHistoricalDataLoader } from "@/lib/data-ingestion";
import { getDatabase } from "@/lib/db";
import { logger } from "@/lib/logger";

export interface BacktestOptions {
  startDate: string;
  endDate: string;
  initialCapital: number;
  exchange: string;
  symbol: string;
  configFile?: string;
  output?: string;
  format?: "console" | "csv" | "json";
}

export const createBacktestCommand = (): Command => {
  const command = new Command("backtest")
    .description("Run backtesting simulation")
    .requiredOption("--start-date <date>", "Start date (YYYY-MM-DD)")
    .requiredOption("--end-date <date>", "End date (YYYY-MM-DD)")
    .requiredOption("--initial-capital <amount>", "Initial capital in USD", parseInt)
    .option("--exchange <exchange>", "Exchange to backtest", "coinbase")
    .option("--symbol <symbol>", "Trading symbol", "BTC-USD")
    .option("--config <file>", "Path to config file (JSON)")
    .option("--output <file>", "Output file path")
    .option("--format <format>", "Output format (console, csv, json)", "console")
    .action(runBacktest);

  return command;
};

const runBacktest = async (options: BacktestOptions): Promise<void> => {
  logger.info("Starting backtest", {
    startDate: options.startDate,
    endDate: options.endDate,
    initialCapital: options.initialCapital,
    exchange: options.exchange,
    symbol: options.symbol,
  });

  // Load config
  const config = await loadConfig(options);

  // Initialize database and data loader
  const db = getDatabase();
  const dataLoader = createHistoricalDataLoader(db);

  // Create and run backtest engine
  const engine = createBacktestEngine(config, dataLoader);
  
  console.log("\n🔄 Running backtest...\n");
  const startTime = Date.now();
  
  const result = await engine.run();
  
  const elapsedMs = Date.now() - startTime;
  console.log(`✅ Backtest completed in ${(elapsedMs / 1000).toFixed(2)}s\n`);

  // Output results
  switch (options.format) {
    case "csv":
      await exportToCSV(result, options.output);
      break;
    case "json":
      await exportToJSON(result, options.output);
      break;
    default:
      printConsoleResults(result);
  }
};

const loadConfig = async (options: BacktestOptions): Promise<BacktestConfig> => {
  let strategyConfig = DEFAULT_STRATEGY_CONFIG;
  let riskConfig = DEFAULT_RISK_CONFIG;
  let slippageConfig = DEFAULT_SLIPPAGE_CONFIG;

  if (options.configFile) {
    const configFile = await import(options.configFile);
    strategyConfig = { ...strategyConfig, ...configFile.strategy };
    riskConfig = { ...riskConfig, ...configFile.risk };
    slippageConfig = { ...slippageConfig, ...configFile.slippage };
  }

  return {
    startDate: new Date(options.startDate),
    endDate: new Date(options.endDate),
    initialCapitalCents: BigInt(options.initialCapital) * 100n,
    exchange: options.exchange,
    symbol: options.symbol,
    strategyConfig,
    riskConfig,
    slippageConfig,
    evaluationIntervalMs: 2000,
  };
};
```

### 2. Console Output

```typescript
const printConsoleResults = (result: BacktestResult): void => {
  const divider = "═".repeat(50);
  
  console.log(divider);
  console.log("📊 BACKTEST RESULTS");
  console.log(divider);
  
  // Summary
  console.log("\n📈 Performance Summary");
  console.log("─".repeat(40));
  console.log(`  Initial Capital:    $${formatMoney(result.initialCapitalCents)}`);
  console.log(`  Final Capital:      $${formatMoney(result.finalCapitalCents)}`);
  console.log(`  Total P&L:          $${formatMoney(result.totalPnLCents)} (${formatBps(result.totalReturnBps)})`);
  
  // Risk metrics
  console.log("\n⚠️  Risk Metrics");
  console.log("─".repeat(40));
  console.log(`  Sharpe Ratio:       ${result.sharpeRatio.toFixed(2)}`);
  console.log(`  Sortino Ratio:      ${result.sortinoRatio.toFixed(2)}`);
  console.log(`  Max Drawdown:       ${formatBps(result.maxDrawdownBps)}`);
  console.log(`  Volatility:         ${formatBps(result.metrics.volatilityBps)}`);
  
  // Trade statistics
  console.log("\n📊 Trade Statistics");
  console.log("─".repeat(40));
  console.log(`  Total Trades:       ${result.totalTrades}`);
  console.log(`  Win Rate:           ${(result.winRate * 100).toFixed(1)}%`);
  console.log(`  Profit Factor:      ${result.metrics.profitFactor.toFixed(2)}`);
  console.log(`  Avg Win:            ${formatBps(result.metrics.averageWinBps)}`);
  console.log(`  Avg Loss:           ${formatBps(result.metrics.averageLossBps)}`);
  console.log(`  Avg Hold Time:      ${result.averageHoldTimeHours.toFixed(1)} hours`);
  
  // Execution quality
  console.log("\n⚡ Execution Quality");
  console.log("─".repeat(40));
  console.log(`  Avg Slippage:       ${formatBps(result.metrics.averageSlippageBps)}`);
  
  console.log("\n" + divider);
  
  // Trade summary
  if (result.trades.length > 0) {
    console.log("\n📋 Recent Trades (last 5)");
    console.log("─".repeat(80));
    console.log("  Entry Time              Exit Time               P&L         Return   Reason");
    console.log("─".repeat(80));
    
    const recentTrades = result.trades.slice(-5);
    for (const trade of recentTrades) {
      const entryDate = trade.entryTime.toISOString().slice(0, 19).replace("T", " ");
      const exitDate = trade.exitTime.toISOString().slice(0, 19).replace("T", " ");
      const pnl = formatMoney(trade.pnlCents).padStart(10);
      const ret = formatBps(trade.returnBps).padStart(8);
      const reason = trade.reason.slice(0, 12).padEnd(12);
      
      console.log(`  ${entryDate}  ${exitDate}  ${pnl}  ${ret}  ${reason}`);
    }
  }
  
  // Success criteria check
  console.log("\n✅ Success Criteria Check");
  console.log("─".repeat(40));
  console.log(`  Sharpe > 1.0:       ${result.sharpeRatio > 1.0 ? "✅ PASS" : "❌ FAIL"} (${result.sharpeRatio.toFixed(2)})`);
  console.log(`  Max DD < 10%:       ${result.maxDrawdownBps < 1000n ? "✅ PASS" : "❌ FAIL"} (${formatBps(result.maxDrawdownBps)})`);
  console.log(`  Win Rate > 50%:     ${result.winRate > 0.5 ? "✅ PASS" : "❌ FAIL"} (${(result.winRate * 100).toFixed(1)}%)`);
  
  console.log("\n" + divider + "\n");
};

const formatMoney = (cents: bigint): string => {
  const dollars = Number(cents) / 100;
  return dollars.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatBps = (bps: bigint): string => {
  const percent = Number(bps) / 100;
  return `${percent >= 0 ? "+" : ""}${percent.toFixed(2)}%`;
};
```

### 3. CSV Export

```typescript
const exportToCSV = async (
  result: BacktestResult,
  outputPath?: string,
): Promise<void> => {
  const tradesCSV = generateTradesCSV(result.trades);
  const dailyPnLCSV = generateDailyPnLCSV(result.dailyPnL);
  
  const basePath = outputPath ?? `backtest-${Date.now()}`;
  
  await fs.writeFile(`${basePath}-trades.csv`, tradesCSV);
  await fs.writeFile(`${basePath}-daily.csv`, dailyPnLCSV);
  
  console.log(`\n📁 Exported results to:`);
  console.log(`   - ${basePath}-trades.csv`);
  console.log(`   - ${basePath}-daily.csv\n`);
};

const generateTradesCSV = (trades: BacktestTrade[]): string => {
  const headers = [
    "id",
    "entry_time",
    "exit_time",
    "entry_price",
    "exit_price",
    "size_usd",
    "side",
    "pnl_usd",
    "return_pct",
    "funding_usd",
    "slippage_usd",
    "reason",
  ].join(",");

  const rows = trades.map((t) =>
    [
      t.id,
      t.entryTime.toISOString(),
      t.exitTime.toISOString(),
      Number(t.entryPrice) / 100,
      Number(t.exitPrice) / 100,
      Number(t.sizeCents) / 100,
      t.side,
      Number(t.pnlCents) / 100,
      Number(t.returnBps) / 100,
      Number(t.fundingReceivedCents) / 100,
      Number(t.slippageCostCents) / 100,
      t.reason,
    ].join(",")
  );

  return [headers, ...rows].join("\n");
};

const generateDailyPnLCSV = (dailyPnL: DailyPnL[]): string => {
  const headers = ["date", "pnl_usd", "cumulative_pnl_usd", "drawdown_pct"].join(",");

  const rows = dailyPnL.map((d) =>
    [
      d.date.toISOString().slice(0, 10),
      Number(d.pnlCents) / 100,
      Number(d.cumulativePnLCents) / 100,
      Number(d.drawdownBps) / 100,
    ].join(",")
  );

  return [headers, ...rows].join("\n");
};
```

### 4. JSON Export

```typescript
const exportToJSON = async (
  result: BacktestResult,
  outputPath?: string,
): Promise<void> => {
  const jsonPath = outputPath ?? `backtest-${Date.now()}.json`;
  
  // Convert bigints to strings for JSON serialization
  const serializable = serializeBacktestResult(result);
  
  await fs.writeFile(jsonPath, JSON.stringify(serializable, null, 2));
  
  console.log(`\n📁 Exported results to: ${jsonPath}\n`);
};

const serializeBacktestResult = (result: BacktestResult): unknown => {
  return {
    ...result,
    initialCapitalCents: result.initialCapitalCents.toString(),
    finalCapitalCents: result.finalCapitalCents.toString(),
    totalPnLCents: result.totalPnLCents.toString(),
    totalReturnBps: result.totalReturnBps.toString(),
    maxDrawdownBps: result.maxDrawdownBps.toString(),
    trades: result.trades.map((t) => ({
      ...t,
      entryPrice: t.entryPrice.toString(),
      exitPrice: t.exitPrice.toString(),
      sizeCents: t.sizeCents.toString(),
      pnlCents: t.pnlCents.toString(),
      returnBps: t.returnBps.toString(),
      fundingReceivedCents: t.fundingReceivedCents.toString(),
      slippageCostCents: t.slippageCostCents.toString(),
    })),
    dailyPnL: result.dailyPnL.map((d) => ({
      ...d,
      pnlCents: d.pnlCents.toString(),
      cumulativePnLCents: d.cumulativePnLCents.toString(),
      drawdownBps: d.drawdownBps.toString(),
    })),
    metrics: {
      ...result.metrics,
      totalReturnBps: result.metrics.totalReturnBps.toString(),
      annualizedReturnBps: result.metrics.annualizedReturnBps.toString(),
      maxDrawdownBps: result.metrics.maxDrawdownBps.toString(),
      volatilityBps: result.metrics.volatilityBps.toString(),
      averageWinBps: result.metrics.averageWinBps.toString(),
      averageLossBps: result.metrics.averageLossBps.toString(),
      averageSlippageBps: result.metrics.averageSlippageBps.toString(),
    },
  };
};
```

## Example Usage

```bash
# Run backtest with console output
pnpm backtest \
  --start-date 2025-01-01 \
  --end-date 2025-06-30 \
  --initial-capital 10000 \
  --exchange coinbase \
  --symbol BTC-USD

# Export to CSV
pnpm backtest \
  --start-date 2025-01-01 \
  --end-date 2025-06-30 \
  --initial-capital 10000 \
  --format csv \
  --output ./results/btc-backtest

# Export to JSON with custom config
pnpm backtest \
  --start-date 2025-01-01 \
  --end-date 2025-06-30 \
  --initial-capital 10000 \
  --config ./config/aggressive.json \
  --format json \
  --output ./results/btc-backtest.json
```

## File Structure

```
src/commands/backtest/
├── backtest.ts           # Main CLI command
├── backtest.test.ts      # CLI tests
├── output.ts             # Console output formatting
├── export.ts             # CSV and JSON export
└── index.ts              # Re-exports
```

## Dependencies

- `commander` (already installed for CLI framework)

## Validation

- [ ] CLI command parses options correctly
- [ ] Console output is well-formatted
- [ ] CSV export produces valid CSV files
- [ ] JSON export produces valid JSON
- [ ] Error handling for invalid inputs
- [ ] Unit tests pass

## References

- [MVP Roadmap](../README.md)
- [ADR-0016: Backtesting & Simulation](../../../../adrs/0016-backtesting-simulation.md)
