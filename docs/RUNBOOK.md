# ECO WASH ERP — Development and operations runbook

## Prerequisites
Node 22+, pnpm 9, Docker Engine + Compose.

## CI
GitHub Actions builds web/API and boots PostgreSQL for smoke tests on every push.

## All-in-one local beta
1. Copy `.env.example` to `.env`.
2. Set a new random `POSTGRES_PASSWORD` and a `JWT_SECRET` of at least 32 characters. Database URL in root .env is only for host-side tools.
3. Run `docker compose -f docker-compose.full.yml up -d --build`.
4. Web: `http://localhost:8080`; API is proxied at `/api`.
5. Administrator creation (once, on an empty database): `docker compose -f docker-compose.full.yml exec -e BOOTSTRAP_LOGIN=<login> -e BOOTSTRAP_PASSWORD=<strong-password> api pnpm --filter @eco/api bootstrap`.

**Do not use the beta Compose definition in production.** It uses `prisma db push`, has no automated backup/restore, TLS ingress, centralized logs, or released SQL migrations yet.

## Transaction and offline rules
- Offline commands are queued locally, never reflected in official server balances before posting.
- Reconnect and press the explicit sync control. Rejected commands must be reviewed.
- The offline queue is on the device and should be cleared when handing it over; shared or stolen device protection is not production-complete.
- All financial amounts are transmitted as decimal strings; PostgreSQL is authoritative.

## Release gate
Migration SQL, backup/restore drills, audited starting balances, agreed cost accounting, user-acceptance tests, pen-test of auth/session/offline, and rollback deployment must pass before production.
