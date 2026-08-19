# Timelog Assignment Lifecycle Design

**Date:** 2026-08-17  
**Status:** Approved design  
**Scope:** Crew assignment, withdrawal, draft timelog cleanup, duplicate prevention, and production data repair

## Context

A Crew user could not submit a draft timelog for review because the client reached an inconsistent assignment/timelog state and Supabase rejected the write through row-level security. The event date was not the cause: the live `draft -> pending_ch` transition succeeds for the affected Crew identity when executed against the intended row.

The investigation found two related integrity problems:

- assignment approval and timelog creation are separate client-side operations, so repeated or concurrent requests can create duplicate timelogs;
- removing and later re-adding Crew does not have one atomic lifecycle operation that keeps the assignment, application, timelog, and event capacity in sync.

The live database currently contains nine duplicate `(event_id, contractor_id)` groups with thirteen excess timelog rows. Eight groups are exact copies. One historical group has divergent data where one approved timelog is a subset of a more complete approved timelog. None of the duplicate rows is linked through `invoice_timelogs`.

## Goals

- Store at most one timelog for one Crew profile on one event.
- Make assignment approval idempotent under double-clicks, retries, multiple tabs, and concurrent clients.
- Remove a Crew member only while their timelog is still disposable.
- Delete the disposable timelog when Crew is removed so a later re-application starts with a clean draft.
- Preserve submitted, approved, invoiced, and paid work records.
- Keep direct manager removal atomic and approve a Crew withdrawal only through an application-scoped database operation.
- Repair existing duplicates without losing the more complete historical record.
- Return clear Czech domain errors instead of leaking raw RLS messages to the user.

## Non-goals

- Resetting all historical timelogs merely because the application is still in testing.
- Changing the timelog approval state machine beyond the removal rules in this document.
- Reworking invoice calculation or historical invoice records.
- Removing the temporary legacy read fallback that can infer event crew from timelogs. New mutations will use explicit assignments, while removing that read fallback can be handled separately after assignment data is fully backfilled.

## Confirmed Domain Rules

### Removable states

A Crew member may be removed from an event when every matching timelog is in one of these states:

- `draft`
- `rejected`

The removal deletes the timelog and its child `timelog_days`, removes the explicit assignment if present, marks the matching application `withdrawn` if present, and recalculates `events.crew_filled`.

### Blocking states

Removal is rejected without changing any data when any matching timelog is in one of these states:

- `pending_ch`
- `pending_crew_confirmation`
- `pending_coo`
- `approved`
- `invoiced`
- `paid`

The user-facing error is:

> Crew nelze odebrat, protože výkaz už byl odeslán ke kontrole.

An approved or later timelog is a historical work record, so removing that person from the event no longer has useful operational meaning.

### Re-application

After a successful removal, the existing application can be upserted back to `pending`. When management approves it again, the system creates one explicit assignment and one new clean draft timelog. The previously removed draft is not restored.

## Architecture

### Database as the consistency boundary

Assignment approval, direct removal, and withdrawal approval are exposed as three narrowly scoped Supabase RPC functions. Each call runs in a single short Postgres transaction. The frontend no longer coordinates the invariant through several independent REST writes.

The functions are intentionally privileged multi-table domain operations. They must:

- check `auth.uid()` explicitly;
- require `crewhead` or `coo` through `public.has_role`;
- use a fixed `search_path`;
- expose execution only to `authenticated` and revoke it from `public` and `anon`;
- accept only event/profile/application identifiers and validated initial timelog data;
- never provide a generic write or arbitrary SQL capability.

This is a deliberate use of privileged database code for an atomic invariant, not a workaround that bypasses authorization after an RLS error.

### Assignment approval RPC

The assignment operation receives an event ID, Crew profile ID, optional application ID, and the initial timelog days selected by the manager workflow.

Inside one transaction it:

1. validates the authenticated manager and referenced event/profile;
2. serializes the `(event_id, profile_id)` operation with a transaction-scoped advisory lock or equivalent deterministic row lock;
3. inserts `event_assignments` with `ON CONFLICT DO NOTHING`;
4. inserts a `draft` timelog only when one does not already exist;
5. inserts initial `timelog_days` only for a newly created timelog;
6. updates the matching application to `approved` when one exists;
7. recalculates `events.crew_filled` from explicit assignments;
8. returns the canonical assignment and timelog identifiers.

When an application ID is supplied, the RPC locks that exact event/profile application before assignment and timelog rows. It accepts `pending`, conditionally changes it to `approved`, and returns `crew_application_conflict` if the status changed. An exact `approved` retry succeeds only when both assignment and timelog already exist; an inconsistent approved retry returns the same conflict without repairing or overwriting ambiguous state. Direct manager assignment may omit the application ID.

If a valid request is repeated, it returns the already existing assignment/timelog without resetting its data or status. If an unexpected submitted timelog exists without a valid assignment, the operation returns a domain conflict rather than overwriting the record.

### Direct removal RPC

`remove_event_crew(p_event_id uuid, p_profile_id uuid)` is reserved for intentional direct manager removal. It receives no application ID and therefore must not be used to approve a specific withdrawal request.

Inside one transaction it:

1. validates the authenticated manager;
2. takes the same deterministic `(event_id, profile_id)` lock used by assignment;
3. locks all matching timelog rows with `FOR UPDATE`;
4. rejects the entire transaction if any matching timelog has a blocking state;
5. deletes matching `draft` and `rejected` timelogs; `timelog_days` are removed through the existing cascading foreign key or an explicit child delete if the deployed constraint is not cascading;
6. deletes the matching explicit assignment if present;
7. updates a matching application to `withdrawn` if present;
8. recalculates `events.crew_filled` from explicit assignments;
9. returns whether an assignment and disposable timelog were removed.

The operation remains idempotent when the assignment or draft has already been removed.

### Withdrawal approval RPC

`approve_event_withdrawal(p_event_id uuid, p_profile_id uuid, p_application_id uuid)` approves one exact withdrawal request. It takes the same event/profile advisory lock as assignment and direct removal, locks the exact application plus assignment and timelog rows, and accepts only `withdrawal_requested`. It conditionally changes that application to `withdrawn`, removes only a `draft` or `rejected` timelog and the matching assignment, and recalculates `events.crew_filled` in the same transaction.

An exact retry is successful only when that same application is already `withdrawn` and both assignment and timelog are absent. Any other stale or internally inconsistent application state raises `crew_withdrawal_conflict`; a non-disposable timelog still raises `crew_removal_blocked` and leaves every row unchanged.

### Crew application transition trigger

RLS limits Crew users to their own application rows, while the `BEFORE UPDATE` trigger `enforce_event_application_lifecycle_update()` enforces the transition graph and immutable identity columns. A Crew user may keep the same status, withdraw `pending`, re-apply from `rejected` or `withdrawn`, or request withdrawal from `approved`. They cannot change `id`, `event_id`, `profile_id`, or `created_at`, and every other status change is rejected with `crew_lifecycle_unauthorized`. CrewHead and COO transitions are handled by the manager RPCs; internal migration/verifier work with `auth.uid() is null` is deliberately allowed.

The trigger function is `SECURITY DEFINER` with an empty search path and fully qualified calls, but it is not an API endpoint: execution is revoked from `PUBLIC`, `anon`, and `authenticated`. The three manager RPCs are also `SECURITY DEFINER`, explicitly re-check `auth.uid()` plus CrewHead/COO role membership, revoke `PUBLIC` and `anon`, and grant only `authenticated` execution.

### Database uniqueness

After existing data is repaired, `public.timelogs` receives a unique constraint named `timelogs_event_contractor_unique` over:

```sql
unique (event_id, contractor_id)
```

The constraint is the final concurrency guard. Client-side checks remain useful for immediate feedback but are never treated as the integrity boundary.

### Stable UUID identity

Supabase-mode event and timelog writes use canonical UUIDs throughout. Hydration preserves `event.supabaseId`, `timelog.supabaseId`, and `timelog.eventSupabaseId`; creation requires the event UUID, and save/status/delete paths locate the canonical timelog by UUID before considering local numeric IDs. Lifecycle refreshes reconcile the numeric local projection without replacing the stable UUID identity. This prevents a same-number local fixture or refreshed row from redirecting a production mutation.

## Existing Data Repair

The repair is explicit and assertion-driven rather than a generic “keep the first row” cleanup.

It runs in one transaction and performs these steps:

1. Assert the expected duplicate group count and the explicit source/canonical UUID mapping.
2. Assert each row's event, contractor, status, payload, normalized day set, and absence of `invoice_timelogs` links.
3. For the eight exact-copy groups, retain the explicitly selected canonical row and delete only verified copies.
4. For the one divergent historical group, retain the approved timelog containing the complete set of shifts and delete the verified subset row.
5. For Red Bull, retain the newer, most recently updated draft and delete the older exact copy.
6. Verify that no `(event_id, contractor_id)` duplicates remain.
7. Add the unique constraint only after the verification succeeds.

Any unexpected data change aborts the transaction, leaving the database untouched. The valid non-duplicate test data remains in place even though the application is not yet in production; this exercises the same safe migration discipline needed later.

## Frontend and Service Behavior

- `approveEventApplication` and direct manager assignment call `assign_event_crew` and refresh event, application, assignment, and timelog state from authoritative reads.
- `removeContractorFromEvent` calls `remove_event_crew`; `approveEventWithdrawal` requires the stable application UUID and calls `approve_event_withdrawal`.
- The removal button is disabled or replaced with explanatory text when the locally loaded timelog is in a blocking state.
- The database error is still mapped to the same Czech domain message because local state can be stale.
- UI actions use an in-flight state to prevent accidental repeated clicks, while database idempotency handles retries and concurrency.
- A uniqueness conflict that occurs during a race is resolved by reloading and returning the canonical existing timelog rather than showing a raw constraint or RLS error.
- Crew re-application and withdrawal-request upserts translate a trigger `crew_lifecycle_unauthorized` caused by stale local status into the operation-specific application or withdrawal conflict. Other database details are logged diagnostically and the UI receives the generic Czech lifecycle error; both EventDetailView and EventsView consume this shared service behavior.

## Error Handling

Expected database outcomes are mapped as follows:

| Condition | User-facing result |
|---|---|
| Timelog is already submitted or later | `Crew nelze odebrat, protože výkaz už byl odeslán ke kontrole.` |
| Assignment approval is repeated | Success with the existing assignment and timelog |
| Existing submitted timelog conflicts with a new assignment | `Výkaz pro tuto Crew a akci už existuje a nelze ho přepsat.` |
| Exact application is no longer `pending`, or an `approved` retry is inconsistent | `Stav přihlášky se mezitím změnil. Obnovte detail akce a zkuste to znovu.` |
| Exact withdrawal is no longer `withdrawal_requested`, or a `withdrawn` retry is inconsistent | `Stav žádosti o odhlášení se mezitím změnil. Obnovte detail akce a zkuste to znovu.` |
| Event or profile does not exist | `Akce nebo člen Crew nebyl nalezen.` |
| Unauthorized caller | `Tuto akci může provést pouze CrewHead nebo COO.` |
| Unexpected database failure | Generic Czech failure toast plus the original error in diagnostic logging |

No local cache is updated until the database operation succeeds. A failed RPC leaves both database and local state unchanged.

## Testing Strategy

### Service tests

- approval calls the RPC once and hydrates the returned canonical timelog;
- repeated approval returns the same timelog without adding another local row;
- direct removal calls the two-argument removal RPC and withdrawal approval calls the dedicated application-scoped RPC;
- successful removal deletes a local `draft` or `rejected` timelog and assignment;
- blocked removal preserves all local state and shows the domain error;
- stale Crew re-application and withdrawal-request trigger errors are mapped to their operation-specific Czech conflicts;
- raw RLS, unique-constraint, trigger, and RPC messages remain diagnostic-only.

### Database migration tests

- the migration contains the expected duplicate assertions before destructive statements;
- it aborts if an unexpected invoice link or payload difference is present;
- it retains the complete divergent historical timelog;
- no duplicate group remains after repair;
- the unique constraint rejects a second `(event_id, contractor_id)` row.

### Authorization and state-transition tests

- Crew cannot call any of the three manager RPCs;
- CrewHead and COO can call them;
- the trigger prevents Crew from changing application identity columns or performing any transition outside the allowed Crew graph;
- `draft` and `rejected` rows are removable;
- every blocking status rejects removal with no partial writes;
- a removed Crew member can apply and be approved again, producing exactly one new draft;
- two concurrent assignment calls produce one assignment and one timelog;
- stale approval and withdrawal requests return `crew_application_conflict` and `crew_withdrawal_conflict` without partial writes.

### Live verification

After deployment:

1. confirm Red Bull contains one draft for the affected Crew profile;
2. confirm there are zero duplicate `(event_id, contractor_id)` groups;
3. confirm the unique constraint exists;
4. execute a rolled-back Crew-authenticated `draft -> pending_ch` transition against the retained Red Bull row;
5. exercise removal of a disposable test draft and verify assignment/application/event capacity consistency;
6. exercise a blocked removal and verify no rows changed;
7. verify neither UI exposes raw RLS, uniqueness, trigger, or RPC errors and that unexpected database details remain diagnostic-only.

## Deployment Order

1. Add failing frontend/service and SQL structure tests.
2. Add the assertion-driven duplicate repair and unique constraint migration.
3. Add the hardened assignment, direct-removal, and withdrawal-approval RPCs plus the non-callable Crew transition trigger in the same migration or a following migration whose dependency is explicit.
4. Update generated database types.
5. Switch frontend services to the RPCs and add in-flight UI states/error mapping.
6. Run focused tests, then the full test suite and production build.
7. Confirm this design, the implementation plan/runbook, generated types, migration, verifier, and frontend all describe the same three-RPC/trigger/token contract; any drift is a production blocker.
8. Apply the migration once to the linked Supabase project.
9. Run the live verification checklist before considering the fix complete.

The frontend must not be deployed before the required RPC/schema migration is present, avoiding the schema drift already observed with newer client code requesting database objects that were not deployed.

## Acceptance Criteria

- No event/profile pair has more than one timelog.
- Repeated or concurrent assignment approval creates no duplicates.
- Removing Crew with `draft` or `rejected` work removes the disposable timelog and assignment atomically.
- Removing Crew with any submitted or later timelog is blocked atomically.
- Re-application after valid removal creates exactly one clean draft.
- Application approval and withdrawal approval are scoped to the exact application UUID and reject stale state with stable Czech conflicts.
- Crew application identity columns and disallowed status transitions remain immutable through the database trigger.
- Existing duplicate data is repaired according to explicit verified mappings.
- Red Bull submission works for the real Crew identity after cleanup.
- The UI does not expose raw RLS, uniqueness, trigger, or RPC errors for expected domain conflicts.
