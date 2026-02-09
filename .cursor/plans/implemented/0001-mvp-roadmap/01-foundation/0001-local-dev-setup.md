---
name: Local Development Setup
overview: Set up local development environment with Docker Compose for PostgreSQL and update setup scripts.
todos:
  - id: docker-compose
    content: Create docker-compose.yml for local Postgres
    status: completed
  - id: update-setup-script
    content: Update scripts/setup.sh to check for Docker
    status: completed
  - id: npm-scripts
    content: Add npm scripts for database management (db:up, db:down)
    status: completed
  - id: document-workflow
    content: Document local dev workflow in README
    status: completed
isProject: false
---

> **Note**: This plan is part of Phase 1 (Foundation) in [MVP Roadmap](../../../active/0001-mvp-roadmap/README.md).

# Local Development Setup

## Overview

Set up a local development environment using Docker Compose to run PostgreSQL. This provides a consistent database setup for all developers and simplifies onboarding.

## Tasks

### 1. Create `docker-compose.yml`

Create a Docker Compose configuration file at the project root:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: funding-rate-arb-postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: funding_rate_arb
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

### 2. Update `scripts/setup.sh`

Add Docker installation check and automatic Postgres container startup:

```bash
#!/bin/bash
set -e

# Check for Docker
if ! command -v docker &> /dev/null; then
  echo "Error: Docker is not installed. Please install Docker first."
  exit 1
fi

# Check for docker-compose
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
  echo "Error: docker-compose is not installed. Please install docker-compose first."
  exit 1
fi

# Start Postgres if docker-compose.yml exists
if [ -f "docker-compose.yml" ]; then
  echo "Starting PostgreSQL with Docker Compose..."
  docker compose up -d postgres
  echo "Waiting for PostgreSQL to be ready..."
  sleep 5
fi

# Rest of setup script...
```

### 3. Add NPM Scripts

Update `package.json` to include convenience scripts for Docker:

```json
{
  "scripts": {
    "db:up": "docker compose up -d postgres",
    "db:down": "docker compose down",
    "db:logs": "docker compose logs -f postgres"
  }
}
```

### 4. Document Local Dev Workflow

Add a section to the main `README.md`:

```markdown
## Local Development

### Prerequisites

- Docker and Docker Compose
- Node.js (see `.node-version`)
- pnpm

### Setup

1. Clone the repository
2. Run `./scripts/setup.sh` (starts Postgres automatically)
3. Copy `.env.example` to `.env` and fill in values
4. Run `pnpm install`
5. Run `pnpm db:migrate` to set up the database

### Starting Services

```bash
# Start Postgres
pnpm db:up

# Stop Postgres
pnpm db:down
```

### Database Access

- Host: `localhost`
- Port: `5432`
- User: `postgres`
- Password: `postgres`
- Database: `funding_rate_arb`
```

## Dependencies

- Docker
- Docker Compose

## Validation

- [x] Docker Compose starts Postgres successfully
- [x] `scripts/setup.sh` detects Docker installation
- [x] `scripts/setup.sh` automatically starts Postgres container
- [x] README documents local dev workflow clearly
- [x] New developers can follow README to get started

## References

- [MVP Roadmap](../../../active/0001-mvp-roadmap/README.md)
- [ADR-0005: Database Strategy](../../../../../adrs/0005-database-strategy.md)
- [ADR-0006: Drizzle ORM](../../../../../adrs/0006-drizzle-orm.md)
