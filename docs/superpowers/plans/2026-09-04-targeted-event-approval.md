# Targeted event approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route CH-checked hours to the event's selected contact or separate COO, ending at approved hours without creating an invoice.

**Architecture:** Event configuration specifies the intended approver; an immutable-per-round approval record snapshots the exact identity at handoff. Private authenticated database functions lock and validate each transition, with invoker API wrappers and a trigger that also blocks generic REST/import bypasses. Existing lifecycle queues and query hydration carry the result to every approval entry point.

**Tech Stack:** Supabase / Postgres 17, TypeScript, React, Vitest, transactional SQL fixtures.

---

## Scope and compatibility

One final approver per timelog, after CH. Additional approvers and real account onboarding are deferred per latest user instruction. The development role switch is unchanged; event selection never grants a role. A contact may have no login yet: saving the intended event contact is allowed, but a handoff must fail clearly until the selected profile has a COO account. Do not fabricate approval success or create real accounts to make tests pass.

Existing `pending_coo` reports with no approval history retain the legacy role-based final action. Every new CH handoff creates an exact assignee record. Completed/history rows are not retroactively assigned. Changing the event contact never redirects an already handed-off report; a returned report uses current event configuration on its next handoff.

The current managerial profile UPDATE policy permits changing `profiles.user_id`. Snapshot the linked auth-user IDs in the approval record as well as profile IDs, and require both at resolution. Otherwise a non-assigned manager could rebind their account to the assigned profile after handoff. This new-flow protection does not change the development role switch or broadly redesign profile permissions.

Approval and invoicing are separate for both new and legacy flows. Remove the automatic approval trigger, not existing invoices or receipts. Explicit invoice creation remains available and unchanged.

## Task 1: Database routing, identity and transition enforcement

**Files:**
- Create with CLI: `supabase migration new targeted_event_approval` then edit that generated migration.
- Create `supabase/tests/targeted-event-approval.sql`.
- Create `src/features/timelogs/services/targeted-approval-migration.test.ts`.

- [ ] Write real SQL fixture tests first. Synthetic auth users/profiles: CH sender, intended COO, other COO, crew author, unlinked contact. Each authenticated case uses `SET LOCAL ROLE authenticated` plus JWT claims. Create one valid submitted report, configure its contact as approver. The first RED test calls the absent handoff RPC and must fail with undefined function, not a fixture error. All fixture data lives inside BEGIN/ROLLBACK in the isolated local database only.

- [ ] Add event metadata and the approval audit table. Use the existing contact profile column and foreign key; do not duplicate it:

```sql
alter table public.events
  add column contact_approves_hours boolean not null default true,
  add column timelog_approver_profile_id uuid references public.profiles(id) on delete restrict;
create index events_timelog_approver_profile_id_idx
  on public.events(timelog_approver_profile_id)
  where timelog_approver_profile_id is not null;

create table public.timelog_approvals (
  id uuid primary key,
  approval_round_id uuid not null,
  timelog_id uuid not null references public.timelogs(id) on delete cascade,
  approver_profile_id uuid not null references public.profiles(id) on delete restrict,
  requested_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  approver_user_id uuid not null references auth.users(id) on delete restrict,
  requested_by_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null check (status in ('pending','approved','returned')),
  requested_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  superseded_at timestamptz,
  note text not null default '',
  updated_at timestamptz not null default clock_timestamp(),
  unique (approval_round_id, timelog_id),
  check ((status = 'pending' and resolved_at is null)
    or (status <> 'pending' and resolved_at is not null))
);
create unique index timelog_approvals_active_idx
  on public.timelog_approvals(timelog_id) where superseded_at is null;
create index timelog_approvals_approver_idx
  on public.timelog_approvals(approver_profile_id, status) where superseded_at is null;
create index timelog_approvals_requested_by_idx
  on public.timelog_approvals(requested_by_profile_id);
create index timelog_approvals_approver_user_idx
  on public.timelog_approvals(approver_user_id);
create index timelog_approvals_requested_user_idx
  on public.timelog_approvals(requested_by_user_id);
alter table public.timelog_approvals enable row level security;
revoke all on public.timelog_approvals from public, anon, authenticated;
grant select on public.timelog_approvals to authenticated;
```

SELECT policy: authenticated CH or COO, or the report's crew author through their visible timelog, can read approval history. No INSERT/UPDATE/DELETE grants or policies for API roles. Add explicit service role grants only if consistent with the existing schema; never use a service key in application code.

- [ ] Create private authenticated implementation functions with empty search paths and explicit grants, exposed by public SQL SECURITY INVOKER wrappers. Public wrapper signatures:

```sql
public.list_event_contact_options()
returns table(profile_id uuid, name text, phone text, can_approve_hours boolean)

public.handoff_timelogs_for_approval_atomic(p_targets jsonb)
returns jsonb
-- targets [{id, expected_updated_at, approval_id, approval_round_id}]

public.resolve_timelog_approvals_atomic(p_targets jsonb, p_resolution text, p_note text default '')
returns jsonb
-- targets [{id, expected_updated_at, approval_id, approval_updated_at}]
-- legacy no-history rows use null approval_id/approval_updated_at
-- resolution = approved | returned
-- mutation output [{id, updated_at, status}]
```

All functions revoke PUBLIC/anon execute. Wrappers and private implementation functions explicitly grant authenticated execute; private schema is not exposed by PostgREST. Trigger-only helpers have no authenticated execute grant. `list_event_contact_options` permits only authenticated CH/COO, returns display name and phone already in managerial scope, and derives `can_approve_hours` from a linked user with current COO role. No role writes and no user_metadata-based authorization.

- [ ] Implement handoff under parent row locks in UUID order. Validate JSON shape, nonempty array, unique target/report and client approval IDs, required UUID/version values before mutation. Require authenticated CH identity. For each row:

```sql
-- The current event choice is read at handoff and then frozen in the round.
case when event_row.contact_approves_hours
  then event_row.contact_profile_id
  else event_row.timelog_approver_profile_id
end
```

The approver must exist, be linked to a COO user, differ from the sender and report author by profile ID and by any linked auth-user ID. Missing/unlinked/wrong-role candidates raise `timelog_approver_unavailable` (22023); self/author raises `timelog_approval_unauthorized` (42501). Snapshot the chosen `approver_user_id` and caller's `auth.uid()` as `requested_by_user_id`. Require submitted complete days using Task 1 schedule assertion; never approve blanks. Require status pending_ch and exact updated_at, otherwise `timelog_approval_conflict` (40001). Supersede prior resolved round, insert the single pending record, set parent pending_coo. Return authoritative rows. No time/day edits, invoice creation or role changes.

Idempotency precedes stale-parent rejection: the same supplied approval ID/round already attached to this report and requested by this actor is accepted only if the complete requested target batch identifies the same existing rounds; do not insert a second round. A reused ID/round for another report or actor is a conflict. Retry after resolution returns the actual current parent state, not a fabricated pending state. A partially matching batch must reject atomically.

- [ ] Implement resolution under the same sorted parent locks, followed by approval row locks. Validate current caller's linked profile and COO role, exact active assignment including `auth.uid() = approver_user_id`, pending_coo parent, matching parent and approval versions. Never resolve solely through a mutable profile-to-user link. The assigned sender/crew author cannot resolve; compare to the snapshotted sender auth ID too. `returned` requires a trimmed nonempty note; `approved` may have an empty note. Update record status/resolved_at/note/updated_at and parent approved or rejected/review_note in the same transaction. Successful retry with the same resolved approval, resolution and note returns current state only for that snapshotted actor; different payload, superseded round or later re-handoff rejects. All-or-nothing batch; wrong identity must not partially resolve valid neighbors.

For a legacy target with both approval fields null, require no approval history at all, exact parent version and pending_coo status, then allow the existing COO final action in the same transaction. This makes a mixed targeted/legacy bulk action atomic instead of splitting it into independently committed RPCs. A targeted/history report must never enter the legacy branch even if the client omits its approval ID.

- [ ] Add a separate private definer BEFORE UPDATE trigger on timelogs, named before `enforce_timelog_update_permissions` so it runs before the legacy import bypass. For every pending_ch → pending_coo transition, require an active pending approval requested by this caller. For pending_coo with an active round, reject any content/identity mutation and require a matching resolved approval record belonging to this caller for approved/rejected; block same-status importer edits as well. No caller-controlled GUC can authorize the transition. Approval table writes are RPC-only, so a direct status write cannot manufacture the required resolved record. Preserve existing permission trigger and unrelated RLS. Legacy pending_coo without any approval record can use its old role-based final action.

- [ ] Remove only the current automatic side-effect trigger:

```sql
drop trigger if exists trg_timelog_approved on public.timelogs;
```

Keep the old function as historical migration content; do not call it and do not mutate existing invoices. Any final approved action, targeted or legacy, now stays approved. Existing explicit invoicing functions remain authoritative for later financial transitions.

- [ ] GREEN SQL coverage: configured contact vs separate approver; missing login/wrong role/no target/self/author; wrong actor direct RPC; profile user_id rebinding after handoff cannot impersonate the snapshotted approver or sender; anon execute and table write denials; CH handoff direct REST/generic transition bypass; final direct REST/save/import bypass; success ending approved with unchanged invoice count/receipt state/days; mandatory return note; return/edit/resubmit/newround; changing contact after handoff leaves assignee unchanged; stale timelog/approval version, same/different-payload retries; mixed valid/invalid batch rollback; legacy pending_coo behavior; no automatic role grants. Add two-session race test for resolve vs resolve and new handoff vs stale resolution where practical, otherwise transactional locks and expected-version tests plus reviewed ordering are mandatory evidence.

- [ ] Apply on the disposable DB with the schedule migration installed, then replay the complete migration sequence on a fresh schema-only baseline DB. Add narrow Vitest DDL contract checks, run full unit suite, inspect ACLs/search paths/RLS, and commit only the migration/tests. Independent spec review then quality review before Task 2.

## Task 2: Shared API, hydration and all approval entry points

**Files:**
- `src/types.ts`, `src/lib/database.types.ts`, `src/lib/supabase-mappers.ts`, `src/lib/app-data.ts` and tests.
- New `src/features/timelogs/services/timelog-approval-rpc.service.ts` and tests.
- New `src/features/timelogs/services/timelog-approval-state.ts` and tests.
- New `src/features/timelogs/components/TimelogReturnDialog.tsx` and tests.
- New `src/features/timelogs/hooks/useTimelogApprovalActions.tsx` and tests.
- `src/features/timelogs/services/timelogs.service.ts` and tests.
- `src/features/events/services/events.service.ts` and tests.
- `src/views/ApprovalsView.tsx`, `TimelogsView.tsx`, `EventDetailView.tsx`, `DashboardView.tsx` and tests.
- `src/components/layout/nav-badges.ts` and tests.

- [ ] RED mapper/API tests. Extend Event with `contactApprovesHours?: boolean` and `timelogApproverProfileId?: string | null`. Extend TimelogApproval with `updatedAt: string`, `approverUserId: string`, and `requestedByUserId: string` for the immutable auth identity snapshots. Add database table/function types matching Task 1. Map metadata and approval records, preserving UUID and nullable timestamps; include new event fields, contact profile and phone in save payload and uncertain-save equality. Legacy missing metadata reads as true/null, no invented approval records.

```ts
export interface EventContactOption {
  profileId: string;
  name: string;
  phone: string;
  canApproveHours: boolean;
}

export const getActiveTimelogApproval = (timelog: Timelog) =>
  timelog.approvals?.find((approval) => !approval.supersededAt) ?? null;

export const isTimelogWaitingForProfile = (timelog: Timelog, profileId?: string | null) => {
  if (timelog.status !== 'pending_coo') return false;
  const approval = getActiveTimelogApproval(timelog);
  return approval
    ? approval.status === 'pending' && approval.approverProfileId === profileId
    : !timelog.approvals?.length;
};
```

This helper deliberately preserves legacy no-history reports, while callers still require COO role. History without an active round must fail closed, not masquerade as a legacy report. Never equate a local numeric ID to a profile or timelog UUID. UI profile checks only control presentation; the server additionally enforces the snapshotted auth identity.

- [ ] Add typed RPC adapters with strict response parsing and Czech errors for unavailable approver, unauthorized actor, stale/conflicting round and missing return note. Create UUIDs once per mutation request. Bootstrap and timelog-specific reload both SELECT approval records and group by timelog UUID; do not swallow schema/network errors as empty approvals, which would enable a legacy UI fallback on targeted records. Preserve the existing identity reconciliation and lifecycle generation guards.

- [ ] Route the centralized `updateTimelogStatuses` path: action ch uses handoff RPC; coo or rej on pending_coo uses resolution RPC (including its legacy branch); all remaining states use existing transition RPC. `approveAllTimelogsForEvent` includes only reports awaiting the current profile. Add optional `{note?: string, currentProfileId?: string}` action options without breaking current two-argument callers. Service obtains the authenticated profile via the existing authenticated client when needed, not a hard-coded role or browser-controlled profile as server authority. Run all changes through existing mutation serialization and authoritative reload/cache reconciliation on both success and uncertain failure. Local/demo data supports the same single-assignee state transitions with an explicit currentProfileId supplied by UI; it must not invent a remote success.

- [ ] Add one reusable returned-hours note dialog/hook used by all three approval views. Before returning a pending_coo report (targeted or legacy) require a note and show pending/error state without closing on failure; this matches the resolution RPC's required return note. CH rejection behavior retains existing semantics. No new multi-approver picker. The CH action uses the event's configured person and reports a concise actionable error if the person is not ready; never falls back to an arbitrary COO. Hook exposes `execute(ids: number[], action: TimelogAction): void`, `dialog: ReactNode`, `isPending: boolean`, and accepts optional `onSuccess: () => void` for selection clearing. Export the existing TimelogAction type from its service instead of duplicating strings. Canceling the dialog invokes no mutation; do not leave unresolved promises on unmount.

- [ ] Filter current-COO action buttons, bulk selection and “čeká na mě” counts with `isTimelogWaitingForProfile` in ApprovalsView, TimelogsView, EventDetailView, DashboardView and nav badges. Other managers may still view reports but cannot see active approval actions for someone else's round. Display intended/current approver name using existing profiles, and returned note where reports are reviewed. Update “finalni schvaleni a financni prehled” copy to hours-only wording. Keep separate existing invoicing UI unchanged.

- [ ] Tests: remote/local routing across all entry points, only-current-assignee actions/counts, readonly-other-COO, missing person error, returned note flow, stable-ID remapping, failed/uncertain responses causing reload, approval hydration preserving UUID/history, bulk no partial local updates and backend atomic failure, legacy no-round behavior. Full tests/build, independent spec then quality reviews and commit task files.

## Integration with event form

The event editor uses `list_event_contact_options`, offers the required contact and “Schvaluje také hodiny”, and a separate person selection when off. It stores the intended linked profile even if no account is ready, visibly marks unavailable approval capability without granting roles, and allows saving an event under development. Handoff is where exact authority is enforced. This avoids falsely claiming a phone/name string is an authenticated approval identity.

Do not deploy this UI before both migrations are reviewed and applied. Run existing explicit invoice creation tests after removal of the automatic trigger. No live fixture accounts, no changes to the development role switch.
