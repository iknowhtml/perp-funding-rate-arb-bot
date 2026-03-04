---
name: Monitoring & Alerting
overview: Implement Discord and Telegram alerting for critical events and monitoring.
todos:
  - id: alert-types
    content: Define alert types and severity levels
    status: pending
  - id: discord-integration
    content: Implement Discord webhook integration
    status: pending
  - id: telegram-integration
    content: Implement Telegram bot integration (optional)
    status: pending
  - id: alert-routing
    content: Implement alert routing based on severity
    status: pending
  - id: rate-limiting
    content: Implement alert rate limiting to prevent spam
    status: pending
  - id: tests
    content: Add unit tests for alerting
    status: pending
  - id: lifecycle-management
    content: Move plan to implemented/ directory after completion (update todos, check validation boxes, update roadmap link, move file, delete from active/)
    status: pending
isProject: false
---

> **Note**: This plan is part of Phase 5 (Live Testing) in [MVP Roadmap](../README.md).

# Monitoring & Alerting

## Overview

Implement alerting for critical events to ensure the bot operator is notified of:
- Critical errors requiring immediate attention
- Risk limit violations
- Execution anomalies
- Health degradation

Reference: [ADR-0008: Monitoring & Observability](../../../../adrs/0008-monitoring-observability.md)

## Tasks

### 1. Alert Types

Create `src/lib/alerts/types.ts`:

```typescript
export type AlertSeverity = "critical" | "warning" | "info";

export type AlertType =
  | "STARTUP_COMPLETE"
  | "STARTUP_PAUSED"
  | "SHUTDOWN"
  | "KILL_SWITCH_TRIGGERED"
  | "REDUCE_ONLY_MODE"
  | "EXECUTION_BLOCKED"
  | "EXECUTION_ANOMALY"
  | "SLIPPAGE_ANOMALY"
  | "NOT_FLAT_AFTER_EXIT"
  | "RECONCILIATION_INCONSISTENCY"
  | "RISK_LIMIT_BREACH"
  | "WS_DISCONNECTED"
  | "WS_RECONNECTED"
  | "REST_FAILING"
  | "TRADE_ENTERED"
  | "TRADE_EXITED"
  | "DAILY_SUMMARY";

export interface Alert {
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}

export const ALERT_SEVERITY: Record<AlertType, AlertSeverity> = {
  STARTUP_COMPLETE: "info",
  STARTUP_PAUSED: "warning",
  SHUTDOWN: "info",
  KILL_SWITCH_TRIGGERED: "critical",
  REDUCE_ONLY_MODE: "warning",
  EXECUTION_BLOCKED: "warning",
  EXECUTION_ANOMALY: "critical",
  SLIPPAGE_ANOMALY: "warning",
  NOT_FLAT_AFTER_EXIT: "critical",
  RECONCILIATION_INCONSISTENCY: "warning",
  RISK_LIMIT_BREACH: "critical",
  WS_DISCONNECTED: "warning",
  WS_RECONNECTED: "info",
  REST_FAILING: "warning",
  TRADE_ENTERED: "info",
  TRADE_EXITED: "info",
  DAILY_SUMMARY: "info",
};
```

### 2. Discord Integration

Create `src/lib/alerts/discord.ts`:

```typescript
export interface DiscordConfig {
  webhookUrl: string;
  username?: string;
  avatarUrl?: string;
}

export const createDiscordClient = (config: DiscordConfig) => {
  const send = async (alert: Alert): Promise<void> => {
    const embed = formatDiscordEmbed(alert);

    const response = await fetch(config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: config.username ?? "Funding Bot",
        avatar_url: config.avatarUrl,
        embeds: [embed],
      }),
    });

    if (!response.ok) {
      throw new Error(`Discord webhook failed: ${response.status}`);
    }
  };

  return { send };
};

const formatDiscordEmbed = (alert: Alert) => {
  const colorMap: Record<AlertSeverity, number> = {
    critical: 0xff0000, // Red
    warning: 0xffa500, // Orange
    info: 0x00ff00, // Green
  };

  const emojiMap: Record<AlertSeverity, string> = {
    critical: "🚨",
    warning: "⚠️",
    info: "ℹ️",
  };

  return {
    title: `${emojiMap[alert.severity]} ${alert.title}`,
    description: alert.message,
    color: colorMap[alert.severity],
    timestamp: alert.timestamp.toISOString(),
    fields: alert.data
      ? Object.entries(alert.data).map(([key, value]) => ({
          name: key,
          value: String(value),
          inline: true,
        }))
      : [],
    footer: {
      text: `Funding Rate Arb Bot • ${alert.type}`,
    },
  };
};
```

### 3. Telegram Integration (Optional)

Create `src/lib/alerts/telegram.ts`:

```typescript
export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export const createTelegramClient = (config: TelegramConfig) => {
  const baseUrl = `https://api.telegram.org/bot${config.botToken}`;

  const send = async (alert: Alert): Promise<void> => {
    const message = formatTelegramMessage(alert);

    const response = await fetch(`${baseUrl}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: message,
        parse_mode: "HTML",
      }),
    });

    if (!response.ok) {
      throw new Error(`Telegram API failed: ${response.status}`);
    }
  };

  return { send };
};

const formatTelegramMessage = (alert: Alert): string => {
  const emojiMap: Record<AlertSeverity, string> = {
    critical: "🚨",
    warning: "⚠️",
    info: "ℹ️",
  };

  let message = `${emojiMap[alert.severity]} <b>${alert.title}</b>\n\n`;
  message += `${alert.message}\n\n`;

  if (alert.data) {
    for (const [key, value] of Object.entries(alert.data)) {
      message += `<b>${key}:</b> ${value}\n`;
    }
  }

  message += `\n<i>${alert.timestamp.toISOString()}</i>`;

  return message;
};
```

### 4. Alert Routing

Create `src/lib/alerts/service.ts`:

```typescript
export interface AlertServiceConfig {
  discord?: DiscordConfig;
  telegram?: TelegramConfig;
  routing: AlertRouting;
}

export interface AlertRouting {
  critical: ("discord" | "telegram")[];
  warning: ("discord" | "telegram")[];
  info: ("discord" | "telegram")[];
}

export interface AlertService {
  send(alert: Omit<Alert, "timestamp">): Promise<void>;
  sendCritical(data: { type: AlertType; title?: string; message?: string; data?: Record<string, unknown> }): Promise<void>;
  sendWarning(data: { type: AlertType; title?: string; message?: string; data?: Record<string, unknown> }): Promise<void>;
  sendInfo(data: { type: AlertType; title?: string; message?: string; data?: Record<string, unknown> }): Promise<void>;
}

export const createAlertService = (
  config: AlertServiceConfig,
  logger: Logger,
): AlertService => {
  const discordClient = config.discord ? createDiscordClient(config.discord) : null;
  const telegramClient = config.telegram ? createTelegramClient(config.telegram) : null;

  const send = async (alertData: Omit<Alert, "timestamp">): Promise<void> => {
    const alert: Alert = {
      ...alertData,
      timestamp: new Date(),
    };

    const channels = config.routing[alert.severity];

    const sendPromises: Promise<void>[] = [];

    if (channels.includes("discord") && discordClient) {
      sendPromises.push(
        discordClient.send(alert).catch((error) => {
          logger.error("Discord alert failed", error as Error);
        })
      );
    }

    if (channels.includes("telegram") && telegramClient) {
      sendPromises.push(
        telegramClient.send(alert).catch((error) => {
          logger.error("Telegram alert failed", error as Error);
        })
      );
    }

    await Promise.all(sendPromises);
  };

  const createAlert = (
    type: AlertType,
    severity: AlertSeverity,
    overrides?: { title?: string; message?: string; data?: Record<string, unknown> },
  ): Omit<Alert, "timestamp"> => {
    const defaults = getAlertDefaults(type);
    return {
      type,
      severity,
      title: overrides?.title ?? defaults.title,
      message: overrides?.message ?? defaults.message,
      data: overrides?.data,
    };
  };

  return {
    send,
    sendCritical: (data) => send(createAlert(data.type, "critical", data)),
    sendWarning: (data) => send(createAlert(data.type, "warning", data)),
    sendInfo: (data) => send(createAlert(data.type, "info", data)),
  };
};

const getAlertDefaults = (type: AlertType): { title: string; message: string } => {
  const defaults: Record<AlertType, { title: string; message: string }> = {
    STARTUP_COMPLETE: { title: "Bot Started", message: "Funding rate arbitrage bot is now running." },
    STARTUP_PAUSED: { title: "Bot Paused on Startup", message: "Bot started but paused due to uncertain state." },
    SHUTDOWN: { title: "Bot Shutdown", message: "Funding rate arbitrage bot has been stopped." },
    KILL_SWITCH_TRIGGERED: { title: "KILL SWITCH ACTIVATED", message: "All trading has been stopped due to critical condition." },
    REDUCE_ONLY_MODE: { title: "Reduce-Only Mode", message: "Bot is only allowing position exits." },
    EXECUTION_BLOCKED: { title: "Execution Blocked", message: "Trade execution was blocked." },
    EXECUTION_ANOMALY: { title: "Execution Anomaly", message: "Unusual behavior detected during execution." },
    SLIPPAGE_ANOMALY: { title: "Slippage Anomaly", message: "Realized slippage exceeded estimate." },
    NOT_FLAT_AFTER_EXIT: { title: "Position Not Flat", message: "Position remains after exit attempt." },
    RECONCILIATION_INCONSISTENCY: { title: "State Inconsistency", message: "Inconsistency detected during reconciliation." },
    RISK_LIMIT_BREACH: { title: "Risk Limit Breach", message: "Risk limits have been breached." },
    WS_DISCONNECTED: { title: "WebSocket Disconnected", message: "WebSocket connection lost." },
    WS_RECONNECTED: { title: "WebSocket Reconnected", message: "WebSocket connection restored." },
    REST_FAILING: { title: "REST API Failing", message: "REST API requests are failing." },
    TRADE_ENTERED: { title: "Trade Entered", message: "New hedge position entered." },
    TRADE_EXITED: { title: "Trade Exited", message: "Hedge position closed." },
    DAILY_SUMMARY: { title: "Daily Summary", message: "Daily performance summary." },
  };

  return defaults[type];
};
```

### 5. Rate Limiting

```typescript
export const createRateLimitedAlertService = (
  alertService: AlertService,
  config: { minIntervalMs: number; maxPerHour: number },
): AlertService => {
  const sentAlerts = new Map<AlertType, { count: number; lastSent: Date }>();

  const isRateLimited = (type: AlertType): boolean => {
    const record = sentAlerts.get(type);
    if (!record) return false;

    const timeSinceLastSent = Date.now() - record.lastSent.getTime();
    if (timeSinceLastSent < config.minIntervalMs) {
      return true;
    }

    // Reset count if an hour has passed
    if (timeSinceLastSent > 60 * 60 * 1000) {
      sentAlerts.delete(type);
      return false;
    }

    return record.count >= config.maxPerHour;
  };

  const recordAlert = (type: AlertType): void => {
    const record = sentAlerts.get(type);
    if (record) {
      record.count++;
      record.lastSent = new Date();
    } else {
      sentAlerts.set(type, { count: 1, lastSent: new Date() });
    }
  };

  const wrappedSend = async (alert: Omit<Alert, "timestamp">): Promise<void> => {
    // Never rate-limit critical alerts
    if (alert.severity === "critical" || !isRateLimited(alert.type)) {
      recordAlert(alert.type);
      await alertService.send(alert);
    }
  };

  return {
    send: wrappedSend,
    sendCritical: alertService.sendCritical, // Never rate-limited
    sendWarning: async (data) => {
      if (!isRateLimited(data.type)) {
        recordAlert(data.type);
        await alertService.sendWarning(data);
      }
    },
    sendInfo: async (data) => {
      if (!isRateLimited(data.type)) {
        recordAlert(data.type);
        await alertService.sendInfo(data);
      }
    },
  };
};
```

## Environment Variables

Add to `.env.example`:

```env
# Alerting
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxx/xxx
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=-1001234567890
```

## File Structure

```
src/lib/alerts/
├── types.ts              # Alert types and severity
├── discord.ts            # Discord webhook client
├── discord.test.ts
├── telegram.ts           # Telegram bot client
├── telegram.test.ts
├── service.ts            # Alert service with routing
├── service.test.ts
├── rate-limiter.ts       # Alert rate limiting
├── rate-limiter.test.ts
└── index.ts              # Re-exports
```

## Dependencies

```bash
# Prometheus metrics client for comprehensive monitoring
pnpm add prom-client
```

**Why `prom-client`?**
- Industry-standard Prometheus metrics format
- Supports counters, gauges, histograms, and summaries
- Enables grafana dashboards and alerting
- Low overhead for high-frequency metrics

**Core Metrics to Implement** (see [ADR-0008](../../../../adrs/0008-monitoring-observability.md)):
- `evaluation_latency_ms` (histogram) - Evaluation loop timing
- `execution_latency_ms` (histogram) - Order execution timing
- `position_size_cents` (gauge) - Current position size
- `funding_rate_bps` (gauge) - Current funding rate
- `ws_reconnects_total` (counter) - WebSocket reconnection count
- `orders_total` (counter, labeled by status) - Order counts
- `errors_total` (counter, labeled by type) - Error counts

## Validation

- [ ] Discord alerts sent correctly
- [ ] Telegram alerts sent correctly (optional)
- [ ] Alert routing works by severity
- [ ] Rate limiting prevents spam
- [ ] Critical alerts never rate-limited
- [ ] **Prometheus metrics exposed via prom-client**
- [ ] **Core metrics (evaluation latency, position size, funding rate) tracked**
- [ ] Unit tests pass

## References

- [MVP Roadmap](../README.md)
- [ADR-0008: Monitoring & Observability](../../../../adrs/0008-monitoring-observability.md)
