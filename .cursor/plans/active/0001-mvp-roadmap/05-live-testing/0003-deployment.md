---
name: Deployment
overview: Implement Dockerfile and Fly.io deployment configuration.
todos:
  - id: dockerfile
    content: Create production Dockerfile
    status: pending
  - id: flyio-config
    content: Create Fly.io configuration (fly.toml)
    status: pending
  - id: env-management
    content: Set up environment variable management for production
    status: pending
  - id: startup-migration
    content: Implement database migration on startup
    status: pending
  - id: deploy-script
    content: Create deployment script
    status: pending
  - id: lifecycle-management
    content: Move plan to implemented/ directory after completion (update todos, check validation boxes, update roadmap link, move file, delete from active/)
    status: pending
isProject: false
---

> **Note**: This plan is part of Phase 5 (Live Testing) in [MVP Roadmap](../README.md).

# Deployment

## Overview

Implement production deployment infrastructure using:
- Docker for containerization
- Fly.io for hosting
- Automated database migrations on startup

Reference: [ADR-0007: Infrastructure — Fly.io](../../../../../adrs/0007-infrastructure-flyio.md)

## Tasks

### 1. Dockerfile

Create `Dockerfile`:

```dockerfile
# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build
RUN pnpm build

# Production stage
FROM node:22-alpine AS production

WORKDIR /app

# Install pnpm for running migrations
RUN corepack enable && corepack prepare pnpm@latest --activate

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 bot

# Copy package files for production deps
COPY package.json pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built application
COPY --from=builder /app/dist ./dist

# Copy drizzle migrations
COPY drizzle ./drizzle
COPY drizzle.config.ts ./

# Copy startup script
COPY scripts/docker-entrypoint.sh ./

# Set permissions
RUN chmod +x docker-entrypoint.sh
RUN chown -R bot:nodejs /app

# Switch to non-root user
USER bot

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start application
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
```

### 2. Docker Entrypoint Script

Create `scripts/docker-entrypoint.sh`:

```bash
#!/bin/sh
set -e

echo "🚀 Starting funding rate arbitrage bot..."

# Run database migrations
echo "📦 Running database migrations..."
pnpm db:migrate

if [ $? -eq 0 ]; then
  echo "✅ Migrations completed successfully"
else
  echo "❌ Migration failed"
  exit 1
fi

# Start the application
echo "🏃 Starting application..."
exec "$@"
```

### 3. Fly.io Configuration

Create `fly.toml`:

```toml
app = "funding-rate-arb-bot"
primary_region = "ewr" # US East (New York)

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"
  PORT = "3000"
  LOG_LEVEL = "info"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = false # Keep running 24/7
  auto_start_machines = true
  min_machines_running = 1
  processes = ["app"]

  [http_service.concurrency]
    type = "connections"
    hard_limit = 25
    soft_limit = 20

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 512

[checks]
  [checks.health]
    grace_period = "30s"
    interval = "30s"
    method = "GET"
    path = "/health"
    port = 3000
    timeout = "10s"
    type = "http"

[metrics]
  port = 3000
  path = "/metrics"
```

### 4. Environment Variable Management

Create `scripts/fly-secrets.sh`:

```bash
#!/bin/bash
set -e

# Check if .env.production exists
if [ ! -f .env.production ]; then
  echo "Error: .env.production file not found"
  exit 1
fi

echo "Setting Fly.io secrets from .env.production..."

# Read .env.production and set secrets
while IFS='=' read -r key value; do
  # Skip comments and empty lines
  [[ "$key" =~ ^#.*$ ]] && continue
  [[ -z "$key" ]] && continue
  
  # Remove surrounding quotes from value
  value="${value%\"}"
  value="${value#\"}"
  
  echo "Setting secret: $key"
  fly secrets set "$key=$value" --app funding-rate-arb-bot
done < .env.production

echo "✅ Secrets set successfully"
```

Create `.env.production.example`:

```env
# Database
DATABASE_URL=postgres://user:password@host:port/database?sslmode=require

# Exchange API
COINBASE_API_KEY=your_api_key
COINBASE_API_SECRET=your_api_secret

# Alerting
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxx/xxx

# Optional: Telegram
# TELEGRAM_BOT_TOKEN=xxx
# TELEGRAM_CHAT_ID=xxx
```

### 5. Deployment Script

Create `scripts/deploy.sh`:

```bash
#!/bin/bash
set -e

echo "🚀 Deploying funding rate arbitrage bot to Fly.io..."

# Check if fly CLI is installed
if ! command -v fly &> /dev/null; then
  echo "Error: fly CLI not found. Install with: curl -L https://fly.io/install.sh | sh"
  exit 1
fi

# Check if logged in
if ! fly auth whoami &> /dev/null; then
  echo "Error: Not logged in to Fly.io. Run: fly auth login"
  exit 1
fi

# Run type checking
echo "📝 Running type check..."
pnpm typecheck

# Run tests
echo "🧪 Running tests..."
pnpm test:run

# Build to verify
echo "🔨 Building..."
pnpm build

# Deploy
echo "🚀 Deploying to Fly.io..."
fly deploy

# Check status
echo "📊 Checking deployment status..."
fly status

echo "✅ Deployment complete!"
echo ""
echo "Useful commands:"
echo "  fly logs        - View application logs"
echo "  fly status      - Check app status"
echo "  fly ssh console - SSH into the machine"
echo "  fly secrets list - List configured secrets"
```

### 6. GitHub Actions Workflow (Optional)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Fly.io

on:
  push:
    branches:
      - main
  workflow_dispatch:

jobs:
  deploy:
    name: Deploy
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
      
      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: latest
      
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      
      - name: Type check
        run: pnpm typecheck
      
      - name: Run tests
        run: pnpm test:run
      
      - name: Setup Fly.io
        uses: superfly/flyctl-actions/setup-flyctl@master
      
      - name: Deploy to Fly.io
        run: flyctl deploy --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

## File Structure

```
/
├── Dockerfile
├── fly.toml
├── .env.production.example
├── scripts/
│   ├── docker-entrypoint.sh
│   ├── fly-secrets.sh
│   └── deploy.sh
└── .github/
    └── workflows/
        └── deploy.yml
```

## Dependencies

- Fly.io CLI (`fly`)
- Docker (for local testing)

## Validation

- [ ] Docker image builds successfully
- [ ] Database migrations run on startup
- [ ] Health check endpoint works
- [ ] Metrics endpoint works
- [ ] Deployment to Fly.io succeeds
- [ ] Application runs 24/7 without stopping

## References

- [MVP Roadmap](../README.md)
- [ADR-0007: Infrastructure — Fly.io](../../../../../adrs/0007-infrastructure-flyio.md)
