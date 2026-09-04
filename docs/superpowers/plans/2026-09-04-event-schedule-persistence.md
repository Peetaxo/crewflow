# Event schedule persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store schedule v2 and allow incomplete draft hours without permitting incomplete submission.

**Architecture:** Additive event metadata preserves legacy defaults. Existing atomic assignment/save functions keep their locking and authorization while accepting empty draft times. Database triggers protect submission from direct REST and generic status mutations too.

**Tech Stack:** Postgres 17 / Supabase, TypeScript / Vitest, isolated Docker database.

---

## Task 1: Database contract

**Files:**
- Modify CLI-created `supabase/migrations/20260904121148_event_schedule_version_and_blank_drafts.sql`.
- Create `supabase/tests/event-schedule-drafts.sql` (transactional synthetic fixtures; no live users).
- Create `src/features/events/services/event-schedule-migration.test.ts` (migration contract checks, supplemental to real SQL tests).

**Verified sources:** `/private/tmp/crewflow-schema-before-20260904.sql` is a schema-only export of the linked database. Existing definitions also live in `supabase/migrations/20260817074631_timelog_assignment_lifecycle.sql`; later migration fixes invalid `pg_catalog.coalesce`. Use the audited export/current local catalog when copying definitions. Never reintroduce qualified `coalesce`.

- [ ] Add synthetic CH and Crew auth/profile fixtures, event, and assertions in `BEGIN ... ROLLBACK`. Assert `assign_event_crew` can create a draft containing `time_from:''`, `time_to:''`; then save/reload partial/blank values, including preparation phase. The old functions must fail before the migration.

```sql
select public.assign_event_crew(
  '20000000-0000-4000-8000-000000000001'::uuid,
  '30000000-0000-4000-8000-000000000002'::uuid,
  null,
  '[{"date":"2026-09-04","time_from":"","time_to":"","day_type":"instal"}]'::jsonb
);
```

Fixtures use those UUIDs only in the rollback test, never in the migration. Set request claims to the synthetic actor and `SET LOCAL ROLE authenticated` when exercising RPC/RLS. Create auth users and profiles using database-owner setup before switching role. Test helpers must raise on unexpected success/failure, not swallow arbitrary errors.

- [ ] Run old-schema RED test with `docker exec -i crewflow-event-form-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/event-schedule-drafts.sql`. Expected assignment-invalid-days error.
- [ ] Add these columns without reclassifying historical events:

```sql
alter table public.events
  add column schedule_version smallint not null default 1
    check (schedule_version in (1, 2)),
  add column free_days date[] not null default '{}';
```

- [ ] Define an immutable time validator matching the frontend parser, with explicit ACLs. The following SQL body is the contract:

```sql
create or replace function public.is_valid_timelog_time(p_value text)
returns boolean language sql immutable set search_path = ''
as $$ select coalesce(p_value ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$', false) $$;
revoke all on function public.is_valid_timelog_time(text) from public, anon;
grant execute on function public.is_valid_timelog_time(text) to authenticated;
```

- [ ] Copy full existing `assign_event_crew` and `save_timelog_atomic` definitions into the migration and modify only validation/casts. Keep auth checks, advisory/row locks, identities, expected versions, insert/update semantics, idempotency and grants unchanged. Expand the recognized phase list to include `pripravy` (already in the database enum). Missing day_type must fail explicitly, not rely on nullable SQL `NOT IN`.

```sql
-- Per-element predicate, alongside existing date/object checks:
or nullif(day->>'day_type', '') is null
or day->>'day_type' not in ('pripravy', 'instal', 'provoz', 'deinstal')
or (nullif(day->>'time_from', '') is not null
    and not public.is_valid_timelog_time(day->>'time_from'))
or (nullif(day->>'time_to', '') is not null
    and not public.is_valid_timelog_time(day->>'time_to'))
-- Validation and ORDER BY time casts must tolerate missing draft times:
nullif(day->>'time_from', '')::time
nullif(day->>'time_to', '')::time
nullif(source.day->>'time_from', '')::time
nullif(source.day->>'time_to', '')::time
```

Only draft/rejected/pending_crew_confirmation may be incomplete. For save requests targeting any review/approved/financial state, both times must be valid and unequal as times (08:00 equals 8:00); invalid/zero intervals raise `timelog_incomplete`. Preserve original text when storing nonempty values and preserve empty string/null without a fallback.

- [ ] Add a database-only completeness assertion and triggers. Keep the helper in non-exposed `private`, explicit empty search_path, no direct API execute. It checks only `pending_ch`, `pending_coo`, `approved`, `invoiced`, `paid`; returns for draft/rejected/confirmation or a deleted parent. No rewriting existing data. Implement this predicate after reading the parent's status:

```sql
if not exists (select 1 from public.timelog_days where timelog_id = p_timelog_id)
or exists (
  select 1 from public.timelog_days d
  where d.timelog_id = p_timelog_id
    and (not public.is_valid_timelog_time(d.time_from)
      or not public.is_valid_timelog_time(d.time_to)
      or case when public.is_valid_timelog_time(d.time_from)
                and public.is_valid_timelog_time(d.time_to)
              then d.time_from::time = d.time_to::time else false end)
) then
  raise exception 'timelog_incomplete' using errcode = '22023';
end if;
```

Use DEFERRABLE INITIALLY DEFERRED constraint triggers on parent insert/status update and day insert/update/delete. This allows atomic delete-and-reinsert day saves and validates final transaction state. On day reassignment check both old and new parents; on cascade deletion missing parents are ignored. Schema-qualify all names. Trigger functions cannot be directly executed by API roles. A row lock on the parent protects concurrent day edits/status transitions; preserve existing lock ordering to avoid deadlocks.

- [ ] Expand tests: blank/partial draft round-trip, valid single-digit times, invalid syntax/24:00, zero-length times, overnight, preparation, optimistic stale save, wrong actor, direct REST-equivalent pending_ch update with blanks, generic transition bypass, removal/blanking a day while pending_ch, valid submitted replacement, existing filled data untouched. Set constraints immediate inside exception-isolated test blocks when testing deferred violations. Verify no invoice/receipt data is touched by these tests.
- [ ] Run local migration once, then SQL test to GREEN; test a second isolated database restored from the same schema-only baseline to confirm migration replay. No live application during task implementation.
- [ ] Add Vitest contract tests checking additive default version1, no historical data UPDATE, nullable casts, four phases, helper/trigger ACL and presence of rollback fixture tests. Run focused test, then all `npm test -- --reporter=dot`.
- [ ] Commit only migration/test files as `feat: persist event schedule versions and incomplete drafts`.
- [ ] Independent spec then quality review, resolve findings before next task.

## Task 2: Application persistence and time-entry readers

**Files:**
- `src/lib/database.types.ts`, `src/lib/supabase-mappers.ts` and mapper tests.
- `src/features/events/services/events.service.ts` and tests.
- `src/features/timelogs/services/timelog-validation.ts` and test (new).
- `src/features/timelogs/services/timelogs.service.ts` and tests.
- `src/components/modals/TimelogEditModal.tsx`, `MobileTimelogEditModal.tsx` and tests.
- `src/views/EventDetailView.tsx`, `src/views/EventsView.tsx` and affected tests.
- `src/features/invoices/services/approval-timelog-sync.service.ts` and tests (existing schedule-based inference only; no new financial workflow).

- [ ] RED tests for metadata round-trip and incomplete save/submission. Add optional compatibility fields to database Event Row: `schedule_version?: 1 | 2; free_days?: string[] | null;`. Map/save fields and compare them during uncertain-write recovery:

```ts
// mapEvent
scheduleVersion: row.schedule_version ?? 1,
freeDays: row.free_days ?? [],
// payload
schedule_version: event.scheduleVersion ?? 1,
free_days: event.freeDays ?? [],
// matchesSavedEvent clauses
&& (actual.scheduleVersion ?? 1) === (expected.scheduleVersion ?? 1)
&& sameJsonValue(actual.freeDays ?? [], expected.freeDays ?? [])
```

- [ ] Create and test shared validation below; call before all client status submissions (single/bulk), saves and creates that target reviewed states, both local and Supabase paths. Keep server guards as authority.

```ts
import type { Timelog } from '../../../types';
import { parseTimeToMinutes } from '../../../utils';
export const assertTimelogComplete = (timelog: Pick<Timelog, 'days'>): void => {
  if (!timelog.days.length) throw new Error('Doplňte alespoň jeden záznam hodin.');
  const index = timelog.days.findIndex((day) => {
    const from = parseTimeToMinutes(day.f);
    const to = parseTimeToMinutes(day.t);
    return from === null || to === null || from === to;
  });
  if (index >= 0) {
    const day = timelog.days[index];
    throw new Error(`Doplňte platný čas od a do: ${day.d}, záznam ${index + 1}.`);
  }
};
```

- [ ] Map RPC token `timelog_incomplete` to Czech incomplete-hours message. No destructive local deletion for a submit request with zero days: validate before the existing empty-save deletion branch.
- [ ] Replace v2 desktop add-day defaulting and expected-plan comparisons with `resolveTimelogDayDefaults`; preserve legacy branch. EventDetail new draft creation uses `buildEventScheduleDays(event)` for v2, legacy map remains. No automatic phase self-application.
- [ ] Add `scheduleVersion` and `freeDays` to mobile event defaults signature. Empty TimeField displays `--:--`; opening the time wheel must not write 00:00 unless user selects/confirms. Save/reopen empty drafts must stay empty. Validate before submit and retain user input on errors.
- [ ] For v2 multi-day event summaries show calendar day count, not recurring global time interval. Application-time proposal controls must not present boundary times as every-day shifts; leave existing user-provided proposal values unchanged.
- [ ] Guard the existing invoice-comment hours importer against the same boundary mistake. For v2, `getScheduledPhaseForDate` must use `resolveEventScheduleDay` and return null for missing planned clocks. `getScheduledTimelogDaysForEvent` uses `buildEventScheduleDays`; if any active generated day lacks complete unequal clocks, return an empty schedule so the existing review-required path handles it. Do not infer actual daily hours from whole-event boundaries, disabled cached phases or partially known multi-day plans. Explicit times stated in imported comments keep existing behavior, including work on a day labelled free in the plan. Tests cover dateless/missing-clock multi-day inference requiring review, explicit comment times preserved, single-day and explicit complete plans, and legacy behavior.
- [ ] Run affected tests, all tests, build, and independent spec/quality reviews; commit only task files.

## Rollout constraint

Do not turn on v2 event creation until Task 1 is deployed together with the reviewed form. Do not ship a form that generates blank plans against the old RPC. All verified migrations are applied once near the final integration checkpoint; no existing events/timelogs are bulk rewritten. Role switch and real-account onboarding stay out of scope per user instruction.
