# ECO WASH ERP architecture

## Decision

React is the only authorized interface for operational writes. PostgreSQL is the source of truth. Google Sheets is not used. Excel is a generated export only.

## Offline behavior (required, not yet implemented)

- PWA caches the application shell and locally stores draft commands in IndexedDB.
- Every command has a client-generated idempotency key and immutable payload.
- UI shows **On device**, **Syncing**, **Server confirmed**, or **Needs review** independently.
- Never show queued commands as final balances. Revalidate stock, permissions, prices, recipe version, and account balances on the server.
- Conflicts are visible and require review; never silently overwrite another user's changes.
- Login/bootstrap must be completed online; offline access must be restricted to previously authorized device/session and limited time, with encryption and loss-of-device policy before production.

## Financial accuracy (required, not yet implemented)

- Financial values use PostgreSQL DECIMAL, no binary float for financial math.
- Inventory uses immutable signed movements; balance is computed from movements (or a transactionally maintained projection).
- All multi-leg postings are atomic in one database transaction with appropriate row locks/serialization and retry policy.
- The idempotency key must be enforced by a unique constraint. Retrying the same command returns the prior result; changed payload for the same key is rejected.
- Reversals create compensating postings and linked audit events; no destructive history edits.
- Dealer receivables, supplier payables, payroll accruals, cash transfers, cost accounting, and recipe versioning require approved business rules before enabling endpoints.
- Start-of-day and end-of-day reconciliation compares exported reports with approved opening balances and movements.

## Development gates

1. Confirm costing, unit conversions, USD exchange-rate policy, recipe versions, shipment liability, payroll, and expense classification.
2. Implement users/auth/RBAC and immutable transaction posting with tests.
3. Implement inventory, production, shipments, payments, and accounting invariants.
4. Implement offline queue, conflict handling, status UI, export, import validation, backups and restore drills.
5. Compare approved Excel baselines before production use.
