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

## ECO WASH legacy workbook review
The four historical Excel files contain side-by-side date snapshots and mixed financial conventions. They must not be imported by copying every cell as an operation.

Run the read-only converter with real filenames on a trusted machine:

```bash
pnpm --filter @eco/api legacy:review -- "/path/ECO WASH HISOBOT. Y(1).xlsx" "/path/Hisob k.xlsx" "/path/Viloyatlar qarzi.xlsx" "/path/KAMOLIDDIN AKA RASXOD.xlsx" "/path/eco-wash-legacy-review.xlsx"
```

The output marks latest raw/finished stock candidates, dealer debt candidates, shipments, staff and expense rows. **It does not change PostgreSQL**. Only the owner-reviewed values should be pasted into the generated `Import shablon`, with correct units and duplicate names resolved. The app performs another validation and requires owner confirmation before a one-time opening import.

Do not commit historic source Excel files, bank balances or generated review workbooks to the public GitHub repository.
