# ECO WASH ERP

Factory management system for inventory, production, dealer shipments and debts, cash movements, employee attendance, and Excel reporting.

## Architecture

- `apps/web` — React + TypeScript + PWA
- `apps/api` — Node.js + Fastify + Prisma
- `packages/shared` — shared business contracts
- PostgreSQL is the source of truth; Excel is **export only**.

> Work in progress. Do not use with real financial transactions until business rules, migration balances, offline synchronization, and acceptance tests are verified.

## Development

Requires Node.js 22+, pnpm 9+, Docker.

```bash
cp .env.example .env
docker compose up -d db
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

The system must never treat a locally queued offline operation as server-confirmed. Financial postings must have idempotency keys and use database transactions.
