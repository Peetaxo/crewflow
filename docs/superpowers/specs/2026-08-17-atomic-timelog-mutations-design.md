# Atomic Timelog Mutations — Design

**Date:** 2026-08-17
**Status:** Implemented locally; production deployment blocked on schema-first verification
**Scope:** Supabase timelog writes, PowerApps approval import, client mutation ordering, generated database types, verifier, and deployment runbook. No production deployment.

## Problem

The existing Supabase write path splits one logical timelog mutation across several HTTP requests. Creating a parent before its days can leave an orphan parent, saving can update the parent and delete all days before a replacement insert fails, and child-first deletion can leave an empty parent. Concurrent autosave, status, batch, and delete requests can also complete out of intent order. UI request identifiers hide stale callbacks but do not make the database mutation atomic or serialize writes for the same timelog.

## Goals

- Make parent-plus-days create and save one database transaction.
- Apply batch status changes all-or-nothing after validating the exact UUID/version set.
- Delete only the parent in one request and rely on the verified `timelog_days.timelog_id ... ON DELETE CASCADE` constraint.
- Reject stale writers with an optimistic `updated_at` precondition.
- Serialize every client mutation that can target the same timelog.
- Keep ordinary writes `SECURITY INVOKER`, so existing RLS and workflow triggers remain authoritative.
- Preserve the COO-only PowerApps approved-import workflow without widening direct COO REST permissions.
- Never expose raw database or RLS text to users.

## Public RPC Contract

The tracked lifecycle schema now exposes exactly 13 authenticated endpoints. Nine are `SECURITY DEFINER`: `assign_event_crew`, `remove_event_crew`, `approve_event_withdrawal`, `import_approved_timelog_atomic`, `delete_event_atomic`, `create_invoice_atomic`, `mark_invoice_sent_atomic`, `mark_invoice_paid_atomic`, and `delete_invoice_atomic`. Four are `SECURITY INVOKER`: `save_timelog_atomic`, `transition_timelog_statuses_atomic`, `transition_receipt_statuses_atomic`, and `delete_timelog_atomic`.

The catalog verifier also checks exactly five helpers: authenticated `SECURITY INVOKER` authorization helper `can_edit_timelog_data`, plus owner-only, non-API-callable `SECURITY DEFINER` helpers `enforce_event_application_lifecycle_update`, `enforce_timelog_update_permissions`, `enforce_receipt_lifecycle_update`, and `handle_timelog_approved`.

### `save_timelog_atomic`

`SECURITY INVOKER`, fixed empty search path, authenticated-only ACL. It accepts stable timelog/event/contractor UUIDs, the expected `updated_at` and status for updates, editable parent fields, a requested status, and a JSON day array.

For create, the expected version/status are null and the requested status must be `draft`. The function takes the event/profile pair advisory lock before inserting the draft parent. For update, it takes the pair lock and then locks the exact parent row. It requires exact identity, version, and source status. Identity is immutable. Days must be non-empty, structurally valid, and processed in deterministic date/time/type order; multiple distinct shifts on one date remain valid.

The update order is parent data while retaining the old status, replace all days, and only then perform any status transition. The returned object contains canonical `id`, `updated_at`, and effective `status`.

### `transition_timelog_statuses_atomic`

`SECURITY INVOKER`, fixed empty search path, authenticated-only ACL. It receives a non-empty JSON target set of `{id, expected_updated_at}`, one exact expected source status, and one requested destination status. Duplicate or malformed targets are rejected. Rows are locked by sorted UUID, and the complete target set, versions, and statuses are validated before a single all-or-nothing update. The result is a deterministic array of `id`, `updated_at`, and effective `status`.

Invoice creation, payment, and draft-invoice deletion use this same RPC for `approved -> invoiced`, `invoiced -> paid`, and `invoiced -> approved`; invoice services do not perform direct timelog REST status writes.

### `delete_timelog_atomic`

`SECURITY INVOKER`, fixed empty search path, authenticated-only ACL. It locks the exact parent and requires exact `updated_at` and source status. Only `draft` and `rejected` are disposable; `pending_ch` and every later state fail closed even when an older RLS policy would otherwise permit deletion. It deletes the parent once; day deletion is exclusively the verified cascading foreign key's responsibility.

### `import_approved_timelog_atomic`

`SECURITY DEFINER`, fixed empty search path, authenticated-only ACL. This is the sole PowerApps approved-import escape hatch. It explicitly requires non-null `auth.uid()` and the COO role, validates exact identity/payload/days/version, and never grants an auth-null or generic service bypass.

Create inserts the parent as `draft`, inserts deterministic validated days, and changes to `approved` last. Existing eligible rows receive parent data and replacement days while retaining their source status, followed by the final `approved` update. This ordering ensures approval-side invoice logic observes the new day set.

An already `approved` or `invoiced` row is never edited by import. After locking it, the RPC accepts only an exact retry whose expected status/version, identity, km, note, and normalized day set all match; it returns the existing row without enabling the marker or firing update/invoice effects. Any difference is an optimistic conflict. A `pending_coo` import first updates data and days while retaining `pending_coo`, then requests `approved`; the existing approval trigger can therefore create the invoice and return the actual canonical `invoiced` status.

The existing timelog permission trigger recognizes a transaction-local import marker only while the caller is a verified COO. The import RPC saves and restores the prior marker on both success and exception paths. The marker helper and trigger are not directly executable, and direct COO REST data edits or `draft -> approved` updates remain blocked.

## Locking and Optimistic Concurrency

Create is keyed by the event/contractor UUID pair; existing rows use the stable timelog UUID. Database functions take pair locks before row locks and sort multi-row locks by UUID. Updates and deletes compare the caller's expected `updated_at` after locking. A stale version or state produces a stable conflict token; it never silently overwrites newer data.

The client maintains one shared mutation coordinator with a global timelog-write key. Every create/save/status/delete/import/batch mutation reserves that key synchronously before any identity hydration, so a legacy snapshot without UUID/version cannot be overtaken or reindexed mid-write. Pair, local-ID, and UUID keys are also recorded for stable identity and future partitioning, while the global key deliberately serializes all client-side timelog writes. Internal RPC primitives never enqueue themselves, avoiding nested queue deadlocks.

Mutation generation advances when a queued operation starts. On a failed mutation, an authoritative reload is mandatory. That reload commits only after observing a stable generation and is not discarded merely because the failed mutation advanced its own generation.

## Error Contract

Expected SQL failures use stable tokens, including invalid payload, not found/access denied, optimistic conflict, unsafe delete state, and unauthorized import. The TypeScript boundary maps them to Czech domain messages. Unexpected Supabase details are logged to the console for diagnosis but are never returned as user-visible text.

## Security and Verification

- Generic timelog save/status/delete and receipt status functions remain `SECURITY INVOKER`; no direct COO RLS rights are added.
- Each of the nine `SECURITY DEFINER` endpoints rechecks its exact authenticated role contract internally and uses an empty search path.
- All 13 endpoints revoke `PUBLIC` and `anon`, granting exact execution only to `authenticated`.
- The four trigger/private `SECURITY DEFINER` helpers revoke execution from `PUBLIC`, `anon`, and `authenticated`; `can_edit_timelog_data` has only its reviewed authenticated ACL.
- Catalog checks require the exact day cascade FK and exact `UNIQUE(event_id, profile_id)` assignment conflict target before function installation.
- The rollback verifier creates no permanent fixtures and remains runnable with the single existing Crew-only auth user by adding/removing temporary CrewHead and COO roles inside `BEGIN ... ROLLBACK`.

## Deployment and Rollback

Schema is deployed and verified before application code that calls the RPCs. Application deployment is blocked until all 13 endpoint signatures, all five helper mode/search-path/ACL contracts, constraints, RLS policies, and adversarial verifier assertions pass. The versioned event-delete signature is `delete_event_atomic(uuid,timestamptz)`; the obsolete UUID-only overload must not exist. Rollback is code-first because the released client depends on the RPC schema; database function removal is only considered after the old client is restored.

## Test Strategy

Tests are written RED before implementation and cover:

- SQL signatures, invoker/definer modes, empty search paths, exact ACLs, constraints, marker containment, validation, locks, and update ordering;
- RPC adapters, stable tokens, generated types, and canonical `updated_at` mapping;
- create/save/delete/status partial-failure behavior without child-first or multi-request writes;
- deferred overlapping autosave/status/delete and deterministic batch coordination;
- optimistic conflicts followed by an authoritative reload;
- direct COO REST denial versus successful dedicated PowerApps import;
- focused lint, TypeScript, build, migration verifier, and final diff review.
