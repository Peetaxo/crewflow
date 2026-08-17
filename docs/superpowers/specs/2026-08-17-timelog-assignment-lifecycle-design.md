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
- Use the same database operation for direct manager removal and approval of a withdrawal request.
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

Assignment approval and removal will be exposed as narrowly scoped Supabase RPC functions. Each call runs in a single short Postgres transaction. The frontend will no longer coordinate the invariant through several independent REST writes.

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

If the request is repeated, it returns the already existing assignment/timelog without resetting its data or status. If an unexpected submitted timelog exists without a valid assignment, the operation returns a domain conflict rather than overwriting the record.

### Removal RPC

The removal operation receives an event ID and Crew profile ID. It is used by both direct manager removal and approval of a Crew withdrawal request.

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

### Database uniqueness

After existing data is repaired, `public.timelogs` receives a unique constraint named `timelogs_event_contractor_unique` over:

```sql
unique (event_id, contractor_id)
```

The constraint is the final concurrency guard. Client-side checks remain useful for immediate feedback but are never treated as the integrity boundary.

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

- `approveEventApplication` and direct manager assignment call the assignment RPC and refresh event, application, assignment, and timelog query caches from the returned result.
- `removeContractorFromEvent` and `approveEventWithdrawal` call the same removal RPC.
- The removal button is disabled or replaced with explanatory text when the locally loaded timelog is in a blocking state.
- The database error is still mapped to the same Czech domain message because local state can be stale.
- UI actions use an in-flight state to prevent accidental repeated clicks, while database idempotency handles retries and concurrency.
- A uniqueness conflict that occurs during a race is resolved by reloading and returning the canonical existing timelog rather than showing a raw constraint or RLS error.

## Error Handling

Expected database outcomes are mapped as follows:

| Condition | User-facing result |
|---|---|
| Timelog is already submitted or later | `Crew nelze odebrat, protože výkaz už byl odeslán ke kontrole.` |
| Assignment approval is repeated | Success with the existing assignment and timelog |
| Existing submitted timelog conflicts with a new assignment | `Výkaz pro tuto Crew a akci už existuje a nelze ho přepsat.` |
| Event or profile does not exist | `Akce nebo člen Crew nebyl nalezen.` |
| Unauthorized caller | `Tuto akci může provést pouze CrewHead nebo COO.` |
| Unexpected database failure | Generic Czech failure toast plus the original error in diagnostic logging |

No local cache is updated until the database operation succeeds. A failed RPC leaves both database and local state unchanged.

## Testing Strategy

### Service tests

- approval calls the RPC once and hydrates the returned canonical timelog;
- repeated approval returns the same timelog without adding another local row;
- direct removal and withdrawal approval call the same removal service;
- successful removal deletes a local `draft` or `rejected` timelog and assignment;
- blocked removal preserves all local state and shows the domain error;
- raw RLS, unique-constraint, and RPC messages are mapped to stable Czech messages.

### Database migration tests

- the migration contains the expected duplicate assertions before destructive statements;
- it aborts if an unexpected invoice link or payload difference is present;
- it retains the complete divergent historical timelog;
- no duplicate group remains after repair;
- the unique constraint rejects a second `(event_id, contractor_id)` row.

### Authorization and state-transition tests

- Crew cannot call manager assignment/removal RPCs;
- CrewHead and COO can call them;
- `draft` and `rejected` rows are removable;
- every blocking status rejects removal with no partial writes;
- a removed Crew member can apply and be approved again, producing exactly one new draft;
- two concurrent assignment calls produce one assignment and one timelog.

### Live verification

After deployment:

1. confirm Red Bull contains one draft for the affected Crew profile;
2. confirm there are zero duplicate `(event_id, contractor_id)` groups;
3. confirm the unique constraint exists;
4. execute a rolled-back Crew-authenticated `draft -> pending_ch` transition against the retained Red Bull row;
5. exercise removal of a disposable test draft and verify assignment/application/event capacity consistency;
6. exercise a blocked removal and verify no rows changed;
7. verify application/API logs contain no raw RLS or uniqueness errors for these flows.

## Deployment Order

1. Add failing frontend/service and SQL structure tests.
2. Add the assertion-driven duplicate repair and unique constraint migration.
3. Add the hardened assignment/removal RPCs in the same migration or a following migration whose dependency is explicit.
4. Update generated database types.
5. Switch frontend services to the RPCs and add in-flight UI states/error mapping.
6. Run focused tests, then the full test suite and production build.
7. Apply the migration once to the linked Supabase project.
8. Run the live verification checklist before considering the fix complete.

The frontend must not be deployed before the required RPC/schema migration is present, avoiding the schema drift already observed with newer client code requesting database objects that were not deployed.

## Acceptance Criteria

- No event/profile pair has more than one timelog.
- Repeated or concurrent assignment approval creates no duplicates.
- Removing Crew with `draft` or `rejected` work removes the disposable timelog and assignment atomically.
- Removing Crew with any submitted or later timelog is blocked atomically.
- Re-application after valid removal creates exactly one clean draft.
- Existing duplicate data is repaired according to explicit verified mappings.
- Red Bull submission works for the real Crew identity after cleanup.
- The UI does not expose raw RLS or uniqueness errors for expected domain conflicts.
