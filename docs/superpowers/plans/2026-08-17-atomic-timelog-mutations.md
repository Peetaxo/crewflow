# Atomic Timelog Mutations — Implementation Plan

**Goal:** Replace split Supabase timelog writes with versioned atomic RPCs and a shared client mutation coordinator while preserving existing RLS and the constrained COO PowerApps import.

**Architecture:** Three ordinary timelog RPCs and the receipt transition RPC run as `SECURITY INVOKER`; nine narrowly authorized lifecycle/event/invoice/import endpoints run as `SECURITY DEFINER`. The complete tracked contract is 13 endpoints plus five catalog-verified helpers. Stable UUIDs plus `updated_at` provide optimistic concurrency. One client coordinator serializes create/save/status/delete/batch operations and reloads authoritative data after failures.

**Rule:** Each task starts with a focused failing test, records the expected RED reason, implements only the required behavior, and reruns the focused test before proceeding.

## Task 1: Specify SQL and Generated-Type Contracts

**Files:**

- Modify `src/features/events/services/event-assignment-lifecycle-migration.test.ts`
- Modify `src/lib/database.types.ts`
- Create `src/features/timelogs/services/timelog-mutation-rpc.service.test.ts`

1. Add static assertions for all four timelog RPC signatures, invoker/definer modes, empty search paths, exact grants/revokes, the non-callable trigger/helper, stable conflict tokens, deterministic locks, exact FK cascade, and exact assignment uniqueness.
2. Add compile/runtime adapter expectations for canonical UUID/version/status results and stable Czech error mapping.
3. Run focused tests and record RED caused by missing SQL/functions/types.

## Task 2: Implement Atomic Database Functions and Verifier

**Files:**

- Modify `supabase/migrations/20260817074631_timelog_assignment_lifecycle.sql`
- Modify `supabase/verify-timelog_assignment_lifecycle.sql`
- Modify `src/lib/database.types.ts`
- Create `src/features/timelogs/services/timelog-mutation-rpc.service.ts`

1. Add pre-function catalog guards for `timelog_days` cascade and exact assignment uniqueness.
2. Harden the timelog permission trigger with the COO-and-marker import branch and non-callable ACL.
3. Add atomic save, batch status, delete, and dedicated approved-import functions with validation, lock ordering, expected version/status checks, stable tokens, and exact ACLs.
4. Extend the rollback verifier for all four functions, direct COO REST denial, Crew denial, import authorization, exact retries/conflicts, ACLs, cascade behavior, and single-user temporary role switching.
5. Implement the typed RPC adapter and map expected tokens to stable Czech messages; log unexpected details only diagnostically.
6. Run static/adapter/type tests to GREEN and commit the database/API slice.

## Task 3: Add Stable Version Mapping and Shared Mutation Coordination

**Files:**

- Modify `src/types.ts`
- Modify `src/lib/supabase-mappers.ts`
- Modify mapper tests
- Modify `src/features/timelogs/services/timelogs.service.ts`
- Modify `src/features/timelogs/services/timelogs.service.test.ts`

1. Write RED tests for `Timelog.updatedAt`, canonical RPC result mapping, no parent/child split writes, parent-only delete, atomic batch behavior, and stable Czech failures.
2. Add deferred overlap tests for autosave/save, status, delete, and batch; assert deterministic queue ordering and no nested queue deadlock.
3. Add RED conflict tests proving failed writes perform an authoritative reload that survives the initiating mutation generation.
4. Route create/save/status/delete/import/batch through internal RPC primitives and one shared coordinator whose global timelog-write key is reserved synchronously before identity hydration; retain local/pair/UUID keys for identity diagnostics and future partitioning.
5. Rerun focused service/mapper tests to GREEN and commit the client mutation slice.

## Task 4: Route PowerApps Approval Through the Dedicated Import

**Files:**

- Modify `src/features/invoices/services/approval-timelog-sync.service.ts`
- Modify `src/features/invoices/services/approval-timelog-sync.service.test.ts`
- Modify timelog service exports/tests as needed

1. Write RED tests showing PowerApps apply calls only the dedicated import path for both create and update.
2. Implement the route without falling back to generic approved save/create.
3. Verify direct COO REST-style transitions remain rejected by SQL tests.
4. Rerun focused invoice/timelog tests and commit.

## Task 5: Documentation, Verification, and Handoff

**Files:**

- Modify `docs/superpowers/specs/2026-08-17-timelog-assignment-lifecycle-design.md`
- Modify `docs/superpowers/plans/2026-08-17-timelog-assignment-lifecycle.md`
- Modify this plan if the implemented signature differs for a verified reason

1. Document the exact total of 13 public endpoints (nine definer, four invoker), five catalog-verified helpers, client-assigned event/receipt UUIDs, reset epochs, exact CAS, and the schema-first deployment gate.
2. Correct approval sync test paths to `src/features/invoices/services/approval-timelog-sync.service.test.ts`.
3. Run migration/static, adapter, mapper, timelog service, invoice sync, and relevant lifecycle suites.
4. Run TypeScript, focused lint, build, `git diff --check`, and inspect the final diff for raw-error leaks and unrelated files.
5. Commit documentation separately and report exact RED/GREEN evidence plus any remaining concern. Do not deploy.
