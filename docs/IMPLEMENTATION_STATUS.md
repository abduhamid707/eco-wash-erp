# Implementation status

## Implemented in code (NOT yet end-to-end verified)
- JWT login, role gates, owner bootstrap CLI
- Product/dealer/account registers
- Atomic inventory receipt and shipment with stock limit
- Dealer receivables posting and payments
- Cash receipt, expense, account transfer
- Serializable transaction, advisory lock, idempotency hash, audit log
- Dashboard balances and operation history
- CI build workflow

## Blockers before any real operation
- CI and actual DB migration verification
- Opening balances and import from approved Excel
- Full production BOM/recipes and versioned cost accounting
- Supplier liabilities, payroll, attendance, staff/shift records
- Reversals, returns, adjustments and automated reconciliation
- Excel exports, richer dashboard, actual offline PWA queue
- Session hardening, backups, monitoring, deployment and full QA

## Important
Do not populate production or report production readiness yet. Opening balances and business definitions must be confirmed by ECO WASH owner.
