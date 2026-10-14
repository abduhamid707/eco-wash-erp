# ECO WASH ERP — Implementation tracker

## Implemented (code on main)
- React admin interface with sign-in, operational forms, stock/dealer dashboard, reports, recipes, employees
- Node.js API with Prisma/PostgreSQL, user roles, idempotency and atomic transaction posting
- Product and raw-material registers, dealers, suppliers, money accounts
- Material receipts, shipments, dealer debt and payments, supplier liability and payments
- Versioned recipes and manufacturing postings
- Expense, cash receipt, cash transfers and owner-managed opening balances
- Reversal, dealer returns, stocktake adjustments and audit log
- Employees, attendance, salary/advance payments
- Excel multi-sheet export and period summary
- IndexedDB pending queue and basic PWA shell
- Docker beta stack and PostgreSQL smoke tests

## Not complete / not verified for real business use
- Legacy Excel import and owner-approved opening balances
- Full manufacturing cost / weighted-average stock valuation / actual profit statement
- Transport allocation, product variants, supplier returns, partial allocation of payments
- Automated reversal workflow for payroll / close accounting periods
- Full RBAC at UI-level and secure offline sessions on shared devices
- Network-conflict resolution UX, robust offline retry/auth refresh and encrypted local storage
- Production migrations, backup/restore, monitoring, automated browser tests, deployment hardening
- Real-user UAT, local inspection and end-to-end acceptance against ECO WASH historical ledgers

## Policy
Do not claim production readiness. All opening values and finance/cost rules require owner sign-off. CI verifies a subset of invariants, not exhaustive correctness.
