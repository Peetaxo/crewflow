# Lifecycle `COALESCE` Hotfix Design

**Date:** 2026-08-19  
**Status:** Approved design; implementation pending  
**Scope:** Correct the invalid schema-qualified `COALESCE` expressions discovered by the linked production database lint after migration `20260817074631_timelog_assignment_lifecycle.sql` was applied. No application or data-model behavior changes.

## Context and root cause

The production migration completed, including the guarded duplicate cleanup and lifecycle schema installation. The immediately following command

```bash
supabase db lint --linked --level error --fail-on error
```

reported errors in five public RPCs. Source inspection found the same defect in one trigger helper. `COALESCE` is a PostgreSQL conditional expression rather than a normal function and therefore cannot be called as `pg_catalog.coalesce(...)`. PL/pgSQL accepted the function definitions, but the affected embedded statements fail when parsed by the linter or executed.

The affected exact signatures and expected invalid-expression counts are:

| Signature | Count |
| --- | ---: |
| `public.transition_receipt_statuses_atomic(jsonb,public.receipt_status,public.receipt_status)` | 1 |
| `public.handle_timelog_approved()` | 8 |
| `public.create_invoice_atomic(jsonb,jsonb,jsonb,jsonb)` | 2 |
| `public.mark_invoice_sent_atomic(uuid,timestamptz,timestamptz)` | 2 |
| `public.mark_invoice_paid_atomic(uuid,public.invoice_status,timestamptz,timestamptz)` | 2 |
| `public.delete_invoice_atomic(uuid,public.invoice_status,timestamptz)` | 2 |

## Chosen correction

Add one new tracked migration; do not edit the already-applied lifecycle migration. The corrective migration will:

1. Resolve exactly the six signatures above from `pg_catalog.pg_proc`.
2. Fail before making changes if a signature is missing, duplicated, or contains a different number of `pg_catalog.coalesce(` expressions than expected.
3. Read each complete definition with `pg_catalog.pg_get_functiondef`, replace only `pg_catalog.coalesce(` with the valid unqualified `coalesce(` expression, and execute the resulting `CREATE OR REPLACE FUNCTION` statement.
4. Verify that none of the six installed function bodies still contains the invalid expression.

`CREATE OR REPLACE FUNCTION` preserves the existing function identity, owner, grants, trigger dependency, and endpoint signature. The full generated definition preserves each function's `SECURITY DEFINER` or `SECURITY INVOKER` mode and empty `search_path`. The migration changes no table rows, policies, constraints, or application contracts.

The rollback verifier will receive the same mechanical replacement for every `pg_catalog.coalesce(` occurrence so it can run to completion. Its transaction and final `ROLLBACK` remain unchanged.

## Alternatives rejected

- Copy all six complete function bodies into a second migration: deterministic but creates a large duplicated SQL surface that is easier to drift or review incorrectly.
- Edit the applied lifecycle migration: breaks migration-history immutability and would not repair the already-installed production functions.
- Ignore the lint findings: leaves runtime paths capable of failing and blocks the required verifier.

## Test and deployment gates

1. Add a static regression test first and observe RED for the missing correction and invalid verifier expressions.
2. Implement the corrective migration and verifier replacement; focused migration tests must pass.
3. Run TypeScript/static checks, build, and diff checks required by the existing lifecycle runbook.
4. Confirm `supabase db push --linked --dry-run` lists only the corrective migration, then apply it.
5. Re-run linked database lint, security and performance advisors, and the authenticated rollback verifier.
6. Verify zero duplicate `(event_id, contractor_id)` groups, the exact unique constraint, and the retained Red Bull canonical timelog.

Frontend deployment remains blocked until every database gate above passes.
