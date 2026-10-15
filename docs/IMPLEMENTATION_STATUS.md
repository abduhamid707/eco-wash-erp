# ECO WASH ERP — verified scope and remaining work

## GitHub implementation
- React dashboard, modules for employees, recipes, operations, registers, finance reports, reconciliation, import preview
- Fastify / Prisma / PostgreSQL with inventory and money transaction posting
- Dealer debts, supplier liabilities, payments, returns and reversible operations
- Manufacturing BOM versioning and staff attendance/advances
- Excel export plus import **template and dry-run validation** — not actual import
- PWA basic caching and IndexedDB offline pending queue tied to originating authenticated user
- Docker beta stack, CI compilation + database smoke checks

## Still required before sign-off
- Genuine, approved Excel migration into database (not implemented); mapping existing inconsistent labels and dates
- Product costing and trustworthy profit/loss statement (not implemented)
- Business acceptance of exchange rates, recipes, labor and transport treatment
- User management screens, detailed permissions, owner approval and period closing
- Security review of service-worker cache, IndexedDB data at rest, offline login and session expiry
- Retry queue conflict resolution and recovery on unstable internet/shared devices
- Full migrations, backup and restore drills, monitoring and production deployment
- Local walkthrough, UI/UX review, UAT and production-grade tests

**No claim of completion.** Compilation and smoke tests verify specific behaviors but cannot replace real ECO WASH ledger reconciliation and operator acceptance.
