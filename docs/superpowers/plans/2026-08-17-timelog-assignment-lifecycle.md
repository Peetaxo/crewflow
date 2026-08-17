# Timelog Assignment Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Crew assignment and removal atomic, repair the nine existing duplicate timelog groups, and guarantee one timelog per event/profile without exposing raw database errors.

**Architecture:** A single tracked Supabase migration repairs the known production duplicates, installs a unique constraint, exposes three tightly authorized `SECURITY DEFINER` manager RPCs for assignment, direct removal, and exact withdrawal approval, and installs a non-callable `SECURITY DEFINER` trigger that constrains Crew application transitions. A focused TypeScript RPC adapter maps database outcomes into stable Czech domain errors; the existing event service keeps local-mode behavior, delegates manager mutations to the appropriate RPC, preserves canonical UUID identity, and then rehydrates authoritative state. UI controls add local status guards and in-flight protection, while the database remains the final concurrency and authorization boundary.

**Tech Stack:** PostgreSQL 17 / Supabase RLS and RPC, `@supabase/supabase-js`, React 18, TypeScript 5.8, Vitest 4, Testing Library, Supabase CLI 2.95.4.

---

## Scope and file map

- Create `supabase/migrations/*_timelog_assignment_lifecycle.sql` (the single path printed by the CLI in Task 1): reconcile and harden the tracked event-application prerequisite, assert and remove only the 13 verified duplicate rows, add `timelogs_event_contractor_unique`, define the three lifecycle RPCs, and install the Crew transition trigger.
- Create `supabase/verify-timelog_assignment_lifecycle.sql`: rolled-back database behavior checks for authorization, idempotency, status blocking, cleanup, and re-application.
- Create `src/features/events/services/event-assignment-lifecycle-migration.test.ts`: static migration contract checks, including every production UUID in the repair map.
- Create `src/features/events/services/event-assignment-lifecycle.service.ts`: typed RPC adapter, status predicates, stable error mapping, and no local-state mutation.
- Create `src/features/events/services/event-assignment-lifecycle.service.test.ts`: focused unit tests for RPC inputs, outputs, and error mapping.
- Modify `src/features/events/services/events.service.ts`: use the appropriate manager RPC in Supabase mode, rehydrate authoritative snapshots, map direct Crew upsert conflicts centrally, and align the local fallback with the same removal rules.
- Modify `src/features/events/services/events.service.test.ts`: replace multi-request expectations with RPC orchestration expectations; cover exact application/withdrawal conflicts, direct Crew trigger errors, and repeated approval/removal behavior.
- Modify `src/features/events/types/events.types.ts`: carry canonical RPC metadata in the assignment result without exposing database rows to UI code.
- Modify `src/types.ts`: add the deployed `pending_crew_confirmation` timelog state.
- Modify `src/lib/database.types.ts`: add the deployed enum value and all three RPC signatures.
- Modify `src/features/timelogs/services/timelogs.service.ts`, its tests, and lifecycle timelog producers: preserve canonical event/timelog UUIDs across creation, refresh, save, status, and delete flows.
- Modify `src/views/EventDetailView.tsx`: disable invalid removal, show explanatory text/title, and guard approve/remove actions while in flight.
- Create `src/views/EventDetailView.lifecycle.test.tsx`: focused UI tests for blocked removal and double-click protection.
- Modify `src/components/modals/AssignCrewModal.tsx`: guard direct assignment while the request is in flight.
- Modify `src/components/modals/uuid-contractor-modal-identity.test.tsx`: verify direct assignment cannot be submitted twice.

Do not modify or stage the existing unrelated work in `CONTEXT.md`, backup data, GrasOn import files, or `MobileTimelogEditModal*`.

### Stable domain contract

Use these exact RPC names, parameters, and database error tokens throughout all tasks:

```text
assign_event_crew(p_event_id uuid, p_profile_id uuid, p_application_id uuid, p_days jsonb)
remove_event_crew(p_event_id uuid, p_profile_id uuid)
approve_event_withdrawal(p_event_id uuid, p_profile_id uuid, p_application_id uuid)

crew_lifecycle_unauthorized
crew_lifecycle_not_found
crew_assignment_conflict
crew_assignment_invalid_days
crew_removal_blocked
crew_application_conflict
crew_withdrawal_conflict
```

Map them to these exact Czech messages:

```text
crew_lifecycle_unauthorized -> Tuto akci může provést pouze CrewHead nebo COO.
crew_lifecycle_not_found -> Akce nebo člen Crew nebyl nalezen.
crew_assignment_conflict -> Výkaz pro tuto Crew a akci už existuje a nelze ho přepsat.
crew_assignment_invalid_days -> Pro přiřazení Crew nejsou k dispozici platné směny.
crew_removal_blocked -> Crew nelze odebrat, protože výkaz už byl odeslán ke kontrole.
crew_application_conflict -> Stav přihlášky se mezitím změnil. Obnovte detail akce a zkuste to znovu.
crew_withdrawal_conflict -> Stav žádosti o odhlášení se mezitím změnil. Obnovte detail akce a zkuste to znovu.
unexpected -> Operaci s Crew se nepodařilo dokončit.
```

The manager adapter maps `crew_lifecycle_unauthorized` to the manager authorization message above. Direct Crew re-application and withdrawal-request upserts can receive the same trigger token when their local application state is stale; `events.service.ts` must instead map it to the operation-specific application or withdrawal conflict. No UI caller may receive a raw database token or RLS/unique diagnostic.

The three manager RPCs are callable only by `authenticated`, re-check `auth.uid()` plus CrewHead/COO inside the function, and revoke execution from `PUBLIC` and `anon`. `enforce_event_application_lifecycle_update()` is a trigger function, not a fourth endpoint: revoke execution from `PUBLIC`, `anon`, and `authenticated` while allowing PostgreSQL to invoke it through the trigger.

## Task 1: Lock the migration repair contract with a failing test

**Files:**
- Create: `src/features/events/services/event-assignment-lifecycle-migration.test.ts`
- Create via CLI: the single `supabase/migrations/*_timelog_assignment_lifecycle.sql` path printed in Step 3

- [ ] **Step 1: Write the failing migration contract test**

Create the test with a suffix lookup so the Supabase CLI remains responsible for the timestamp:

```ts
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationDirectory = join(process.cwd(), 'supabase', 'migrations');
const migrationFiles = readdirSync(migrationDirectory)
  .filter((name) => name.endsWith('_timelog_assignment_lifecycle.sql'));

const readMigration = () => {
  expect(migrationFiles).toHaveLength(1);
  return readFileSync(join(migrationDirectory, migrationFiles[0]), 'utf8').toLowerCase();
};

const canonicalIds = [
  '5e062036-278f-4e39-b0cd-8d02d33ced13',
  '0a75d458-e4e2-441e-8827-5b3d7778b186',
  '34807683-1ab8-4772-aa2d-ce8c5b55a720',
  'b7a6497e-44ff-4f55-bf89-629adb02bb88',
  '7e6ab2b5-261b-4a12-b7e0-3fdd5c0afe63',
  'ddfaf624-b422-48bf-889e-c43ecd4bc8b5',
  '1489bcb7-b4fa-4c93-a92d-5433e725ba03',
  '286d8093-4c9f-4762-ad27-a04ad6291591',
  'c5190763-785c-4f7b-b96b-c0c29c960e0b',
];

const duplicateIds = [
  'c55d4794-42d3-46be-aba4-931c40e495c0',
  'ead03ebc-bc28-49ea-9297-86da3b64fcfa',
  '9c5a8932-fb1c-4439-a6d9-955df5c12748',
  'ce599341-ec8f-4d07-9e6d-32af0afbaa9a',
  '33beefe4-98d0-493f-b621-42699dd99107',
  '84dc508f-82b7-4ecd-a099-c95016a77741',
  'b51d25df-4415-4951-9f99-fea599d33ab5',
  'f550a5a3-9ea8-4e4d-9265-6fa377b99d5b',
  '0ee6341d-ecc3-444d-bf4c-740392e13ac1',
  'b4e14c6a-90f4-415a-b822-f20ce51736d8',
  '623e3ece-5240-4d99-a354-0061e303ba3d',
  '696327a8-8b93-4ffa-9bc8-f2eb084e5744',
  'd2c42270-64ab-46a8-94f3-bc61fe0f4162',
];

describe('timelog assignment lifecycle migration', () => {
  it('contains the complete explicit production repair map', () => {
    const sql = readMigration();
    [...canonicalIds, ...duplicateIds].forEach((id) => expect(sql).toContain(id));
    expect(sql).toContain("assert v_present_count = 22");
    expect(sql).toContain("assert v_mapping_count = 13");
    expect(sql).toContain("to_regclass('public.invoice_timelogs')");
  });

  it('verifies normalized content before deleting and adds uniqueness last', () => {
    const sql = readMigration();
    expect(sql).toContain('timelog_duplicate_repair_map');
    expect(sql).toContain('normalized_timelog_days');
    expect(sql).toContain('delete from public.timelogs');
    expect(sql).toContain('timelogs_event_contractor_unique');
    expect(sql.indexOf('delete from public.timelogs'))
      .toBeLessThan(sql.lastIndexOf('timelogs_event_contractor_unique'));
  });
});
```

- [ ] **Step 2: Run the focused test and verify the RED state**

Run:

```bash
npm test -- src/features/events/services/event-assignment-lifecycle-migration.test.ts
```

Expected: FAIL because no migration ending in `_timelog_assignment_lifecycle.sql` exists.

- [ ] **Step 3: Create the migration using the installed Supabase CLI**

Run:

```bash
supabase migration new timelog_assignment_lifecycle
```

Expected: one new path printed under `supabase/migrations/` with a 14-digit timestamp. Do not rename it manually.

- [ ] **Step 4: Keep the RED state uncommitted until Task 2 turns it GREEN**

Run `git status --short` and verify that only the new contract test and generated lifecycle migration belong to this task. Do not commit a deliberately failing test.

## Task 2: Repair known duplicates and enforce one timelog per event/profile

**Files:**
- Modify: the single `supabase/migrations/*_timelog_assignment_lifecycle.sql` created in Task 1
- Test: `src/features/events/services/event-assignment-lifecycle-migration.test.ts`

- [ ] **Step 1: Add an idempotent event-application prerequisite**

At the beginning of the migration, add `begin;`, then reconcile the loose `supabase/event-applications-migration.sql` prerequisite so a clean migration replay can compile the lifecycle functions:

```sql
begin;

alter type public.timelog_status
  add value if not exists 'pending_crew_confirmation' after 'pending_ch';

create table if not exists public.event_applications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'withdrawn', 'withdrawal_requested')),
  note text,
  planned_from time,
  planned_to time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, profile_id)
);

alter table public.events
  add column if not exists allow_crew_time_proposal boolean not null default false;

create index if not exists event_applications_event_id_idx
  on public.event_applications (event_id);
create index if not exists event_applications_profile_id_idx
  on public.event_applications (profile_id);
create index if not exists event_applications_status_idx
  on public.event_applications (status);

alter table public.event_applications enable row level security;
revoke all on public.event_applications from authenticated;
grant select, insert, update on public.event_applications to authenticated;
revoke all on public.event_applications from anon;

drop policy if exists "Crew can view own event applications" on public.event_applications;
create policy "Crew can view own event applications"
on public.event_applications for select to authenticated
using (profile_id = public.current_profile_id());

drop policy if exists "Crew can create own event applications" on public.event_applications;
create policy "Crew can create own event applications"
on public.event_applications for insert to authenticated
with check (
  profile_id = public.current_profile_id()
  and (
    status = 'pending'
    or (
      status = 'withdrawal_requested'
      and exists (
        select 1
        from public.timelogs t
        where t.event_id = event_applications.event_id
          and t.contractor_id = public.current_profile_id()
      )
    )
  )
);

drop policy if exists "Crew can renew own event applications" on public.event_applications;
drop policy if exists "Crew can update own event applications" on public.event_applications;
create policy "Crew can renew own event applications"
on public.event_applications for update to authenticated
using (profile_id = public.current_profile_id())
with check (
  profile_id = public.current_profile_id()
  and (
    status in ('pending', 'approved', 'rejected', 'withdrawn')
    or (
      status = 'withdrawal_requested'
      and exists (
        select 1
        from public.timelogs t
        where t.event_id = event_applications.event_id
          and t.contractor_id = public.current_profile_id()
      )
    )
  )
);

drop policy if exists "CrewHead and COO can manage event applications" on public.event_applications;
create policy "CrewHead and COO can manage event applications"
on public.event_applications for all to authenticated
using (
  public.has_role((select auth.uid()), 'crewhead'::public.app_role)
  or public.has_role((select auth.uid()), 'coo'::public.app_role)
)
with check (
  public.has_role((select auth.uid()), 'crewhead'::public.app_role)
  or public.has_role((select auth.uid()), 'coo'::public.app_role)
);

create or replace function public.enforce_event_application_lifecycle_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();

  if auth.uid() is null then
    return new;
  end if;

  if public.has_role(auth.uid(), 'crewhead'::public.app_role)
    or public.has_role(auth.uid(), 'coo'::public.app_role) then
    return new;
  end if;

  if not public.has_role(auth.uid(), 'crew'::public.app_role)
    or old.profile_id is distinct from public.current_profile_id()
    or new.id is distinct from old.id
    or new.event_id is distinct from old.event_id
    or new.profile_id is distinct from old.profile_id
    or new.created_at is distinct from old.created_at then
    raise exception 'crew_lifecycle_unauthorized' using errcode = '42501';
  end if;

  if new.status is not distinct from old.status
    or (old.status = 'pending' and new.status = 'withdrawn')
    or (old.status in ('rejected', 'withdrawn') and new.status = 'pending')
    or (old.status = 'approved' and new.status = 'withdrawal_requested') then
    return new;
  end if;

  raise exception 'crew_lifecycle_unauthorized' using errcode = '42501';
end;
$$;

revoke all on function public.enforce_event_application_lifecycle_update() from public;
revoke all on function public.enforce_event_application_lifecycle_update() from anon;
revoke all on function public.enforce_event_application_lifecycle_update() from authenticated;

drop trigger if exists enforce_event_application_lifecycle_update on public.event_applications;
create trigger enforce_event_application_lifecycle_update
before update on public.event_applications
for each row execute function public.enforce_event_application_lifecycle_update();
```

The RLS policies constrain ownership and the set of values that can pass `WITH CHECK`; the trigger additionally freezes Crew identity columns and enforces the exact transition graph. It is deliberately non-callable by API roles. The three privileged lifecycle RPCs still perform their own manager authorization and do not rely on this UI/RLS layer as their security boundary.

- [ ] **Step 2: Add the explicit duplicate map and normalized-day helper**

Append this temporary map. The canonical row is first in each pair; exact rows keep the most recently verified copy, Red Bull keeps the newer edited draft, and the divergent Miss Agro pair keeps the complete two-shift record.

```sql
create temporary table timelog_duplicate_repair_map (
  canonical_id uuid not null,
  duplicate_id uuid primary key,
  event_id uuid not null,
  contractor_id uuid not null,
  expected_status public.timelog_status not null,
  comparison text not null check (comparison in ('exact', 'divergent'))
) on commit drop;

insert into timelog_duplicate_repair_map values
  ('5e062036-278f-4e39-b0cd-8d02d33ced13', 'c55d4794-42d3-46be-aba4-931c40e495c0', '2bd32b32-2360-43e1-9971-322d21e5d888', '3d31b82a-ac5a-46ba-8683-6856ea2ff4a3', 'approved', 'exact'),
  ('5e062036-278f-4e39-b0cd-8d02d33ced13', 'ead03ebc-bc28-49ea-9297-86da3b64fcfa', '2bd32b32-2360-43e1-9971-322d21e5d888', '3d31b82a-ac5a-46ba-8683-6856ea2ff4a3', 'approved', 'exact'),
  ('0a75d458-e4e2-441e-8827-5b3d7778b186', '9c5a8932-fb1c-4439-a6d9-955df5c12748', '33bcf650-8f92-49ab-981e-d0d9421ea19f', '58de7385-56e1-4c22-b610-ab6be7933ca3', 'approved', 'exact'),
  ('34807683-1ab8-4772-aa2d-ce8c5b55a720', 'ce599341-ec8f-4d07-9e6d-32af0afbaa9a', '56ebb06f-bd2d-4324-bb0c-3d13a571d144', '58de7385-56e1-4c22-b610-ab6be7933ca3', 'approved', 'exact'),
  ('b7a6497e-44ff-4f55-bf89-629adb02bb88', '33beefe4-98d0-493f-b621-42699dd99107', '8c1a55b8-3e84-4645-8bb8-490c824e690e', '4cdb0844-88db-4ba1-aa97-b9368eaefc0e', 'approved', 'exact'),
  ('b7a6497e-44ff-4f55-bf89-629adb02bb88', '84dc508f-82b7-4ecd-a099-c95016a77741', '8c1a55b8-3e84-4645-8bb8-490c824e690e', '4cdb0844-88db-4ba1-aa97-b9368eaefc0e', 'approved', 'exact'),
  ('b7a6497e-44ff-4f55-bf89-629adb02bb88', 'b51d25df-4415-4951-9f99-fea599d33ab5', '8c1a55b8-3e84-4645-8bb8-490c824e690e', '4cdb0844-88db-4ba1-aa97-b9368eaefc0e', 'approved', 'exact'),
  ('7e6ab2b5-261b-4a12-b7e0-3fdd5c0afe63', 'f550a5a3-9ea8-4e4d-9265-6fa377b99d5b', '92e45dde-641e-434c-bbce-43ed95ac15a9', '86320ad3-9b14-4af5-a8f9-588c9868da86', 'approved', 'exact'),
  ('ddfaf624-b422-48bf-889e-c43ecd4bc8b5', '0ee6341d-ecc3-444d-bf4c-740392e13ac1', 'ad81d9bf-0e6e-467b-95a8-79f3ef59d566', '58de7385-56e1-4c22-b610-ab6be7933ca3', 'approved', 'divergent'),
  ('1489bcb7-b4fa-4c93-a92d-5433e725ba03', 'b4e14c6a-90f4-415a-b822-f20ce51736d8', 'bd8dcdf6-961a-43c0-9f35-d3bae4c4a2ef', 'd78b1623-712b-42aa-bbc5-897b73f63ffb', 'draft', 'exact'),
  ('286d8093-4c9f-4762-ad27-a04ad6291591', '623e3ece-5240-4d99-a354-0061e303ba3d', 'c06e08bd-2354-492b-8f1d-570080f9a1d1', '58de7385-56e1-4c22-b610-ab6be7933ca3', 'approved', 'exact'),
  ('286d8093-4c9f-4762-ad27-a04ad6291591', '696327a8-8b93-4ffa-9bc8-f2eb084e5744', 'c06e08bd-2354-492b-8f1d-570080f9a1d1', '58de7385-56e1-4c22-b610-ab6be7933ca3', 'approved', 'exact'),
  ('c5190763-785c-4f7b-b96b-c0c29c960e0b', 'd2c42270-64ab-46a8-94f3-bc61fe0f4162', 'f956aa0a-9363-4d7c-9fc4-427e1415b837', '72197f75-8537-416b-b1d2-6f27e69526bc', 'approved', 'exact');

create or replace function pg_temp.normalized_timelog_days(p_timelog_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', d.date,
        'time_from', d.time_from,
        'time_to', d.time_to,
        'day_type', d.day_type,
        'note', d.note
      ) order by d.date, d.time_from, d.time_to, d.day_type, d.id
    ),
    '[]'::jsonb
  )
  from public.timelog_days d
  where d.timelog_id = p_timelog_id;
$$;
```

- [ ] **Step 3: Add all pre-delete assertions**

Append one `DO` block. It skips the production-specific assertions only when none of the 22 known IDs exists, allowing clean database replay. A partially present set, changed payload, new invoice link, or unrelated duplicate aborts.

```sql
do $$
declare
  v_mapping_count integer;
  v_present_count integer;
  v_has_invoice_link boolean := false;
begin
  select count(*) into v_mapping_count from timelog_duplicate_repair_map;
  assert v_mapping_count = 13, 'timelog repair map must contain 13 duplicate rows';

  select count(distinct t.id)
  into v_present_count
  from public.timelogs t
  where t.id in (
    select canonical_id from timelog_duplicate_repair_map
    union
    select duplicate_id from timelog_duplicate_repair_map
  );

  if v_present_count = 0 then
    return;
  end if;

  assert v_present_count = 22, 'known timelog repair set is only partially present';

  assert not exists (
    select 1
    from timelog_duplicate_repair_map m
    join public.timelogs c on c.id = m.canonical_id
    join public.timelogs d on d.id = m.duplicate_id
    where c.event_id <> m.event_id
      or d.event_id <> m.event_id
      or c.contractor_id <> m.contractor_id
      or d.contractor_id <> m.contractor_id
      or c.status <> m.expected_status
      or d.status <> m.expected_status
  ), 'known timelog identity or status changed';

  assert not exists (
    select 1
    from timelog_duplicate_repair_map m
    join public.timelogs c on c.id = m.canonical_id
    join public.timelogs d on d.id = m.duplicate_id
    where m.comparison = 'exact'
      and (
        (to_jsonb(c) - 'id' - 'created_at' - 'updated_at')
          is distinct from
        (to_jsonb(d) - 'id' - 'created_at' - 'updated_at')
        or pg_temp.normalized_timelog_days(c.id)
          is distinct from pg_temp.normalized_timelog_days(d.id)
      )
  ), 'an exact duplicate payload changed';

  assert (
    select jsonb_build_object('status', t.status, 'km', t.km, 'note', coalesce(t.note, ''))
    from public.timelogs t
    where t.id = 'ddfaf624-b422-48bf-889e-c43ecd4bc8b5'
  ) = '{"status":"approved","km":0.00,"note":"PowerApps: Rebros-2026-015.pdf"}'::jsonb,
  'complete Miss Agro canonical payload changed';

  assert pg_temp.normalized_timelog_days('ddfaf624-b422-48bf-889e-c43ecd4bc8b5') =
    '[{"date":"2026-05-12","time_from":"08:00","time_to":"14:00","day_type":"provoz","note":null},{"date":"2026-05-12","time_from":"22:30","time_to":"03:30","day_type":"provoz","note":null}]'::jsonb,
    'complete Miss Agro day set changed';

  assert pg_temp.normalized_timelog_days('0ee6341d-ecc3-444d-bf4c-740392e13ac1') =
    '[{"date":"2026-05-12","time_from":"22:30","time_to":"03:30","day_type":"instal","note":null}]'::jsonb,
    'subset Miss Agro day set changed';

  if to_regclass('public.invoice_timelogs') is not null then
    execute $query$
      select exists (
        select 1
        from public.invoice_timelogs it
        where it.timelog_id in (
          select canonical_id from timelog_duplicate_repair_map
          union
          select duplicate_id from timelog_duplicate_repair_map
        )
      )
    $query$ into v_has_invoice_link;
    assert not v_has_invoice_link, 'known duplicate timelog is linked to an invoice';
  end if;
end
$$;
```

- [ ] **Step 4: Delete only verified copies, assert zero duplicates, and add the constraint**

Append:

```sql
delete from public.timelogs t
using timelog_duplicate_repair_map m
where t.id = m.duplicate_id;

do $$
begin
  assert not exists (
    select 1
    from public.timelogs
    group by event_id, contractor_id
    having count(*) > 1
  ), 'timelog duplicates remain; unique constraint was not added';
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.timelogs'::regclass
      and conname = 'timelogs_event_contractor_unique'
      and pg_get_constraintdef(oid) <> 'UNIQUE (event_id, contractor_id)'
  ) then
    raise exception 'timelogs_event_contractor_unique has an unexpected definition';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.timelogs'::regclass
      and conname = 'timelogs_event_contractor_unique'
  ) then
    alter table public.timelogs
      add constraint timelogs_event_contractor_unique unique (event_id, contractor_id);
  end if;
end
$$;
```

Do not add `commit;` yet; the RPC definitions in Task 3 belong to the same atomic migration.

- [ ] **Step 5: Run the migration contract test**

Run:

```bash
npm test -- src/features/events/services/event-assignment-lifecycle-migration.test.ts
```

Expected: PASS for the repair-map and ordering tests.

- [ ] **Step 6: Commit the verified repair phase**

```bash
LIFECYCLE_MIGRATION="$(find supabase/migrations -maxdepth 1 -type f -name '*_timelog_assignment_lifecycle.sql' -print)"
git add "$LIFECYCLE_MIGRATION"
git add src/features/events/services/event-assignment-lifecycle-migration.test.ts
git commit -m "fix: repair duplicate event timelogs"
```

## Task 3: Add three atomic manager RPCs and the Crew transition trigger

**Files:**
- Modify: `src/features/events/services/event-assignment-lifecycle-migration.test.ts`
- Modify: the single `supabase/migrations/*_timelog_assignment_lifecycle.sql` created in Task 1
- Create: `supabase/verify-timelog_assignment_lifecycle.sql`

- [ ] **Step 1: Extend the migration test for the RPC security and locking contract**

Append these cases inside the existing `describe`:

```ts
it('defines all three atomic manager RPCs with the same transaction lock', () => {
  const sql = readMigration();
  expect(sql).toContain('function public.assign_event_crew');
  expect(sql).toContain('function public.remove_event_crew');
  expect(sql).toContain('function public.approve_event_withdrawal');
  expect(sql.match(/pg_advisory_xact_lock/g)).toHaveLength(3);
  expect(sql).toContain('on conflict (event_id, profile_id) do nothing');
  expect(sql).toContain("status not in ('draft', 'rejected')");
  expect(sql).toContain("raise exception 'crew_application_conflict'");
  expect(sql).toContain("raise exception 'crew_withdrawal_conflict'");
});

it('hardens three RPCs while keeping the trigger function non-callable', () => {
  const sql = readMigration();
  expect(sql.match(/security definer/g)).toHaveLength(4);
  expect(sql.match(/set search_path = ''/g)?.length).toBeGreaterThanOrEqual(4);
  expect(sql).toContain('revoke all on function public.assign_event_crew');
  expect(sql).toContain('revoke all on function public.remove_event_crew');
  expect(sql).toContain('revoke all on function public.approve_event_withdrawal');
  expect(sql).toContain('revoke all on function public.enforce_event_application_lifecycle_update() from authenticated');
  expect(sql).toContain('grant execute on function public.assign_event_crew');
  expect(sql).toContain('grant execute on function public.remove_event_crew');
  expect(sql).toContain('grant execute on function public.approve_event_withdrawal');
  expect(sql).toContain('crew_lifecycle_unauthorized');
  expect(sql).toContain('crew_removal_blocked');
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run the same focused Vitest command.

Expected: FAIL because the functions and grants do not exist yet.

- [ ] **Step 3: Implement `assign_event_crew`**

Append the complete function after the unique constraint. It uses the shared event/profile lock key, checks manager roles inside the function, locks the exact application before assignment/timelog rows, accepts only `pending` or a consistent exact `approved` retry, conditionally changes `pending -> approved`, never resets an existing timelog, and inserts days only for a newly created draft. Every stale or inconsistent application state returns `crew_application_conflict`:

```sql
create or replace function public.assign_event_crew(
  p_event_id uuid,
  p_profile_id uuid,
  p_application_id uuid default null,
  p_days jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment_id uuid;
  v_existing_assignment_id uuid;
  v_timelog_id uuid;
  v_timelog_status public.timelog_status;
  v_timelog_created boolean := false;
  v_crew_filled integer;
  v_application_id uuid;
  v_application_status text;
  v_application_already_approved boolean := false;
begin
  if auth.uid() is null or not (
    public.has_role(auth.uid(), 'crewhead'::public.app_role)
    or public.has_role(auth.uid(), 'coo'::public.app_role)
  ) then
    raise exception 'crew_lifecycle_unauthorized' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_event_id::text || ':' || p_profile_id::text, 0)
  );

  perform id
  from public.events
  where id = p_event_id
  for update;
  if not found then
    raise exception 'crew_lifecycle_not_found' using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception 'crew_lifecycle_not_found' using errcode = 'P0002';
  end if;

  if p_application_id is not null then
    select id, status into v_application_id, v_application_status
    from public.event_applications
    where id = p_application_id
      and event_id = p_event_id
      and profile_id = p_profile_id
    for update;

    if not found then
      raise exception 'crew_lifecycle_not_found' using errcode = 'P0002';
    end if;

    if v_application_status not in ('pending', 'approved') then
      raise exception 'crew_application_conflict' using errcode = 'P0001';
    end if;
  end if;

  select id into v_existing_assignment_id
  from public.event_assignments
  where event_id = p_event_id and profile_id = p_profile_id
  for update;

  select id, status into v_timelog_id, v_timelog_status
  from public.timelogs
  where event_id = p_event_id and contractor_id = p_profile_id
  for update;

  if v_application_status = 'approved' then
    if v_existing_assignment_id is null or v_timelog_id is null then
      raise exception 'crew_application_conflict' using errcode = 'P0001';
    end if;
    v_application_already_approved := true;
  end if;

  if v_timelog_id is not null
    and v_existing_assignment_id is null
    and v_timelog_status <> 'draft'::public.timelog_status then
    raise exception 'crew_assignment_conflict' using errcode = 'P0001';
  end if;

  insert into public.event_assignments (event_id, profile_id)
  values (p_event_id, p_profile_id)
  on conflict (event_id, profile_id) do nothing;

  select id into v_assignment_id
  from public.event_assignments
  where event_id = p_event_id and profile_id = p_profile_id;

  if v_timelog_id is null then
    if p_days is null or jsonb_typeof(p_days) <> 'array' then
      raise exception 'crew_assignment_invalid_days' using errcode = '22023';
    end if;

    if jsonb_array_length(p_days) = 0 or exists (
      select 1
      from jsonb_array_elements(p_days) day
      where nullif(day->>'date', '') is null
        or nullif(day->>'time_from', '') is null
        or nullif(day->>'time_to', '') is null
        or nullif(day->>'day_type', '') is null
        or day->>'day_type' not in ('instal', 'provoz', 'deinstal')
    ) then
      raise exception 'crew_assignment_invalid_days' using errcode = '22023';
    end if;

    insert into public.timelogs (event_id, contractor_id, km, note, status)
    values (p_event_id, p_profile_id, 0, '', 'draft')
    returning id into v_timelog_id;

    insert into public.timelog_days (
      timelog_id, date, time_from, time_to, day_type, note
    )
    select
      v_timelog_id,
      (day->>'date')::date,
      day->>'time_from',
      day->>'time_to',
      (day->>'day_type')::public.timelog_type,
      nullif(day->>'note', '')
    from jsonb_array_elements(p_days) day;

    v_timelog_created := true;
  end if;

  if p_application_id is not null and not v_application_already_approved then
    v_application_id := null;
    update public.event_applications
    set status = 'approved', updated_at = pg_catalog.now()
    where id = p_application_id
      and event_id = p_event_id
      and profile_id = p_profile_id
      and status = 'pending'
    returning id into v_application_id;

    if v_application_id is null then
      raise exception 'crew_application_conflict' using errcode = 'P0001';
    end if;
  elsif p_application_id is null then
    update public.event_applications
    set status = 'approved', updated_at = pg_catalog.now()
    where event_id = p_event_id and profile_id = p_profile_id
    returning id into v_application_id;
  end if;

  select count(*)::integer into v_crew_filled
  from public.event_assignments
  where event_id = p_event_id;

  update public.events
  set crew_filled = v_crew_filled
  where id = p_event_id;

  return jsonb_build_object(
    'event_id', p_event_id,
    'profile_id', p_profile_id,
    'assignment_id', v_assignment_id,
    'timelog_id', v_timelog_id,
    'application_id', v_application_id,
    'timelog_created', v_timelog_created,
    'crew_filled', v_crew_filled
  );
exception
  when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then
    raise exception 'crew_assignment_invalid_days' using errcode = '22023';
end;
$$;
```

- [ ] **Step 4: Implement `remove_event_crew` with atomic status blocking**

Append:

```sql
create or replace function public.remove_event_crew(
  p_event_id uuid,
  p_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment_removed boolean := false;
  v_timelog_removed boolean := false;
  v_application_id uuid;
  v_crew_filled integer;
begin
  if auth.uid() is null or not (
    public.has_role(auth.uid(), 'crewhead'::public.app_role)
    or public.has_role(auth.uid(), 'coo'::public.app_role)
  ) then
    raise exception 'crew_lifecycle_unauthorized' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_event_id::text || ':' || p_profile_id::text, 0)
  );

  if not exists (select 1 from public.events where id = p_event_id)
    or not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception 'crew_lifecycle_not_found' using errcode = 'P0002';
  end if;

  perform id
  from public.timelogs
  where event_id = p_event_id and contractor_id = p_profile_id
  for update;

  if exists (
    select 1
    from public.timelogs
    where event_id = p_event_id
      and contractor_id = p_profile_id
      and status not in ('draft', 'rejected')
  ) then
    raise exception 'crew_removal_blocked' using errcode = 'P0001';
  end if;

  delete from public.timelogs
  where event_id = p_event_id
    and contractor_id = p_profile_id
    and status in ('draft', 'rejected');
  v_timelog_removed := found;

  delete from public.event_assignments
  where event_id = p_event_id and profile_id = p_profile_id;
  v_assignment_removed := found;

  update public.event_applications
  set status = 'withdrawn', updated_at = now()
  where event_id = p_event_id and profile_id = p_profile_id
  returning id into v_application_id;

  select count(*)::integer into v_crew_filled
  from public.event_assignments
  where event_id = p_event_id;

  update public.events
  set crew_filled = v_crew_filled
  where id = p_event_id;

  return jsonb_build_object(
    'event_id', p_event_id,
    'profile_id', p_profile_id,
    'application_id', v_application_id,
    'assignment_removed', v_assignment_removed,
    'timelog_removed', v_timelog_removed,
    'crew_filled', v_crew_filled
  );
end;
$$;
```

Because every value other than `draft` and `rejected` is blocked, this automatically protects `pending_ch`, `pending_crew_confirmation`, `pending_coo`, `approved`, `invoiced`, `paid`, and any future state unless explicitly made disposable.

- [ ] **Step 5: Implement exact application-scoped withdrawal approval**

Append `approve_event_withdrawal`. It shares the event/profile lock order, locks the exact application before assignment/timelog rows, accepts only `withdrawal_requested`, and treats `withdrawn` as an exact retry only when assignment and timelog are both already absent:

```sql
create or replace function public.approve_event_withdrawal(
  p_event_id uuid,
  p_profile_id uuid,
  p_application_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment_id uuid;
  v_assignment_removed boolean := false;
  v_timelog_id uuid;
  v_timelog_status public.timelog_status;
  v_timelog_removed boolean := false;
  v_application_id uuid;
  v_application_status text;
  v_crew_filled integer;
begin
  if auth.uid() is null or not (
    public.has_role(auth.uid(), 'crewhead'::public.app_role)
    or public.has_role(auth.uid(), 'coo'::public.app_role)
  ) then
    raise exception 'crew_lifecycle_unauthorized' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_event_id::text || ':' || p_profile_id::text, 0)
  );

  perform id from public.events where id = p_event_id for update;
  if not found then
    raise exception 'crew_lifecycle_not_found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception 'crew_lifecycle_not_found' using errcode = 'P0002';
  end if;

  select id, status into v_application_id, v_application_status
  from public.event_applications
  where id = p_application_id
    and event_id = p_event_id
    and profile_id = p_profile_id
  for update;
  if not found then
    raise exception 'crew_lifecycle_not_found' using errcode = 'P0002';
  end if;

  select id into v_assignment_id
  from public.event_assignments
  where event_id = p_event_id and profile_id = p_profile_id
  for update;

  select id, status into v_timelog_id, v_timelog_status
  from public.timelogs
  where event_id = p_event_id and contractor_id = p_profile_id
  for update;

  if v_application_status = 'withdrawn' then
    if v_assignment_id is not null or v_timelog_id is not null then
      raise exception 'crew_withdrawal_conflict' using errcode = 'P0001';
    end if;
  elsif v_application_status <> 'withdrawal_requested' then
    raise exception 'crew_withdrawal_conflict' using errcode = 'P0001';
  else
    if v_timelog_id is not null and v_timelog_status not in ('draft', 'rejected') then
      raise exception 'crew_removal_blocked' using errcode = 'P0001';
    end if;

    delete from public.timelogs
    where id = v_timelog_id and status in ('draft', 'rejected');
    v_timelog_removed := found;

    delete from public.event_assignments where id = v_assignment_id;
    v_assignment_removed := found;

    update public.event_applications
    set status = 'withdrawn', updated_at = pg_catalog.now()
    where id = p_application_id
      and event_id = p_event_id
      and profile_id = p_profile_id
      and status = 'withdrawal_requested';
    if not found then
      raise exception 'crew_withdrawal_conflict' using errcode = 'P0001';
    end if;
  end if;

  select count(*)::integer into v_crew_filled
  from public.event_assignments
  where event_id = p_event_id;

  update public.events set crew_filled = v_crew_filled where id = p_event_id;

  return pg_catalog.jsonb_build_object(
    'event_id', p_event_id,
    'profile_id', p_profile_id,
    'application_id', v_application_id,
    'assignment_removed', v_assignment_removed,
    'timelog_removed', v_timelog_removed,
    'crew_filled', v_crew_filled
  );
end;
$$;
```

- [ ] **Step 6: Add exact function privileges and finish the migration**

Append:

```sql
revoke all on function public.assign_event_crew(uuid, uuid, uuid, jsonb) from public;
revoke all on function public.assign_event_crew(uuid, uuid, uuid, jsonb) from anon;
grant execute on function public.assign_event_crew(uuid, uuid, uuid, jsonb) to authenticated;

revoke all on function public.remove_event_crew(uuid, uuid) from public;
revoke all on function public.remove_event_crew(uuid, uuid) from anon;
grant execute on function public.remove_event_crew(uuid, uuid) to authenticated;

revoke all on function public.approve_event_withdrawal(uuid, uuid, uuid) from public;
revoke all on function public.approve_event_withdrawal(uuid, uuid, uuid) from anon;
grant execute on function public.approve_event_withdrawal(uuid, uuid, uuid) to authenticated;

commit;
```

This deliberate `SECURITY DEFINER` use is acceptable only with the explicit `auth.uid()`/role checks, empty search path, fully qualified relations, exact signatures, and restricted grants above. Record any Supabase advisor warning for authenticated definer functions and verify it points only to these three reviewed endpoints. The trigger function is separately non-callable by every API role.

- [ ] **Step 7: Add a rolled-back behavioral verification script**

Create `supabase/verify-timelog_assignment_lifecycle.sql` as a single rolled-back transaction. The following is the initial assignment/direct-removal skeleton; extend it with the mandatory cases listed immediately after the block before this step is complete:

```sql
begin;

do $$
declare
  v_manager_user_id uuid;
  v_crew_user_id uuid;
  v_profile_id uuid;
  v_event_id uuid := gen_random_uuid();
  v_application_id uuid := gen_random_uuid();
  v_first_timelog_id uuid;
  v_second_timelog_id uuid;
  v_status public.timelog_status;
  v_blocked boolean;
begin
  select user_id into v_manager_user_id
  from public.user_roles
  where role in ('crewhead', 'coo')
  order by role
  limit 1;

  select ur.user_id, p.id into v_crew_user_id, v_profile_id
  from public.user_roles ur
  join public.profiles p on p.user_id = ur.user_id
  where ur.role = 'crew'
  limit 1;

  assert v_manager_user_id is not null, 'manager fixture is missing';
  assert v_crew_user_id is not null and v_profile_id is not null, 'crew fixture is missing';

  insert into public.events (id, name, crew_needed, crew_filled, status)
  values (v_event_id, 'Lifecycle verification rollback fixture', 1, 0, 'planning');

  insert into public.event_applications (id, event_id, profile_id, status)
  values (v_application_id, v_event_id, v_profile_id, 'pending');

  perform set_config('request.jwt.claim.sub', v_manager_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  perform public.assign_event_crew(
    v_event_id,
    v_profile_id,
    v_application_id,
    '[{"date":"2026-08-15","time_from":"08:00","time_to":"17:00","day_type":"provoz","note":""}]'::jsonb
  );
  perform public.assign_event_crew(
    v_event_id,
    v_profile_id,
    v_application_id,
    '[{"date":"2026-08-15","time_from":"09:00","time_to":"18:00","day_type":"instal","note":"must not replace"}]'::jsonb
  );

  assert (select count(*) from public.event_assignments where event_id = v_event_id) = 1;
  assert (select count(*) from public.timelogs where event_id = v_event_id) = 1;
  assert (select count(*) from public.timelog_days d join public.timelogs t on t.id = d.timelog_id where t.event_id = v_event_id) = 1;
  assert (select status from public.event_applications where id = v_application_id) = 'approved';

  select id into v_first_timelog_id from public.timelogs where event_id = v_event_id;
  perform public.remove_event_crew(v_event_id, v_profile_id);
  assert not exists (select 1 from public.event_assignments where event_id = v_event_id);
  assert not exists (select 1 from public.timelogs where event_id = v_event_id);
  assert (select status from public.event_applications where id = v_application_id) = 'withdrawn';

  update public.event_applications set status = 'pending' where id = v_application_id;
  perform public.assign_event_crew(
    v_event_id,
    v_profile_id,
    v_application_id,
    '[{"date":"2026-08-16","time_from":"08:00","time_to":"17:00","day_type":"provoz","note":"clean reapplication"}]'::jsonb
  );
  select id into v_second_timelog_id from public.timelogs where event_id = v_event_id;
  assert v_second_timelog_id <> v_first_timelog_id, 'removed draft was restored';

  foreach v_status in array array[
    'pending_ch', 'pending_crew_confirmation', 'pending_coo',
    'approved', 'invoiced', 'paid'
  ]::public.timelog_status[] loop
    delete from public.timelogs where event_id = v_event_id;
    insert into public.timelogs (event_id, contractor_id, status)
    values (v_event_id, v_profile_id, v_status);
    v_blocked := false;
    begin
      perform public.remove_event_crew(v_event_id, v_profile_id);
    exception when others then
      v_blocked := sqlerrm = 'crew_removal_blocked';
    end;
    assert v_blocked, format('removal did not block status %s', v_status);
    assert exists (select 1 from public.event_assignments where event_id = v_event_id);
    assert exists (select 1 from public.timelogs where event_id = v_event_id and status = v_status);
    assert (select status from public.event_applications where id = v_application_id) = 'approved';
  end loop;

  perform set_config('request.jwt.claim.sub', v_crew_user_id::text, true);
  v_blocked := false;
  begin
    perform public.remove_event_crew(v_event_id, v_profile_id);
  exception when others then
    v_blocked := sqlerrm = 'crew_lifecycle_unauthorized';
  end;
  assert v_blocked, 'Crew caller reached manager lifecycle RPC';
end
$$;

rollback;
```

The final verifier must be self-contained and must not depend on pre-existing pure CrewHead/COO fixtures. It temporarily assigns the selected manager user `crewhead`, exercises the CrewHead path, removes that role, assigns `coo`, exercises the COO path, removes it, and restores only the roles needed for later cases inside the transaction. In addition to the skeleton it must verify:

- exact `proacl` contracts for all three manager RPCs and no callable ACL for `enforce_event_application_lifecycle_update()`;
- the trigger exists, owns Crew `updated_at`, freezes `id`, `event_id`, `profile_id`, and `created_at`, permits only same-status, `pending -> withdrawn`, `rejected|withdrawn -> pending`, and `approved -> withdrawal_requested`, and rejects every other Crew transition without changing any row;
- Crew cannot call `assign_event_crew`, `remove_event_crew`, or `approve_event_withdrawal`;
- pending approval, exact approved retry, stale approval states, and inconsistent approved retries, with `crew_application_conflict` and unchanged row snapshots on every conflict;
- withdrawal approval from `withdrawal_requested`, exact clean `withdrawn` retry, stale withdrawal states, inconsistent withdrawn retries, and non-disposable blocking, with `crew_withdrawal_conflict` or `crew_removal_blocked` and unchanged row snapshots as appropriate;
- direct removal remains the intentional two-argument operation and re-application creates one new clean draft;
- the whole script ends with `rollback` and leaves no fixtures, roles, assignments, applications, timelogs, or event counts behind.

- [ ] **Step 8: Run static migration tests and the remote baseline lint**

Run:

```bash
npm test -- src/features/events/services/event-assignment-lifecycle-migration.test.ts
supabase db lint --linked --level error --fail-on error
```

Expected: migration test PASS and no new SQL errors. Do not apply the migration yet.

- [ ] **Step 9: Commit the RPC migration and verification script**

```bash
LIFECYCLE_MIGRATION="$(find supabase/migrations -maxdepth 1 -type f -name '*_timelog_assignment_lifecycle.sql' -print)"
git add "$LIFECYCLE_MIGRATION" supabase/verify-timelog_assignment_lifecycle.sql src/features/events/services/event-assignment-lifecycle-migration.test.ts
git commit -m "feat: add atomic crew lifecycle RPCs"
```

## Task 4: Add the typed RPC adapter and stable error mapping

**Files:**
- Modify: `src/types.ts:130-158`
- Modify: `src/lib/database.types.ts:1-12, 484-536`
- Create: `src/features/events/services/event-assignment-lifecycle.service.ts`
- Create: `src/features/events/services/event-assignment-lifecycle.service.test.ts`

- [ ] **Step 1: Write failing adapter tests**

The focused test must mock `supabase.rpc` and cover:

```ts
it('sends canonical UUIDs and normalized days to assign_event_crew', async () => {
  rpc.mockResolvedValue({ data: assignmentResult, error: null });
  await assignEventCrewRpc({
    eventId: 'event-1',
    profileId: 'profile-1',
    applicationId: 'application-1',
    days: [{ d: '2026-08-15', f: '08:00', t: '17:00', type: 'provoz', note: '' }],
  });
  expect(rpc).toHaveBeenCalledWith('assign_event_crew', {
    p_event_id: 'event-1',
    p_profile_id: 'profile-1',
    p_application_id: 'application-1',
    p_days: [{ date: '2026-08-15', time_from: '08:00', time_to: '17:00', day_type: 'provoz', note: null }],
  });
});

it.each([
  ['crew_lifecycle_unauthorized', 'Tuto akci může provést pouze CrewHead nebo COO.'],
  ['crew_lifecycle_not_found', 'Akce nebo člen Crew nebyl nalezen.'],
  ['crew_assignment_conflict', 'Výkaz pro tuto Crew a akci už existuje a nelze ho přepsat.'],
  ['crew_assignment_invalid_days', 'Pro přiřazení Crew nejsou k dispozici platné směny.'],
  ['crew_removal_blocked', 'Crew nelze odebrat, protože výkaz už byl odeslán ke kontrole.'],
  ['crew_application_conflict', 'Stav přihlášky se mezitím změnil. Obnovte detail akce a zkuste to znovu.'],
  ['crew_withdrawal_conflict', 'Stav žádosti o odhlášení se mezitím změnil. Obnovte detail akce a zkuste to znovu.'],
])('maps %s to a stable Czech domain error', async (token, expected) => {
  rpc.mockResolvedValue({ data: null, error: { message: token } });
  await expect(removeEventCrewRpc('event-1', 'profile-1')).rejects.toThrow(expected);
});

it('sends the exact application UUID to approve_event_withdrawal', async () => {
  rpc.mockResolvedValue({ data: removalResult, error: null });
  await approveEventWithdrawalRpc('event-1', 'profile-1', 'application-1');
  expect(rpc).toHaveBeenCalledWith('approve_event_withdrawal', {
    p_event_id: 'event-1',
    p_profile_id: 'profile-1',
    p_application_id: 'application-1',
  });
});

it('treats only draft and rejected as disposable', () => {
  expect(isDisposableTimelogStatus('draft')).toBe(true);
  expect(isDisposableTimelogStatus('rejected')).toBe(true);
  expect(isDisposableTimelogStatus('pending_crew_confirmation')).toBe(false);
  expect(isDisposableTimelogStatus('approved')).toBe(false);
});
```

- [ ] **Step 2: Run the test and verify it fails because the adapter does not exist**

Run:

```bash
npm test -- src/features/events/services/event-assignment-lifecycle.service.test.ts
```

Expected: FAIL on unresolved module/exports.

- [ ] **Step 3: Update deployed status and RPC types**

Add `pending_crew_confirmation` to `TimelogStatus` in both `src/types.ts` and `src/lib/database.types.ts`. Add these database function entries:

```ts
assign_event_crew: {
  Args: {
    p_event_id: string;
    p_profile_id: string;
    p_application_id?: string | null;
    p_days?: Json;
  };
  Returns: Json;
};
remove_event_crew: {
  Args: {
    p_event_id: string;
    p_profile_id: string;
  };
  Returns: Json;
};
approve_event_withdrawal: {
  Args: {
    p_event_id: string;
    p_profile_id: string;
    p_application_id: string;
  };
  Returns: Json;
};
```

- [ ] **Step 4: Implement the focused RPC adapter**

Use these public types and functions in `event-assignment-lifecycle.service.ts`:

```ts
import { supabase } from '../../../lib/supabase';
import { Timelog, TimelogStatus } from '../../../types';

export interface AssignEventCrewRpcResult {
  event_id: string;
  profile_id: string;
  assignment_id: string;
  timelog_id: string;
  application_id: string | null;
  timelog_created: boolean;
  crew_filled: number;
}

export interface RemoveEventCrewRpcResult {
  event_id: string;
  profile_id: string;
  application_id: string | null;
  assignment_removed: boolean;
  timelog_removed: boolean;
  crew_filled: number;
}

const ERROR_MESSAGES = {
  crew_lifecycle_unauthorized: 'Tuto akci může provést pouze CrewHead nebo COO.',
  crew_lifecycle_not_found: 'Akce nebo člen Crew nebyl nalezen.',
  crew_assignment_conflict: 'Výkaz pro tuto Crew a akci už existuje a nelze ho přepsat.',
  crew_assignment_invalid_days: 'Pro přiřazení Crew nejsou k dispozici platné směny.',
  crew_removal_blocked: 'Crew nelze odebrat, protože výkaz už byl odeslán ke kontrole.',
  crew_application_conflict: 'Stav přihlášky se mezitím změnil. Obnovte detail akce a zkuste to znovu.',
  crew_withdrawal_conflict: 'Stav žádosti o odhlášení se mezitím změnil. Obnovte detail akce a zkuste to znovu.',
} as const;

const toDomainError = (error: { message?: string } | null): Error => {
  const rawMessage = error?.message ?? '';
  const token = (Object.keys(ERROR_MESSAGES) as Array<keyof typeof ERROR_MESSAGES>)
    .find((candidate) => rawMessage.includes(candidate));
  if (token) return new Error(ERROR_MESSAGES[token]);
  console.error('Unexpected Crew lifecycle RPC error', error);
  return new Error('Operaci s Crew se nepodařilo dokončit.');
};

const assertObject = <T>(value: unknown): T => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Operaci s Crew se nepodařilo dokončit.');
  }
  return value as T;
};

export const isDisposableTimelogStatus = (status: TimelogStatus): boolean => (
  status === 'draft' || status === 'rejected'
);

export const assignEventCrewRpc = async (input: {
  eventId: string;
  profileId: string;
  applicationId?: string | null;
  days: Timelog['days'];
}): Promise<AssignEventCrewRpcResult> => {
  if (!supabase) throw new Error('Operaci s Crew se nepodařilo dokončit.');
  const result = await supabase.rpc('assign_event_crew', {
    p_event_id: input.eventId,
    p_profile_id: input.profileId,
    p_application_id: input.applicationId ?? null,
    p_days: input.days.map((day) => ({
      date: day.d,
      time_from: day.f,
      time_to: day.t,
      day_type: day.type,
      note: day.note?.trim() || null,
    })),
  });
  if (result.error) throw toDomainError(result.error);
  return assertObject<AssignEventCrewRpcResult>(result.data);
};

export const removeEventCrewRpc = async (
  eventId: string,
  profileId: string,
): Promise<RemoveEventCrewRpcResult> => {
  if (!supabase) throw new Error('Operaci s Crew se nepodařilo dokončit.');
  const result = await supabase.rpc('remove_event_crew', {
    p_event_id: eventId,
    p_profile_id: profileId,
  });
  if (result.error) throw toDomainError(result.error);
  return assertObject<RemoveEventCrewRpcResult>(result.data);
};

export const approveEventWithdrawalRpc = async (
  eventId: string,
  profileId: string,
  applicationId: string,
): Promise<RemoveEventCrewRpcResult> => {
  if (!supabase) throw new Error('Operaci s Crew se nepodařilo dokončit.');
  const result = await supabase.rpc('approve_event_withdrawal', {
    p_event_id: eventId,
    p_profile_id: profileId,
    p_application_id: applicationId,
  });
  if (result.error) throw toDomainError(result.error);
  return assertObject<RemoveEventCrewRpcResult>(result.data);
};
```

- [ ] **Step 5: Run adapter and type tests**

```bash
npm test -- src/features/events/services/event-assignment-lifecycle.service.test.ts src/lib/supabase-mappers.test.ts
npm run build
```

Expected: focused tests PASS and TypeScript build succeeds.

- [ ] **Step 6: Commit the adapter**

```bash
git add src/types.ts src/lib/database.types.ts src/features/events/services/event-assignment-lifecycle.service.ts src/features/events/services/event-assignment-lifecycle.service.test.ts
git commit -m "feat: add typed crew lifecycle RPC client"
```

## Task 5: Switch event mutations to the atomic RPCs

**Files:**
- Modify: `src/features/events/services/events.service.ts:937-962, 1444-1547, 1635-1750`
- Modify: `src/features/events/services/events.service.test.ts:855-1063`
- Modify: `src/features/events/types/events.types.ts:16-19`

- [ ] **Step 1: Replace the old multi-request service tests with failing RPC expectations**

Cover these exact cases in `events.service.test.ts`:

```ts
it('approves an application with one assignment RPC and no separate status update', async () => {
  await approveEventApplication(1);
  expect(assignEventCrewRpc).toHaveBeenCalledWith(expect.objectContaining({
    eventId: 'event-row-1',
    profileId: 'profile-uuid-1',
    applicationId: 'application-row-1',
  }));
  expect(eventApplicationsUpdate).not.toHaveBeenCalled();
});

it('hydrates the canonical timelog returned by repeated assignment', async () => {
  assignEventCrewRpc.mockResolvedValue({ ...rpcAssignment, timelog_created: false });
  const result = await assignCrewToEvent(1, 'profile-uuid-1');
  expect(result.timelog.contractorProfileId).toBe('profile-uuid-1');
  expect(snapshot.timelogs.filter((item) => item.contractorProfileId === 'profile-uuid-1')).toHaveLength(1);
});

it('keeps direct removal separate from exact withdrawal approval', async () => {
  await removeContractorFromEvent(1, 'profile-uuid-1');
  await approveEventWithdrawal(1);
  expect(removeEventCrewRpc).toHaveBeenCalledOnce();
  expect(removeEventCrewRpc).toHaveBeenCalledWith('event-row-1', 'profile-uuid-1');
  expect(approveEventWithdrawalRpc).toHaveBeenCalledOnce();
  expect(approveEventWithdrawalRpc).toHaveBeenCalledWith(
    'event-row-1',
    'profile-uuid-1',
    'application-row-1',
  );
  expect(eventApplicationsUpdate).not.toHaveBeenCalled();
});

it('keeps local state unchanged when removal is blocked', async () => {
  removeEventCrewRpc.mockRejectedValue(new Error('Crew nelze odebrat, protože výkaz už byl odeslán ke kontrole.'));
  const before = structuredClone(snapshot);
  await expect(removeContractorFromEvent(1, 'profile-uuid-1')).rejects.toThrow('Crew nelze odebrat');
  expect(snapshot).toEqual(before);
});
```

- [ ] **Step 2: Run the focused event service tests and verify failure**

```bash
npm test -- src/features/events/services/events.service.test.ts
```

Expected: FAIL because the service still performs separate REST writes.

- [ ] **Step 3: Add a single authoritative refresh helper**

In `events.service.ts`, import the RPC adapter and add:

```ts
const refreshEventLifecycleState = async (): Promise<void> => {
  const { fetchTimelogsSnapshot } = await import('../../timelogs/services/timelogs.service');
  await Promise.all([fetchEventsSnapshot(), fetchTimelogsSnapshot()]);
  invalidateEventQueries();
};
```

Local cache updates must happen only after the RPC succeeds. If refresh fails, log the original diagnostic error and throw `Operaci s Crew se nepodařilo dokončit.` rather than fabricating partial local state.

- [ ] **Step 4: Convert Supabase assignment to the RPC and keep local fallback**

Extend `assignCrewToEvent` with optional `applicationSupabaseId?: string | null`. Keep event/profile/day/collision validation before the data-source split. In Supabase mode:

```ts
const eventRowId = await getSupabaseEventRowId(event.id);
const rpcResult = await assignEventCrewRpc({
  eventId: eventRowId,
  profileId: contractorProfileId,
  applicationId: applicationSupabaseId ?? null,
  days: initialDays,
});
await refreshEventLifecycleState();
const refreshed = getLocalAppState();
const refreshedEvent = refreshed.events.find((item) => item.supabaseId === rpcResult.event_id);
const canonicalTimelog = refreshed.timelogs.find((item) => item.supabaseId === rpcResult.timelog_id);
if (!refreshedEvent || !canonicalTimelog) {
  throw new Error('Operaci s Crew se nepodařilo dokončit.');
}
return { event: refreshedEvent, timelog: canonicalTimelog, rpc: rpcResult };
```

Only the local fallback should retain the old `Tento clen crew uz je na akci prirazen.` guard and in-memory insert. Remove all Supabase `.from('timelogs').insert`, `.from('timelog_days').insert`, and separate `events.crew_filled` updates from this function.

- [ ] **Step 5: Convert approval and removal orchestration**

`approveEventApplication` must require `application.supabaseId` in Supabase mode and pass it to `assignCrewToEvent`; remove the following `updateEventApplicationStatus` call.

`removeContractorFromEvent` in Supabase mode must call only:

```ts
const eventRowId = await getSupabaseEventRowId(eventId);
await removeEventCrewRpc(eventRowId, contractorProfileId);
await refreshEventLifecycleState();
const refreshed = getLocalAppState();
return {
  event: refreshed.events.find((item) => item.supabaseId === eventRowId) as Event,
  timelogs: refreshed.timelogs,
};
```

The local fallback must first reject when any matching timelog is not disposable, then remove `draft`/`rejected` timelogs and assignments, set the matching local application to `withdrawn`, and recalculate `filled`.

`approveEventWithdrawal` must not call `removeContractorFromEvent`. In Supabase mode it requires `application.supabaseId` and the canonical event UUID, calls only `approveEventWithdrawalRpc(eventUuid, profileUuid, applicationUuid)`, performs the authoritative lifecycle refresh, then validates that the exact application is `withdrawn` and no event/profile timelog remains. Local mode keeps the equivalent in-memory transition.

- [ ] **Step 6: Map direct Crew trigger conflicts before they reach either UI**

`applyForEvent` and `requestEventWithdrawal` share the Supabase `event_applications` upsert boundary used by EventDetailView and EventsView. Add RED tests that make the upsert return `{ message: 'crew_lifecycle_unauthorized' }` after the local snapshot passed validation. The service must map re-application to:

```text
Stav přihlášky se mezitím změnil. Obnovte detail akce a zkuste to znovu.
```

and withdrawal request to:

```text
Stav žádosti o odhlášení se mezitím změnil. Obnovte detail akce a zkuste to znovu.
```

For any other database error at this boundary, log `Unexpected Crew application lifecycle mutation error` with the original error and throw `Operaci s Crew se nepodařilo dokončit.`. Do not update local state on either failure. This central mapping is what guarantees that neither UI flow can toast a raw trigger, RLS, or unique-constraint diagnostic.

- [ ] **Step 7: Extend `EventAssignmentResult` consistently**

Add optional canonical RPC metadata without changing UI callers:

```ts
export interface EventAssignmentResult {
  event: Event;
  timelog: Timelog;
  rpc?: AssignEventCrewRpcResult;
}
```

Import `AssignEventCrewRpcResult` from the focused adapter using a type-only import.

- [ ] **Step 8: Run event service and UUID identity tests**

```bash
npm test -- src/features/events/services/events.service.test.ts src/features/events/services/event-assignment-lifecycle.service.test.ts src/components/modals/uuid-contractor-modal-identity.test.tsx src/features/uuid-write-flows.integration.test.ts src/features/timelogs/services/timelogs.service.test.ts src/features/invoices/services/approval-timelog-sync.service.test.ts
```

Expected: PASS; no old table-write expectation remains.

- [ ] **Step 9: Commit service orchestration**

```bash
git add src/features/events/services/events.service.ts src/features/events/services/events.service.test.ts src/features/events/types/events.types.ts
git commit -m "refactor: use atomic crew lifecycle operations"
```

## Task 6: Prevent invalid and repeated UI actions

**Files:**
- Modify: `src/views/EventDetailView.tsx:65-70, 188-197, 281-303, 801-826, 947-1009`
- Create: `src/views/EventDetailView.lifecycle.test.tsx`
- Modify: `src/components/modals/AssignCrewModal.tsx:39-69, 180-187, 193-229`
- Modify: `src/components/modals/uuid-contractor-modal-identity.test.tsx`

- [ ] **Step 1: Write failing event-detail lifecycle tests**

The focused UI test should render a manager event with one contractor and assert:

```ts
it('disables removal when any Crew timelog is already submitted', async () => {
  renderManagerDetail({ timelogStatus: 'pending_ch' });
  const remove = screen.getByRole('button', { name: 'Crew nelze odebrat – výkaz byl odeslán' });
  expect(remove).toBeDisabled();
  expect(remove).toHaveAttribute(
    'title',
    'Crew nelze odebrat, protože výkaz už byl odeslán ke kontrole.',
  );
});

it('calls removal only once while the first request is pending', async () => {
  let resolveRemoval!: () => void;
  removeContractorFromEvent.mockReturnValue(new Promise<void>((resolve) => {
    resolveRemoval = resolve;
  }));
  renderManagerDetail({ timelogStatus: 'draft' });
  const remove = screen.getByRole('button', { name: 'Odebrat Petr Heitzer z akce' });
  fireEvent.click(remove);
  fireEvent.click(remove);
  expect(removeContractorFromEvent).toHaveBeenCalledTimes(1);
  expect(remove).toBeDisabled();
  resolveRemoval();
  await waitFor(() => expect(remove).not.toBeDisabled());
});

it('calls application approval only once while pending', async () => {
  let resolveApproval!: () => void;
  approveEventApplication.mockReturnValue(new Promise<void>((resolve) => {
    resolveApproval = resolve;
  }));
  renderManagerDetail({ pendingApplication: true });
  const approve = screen.getByRole('button', { name: 'Schvalit' });
  fireEvent.click(approve);
  fireEvent.click(approve);
  expect(approveEventApplication).toHaveBeenCalledTimes(1);
  expect(approve).toBeDisabled();
  resolveApproval();
  await waitFor(() => expect(approve).not.toBeDisabled());
});
```

Build `renderManagerDetail` in the new file from the same minimal mocks already used in `EventDetailView.test.tsx`; keep this file focused on lifecycle controls only.

- [ ] **Step 2: Run the new UI test and verify failure**

```bash
npm test -- src/views/EventDetailView.lifecycle.test.tsx
```

Expected: FAIL because buttons are not status-aware and action handlers have no in-flight guard.

- [ ] **Step 3: Add EventDetail status and in-flight guards**

Import `isDisposableTimelogStatus`. Add one action key state:

```ts
const [pendingCrewAction, setPendingCrewAction] = useState<string | null>(null);
```

For each assigned contractor compute all matching event timelogs and:

```ts
const removalBlocked = contractorTimelogs.some(
  (item) => !isDisposableTimelogStatus(item.status),
);
const removalKey = `remove:${contractor.profileId}`;
const removalPending = pendingCrewAction === removalKey;
```

The removal button must use:

```tsx
disabled={removalBlocked || removalPending}
aria-label={removalBlocked
  ? 'Crew nelze odebrat – výkaz byl odeslán'
  : `Odebrat ${contractor.name} z akce`}
title={removalBlocked
  ? 'Crew nelze odebrat, protože výkaz už byl odeslán ke kontrole.'
  : 'Odebrat z akce'}
```

Convert approve/remove handlers to `async`, return immediately when any Crew action is pending, set a unique key before awaiting, call `loadDetail()` after success, and clear the key in `finally`. Apply the same pattern to withdrawal approval buttons.

- [ ] **Step 4: Add a failing direct-assignment double-click test**

In `uuid-contractor-modal-identity.test.tsx`, keep the existing UUID assertion and add a deferred `assignCrewToEvent` promise. Click the available contractor twice and expect one call plus a disabled button until resolution.

- [ ] **Step 5: Add `AssignCrewModal` in-flight state**

Add:

```ts
const [assigningProfileId, setAssigningProfileId] = useState<string | null>(null);
```

At the start of `assignContractor`, return if non-null; set the profile ID before the request and clear it in `finally`. Disable the contractor row and phase-confirm button while an assignment is active, use `aria-busy`, and keep the database idempotency as the retry/concurrency backstop.

- [ ] **Step 6: Run focused UI tests**

```bash
npm test -- src/views/EventDetailView.lifecycle.test.tsx src/views/EventDetailView.test.tsx src/components/modals/uuid-contractor-modal-identity.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit the UI safeguards**

```bash
git add src/views/EventDetailView.tsx src/views/EventDetailView.lifecycle.test.tsx src/components/modals/AssignCrewModal.tsx src/components/modals/uuid-contractor-modal-identity.test.tsx
git commit -m "fix: guard crew assignment lifecycle actions"
```

## Task 7: Verify locally, deploy schema first, and validate production

**Files:**
- Verify all files from Tasks 1-6
- No source changes unless verification finds a defect

- [ ] **Step 1: Run formatting/static checks on the migration and plan scope**

```bash
git diff --check 1962eab..HEAD
LIFECYCLE_MIGRATION="$(find supabase/migrations -maxdepth 1 -type f -name '*_timelog_assignment_lifecycle.sql' -print)"
test -n "$LIFECYCLE_MIGRATION"
rg -n "T[B]D|T[O]DO|implement[[:space:]]later|new row violates row-level security|timelogs_event_contractor_unique|assign_event_crew|remove_event_crew|approve_event_withdrawal|enforce_event_application_lifecycle_update|crew_application_conflict|crew_withdrawal_conflict" "$LIFECYCLE_MIGRATION" src/features/events src/features/timelogs src/views/EventDetailView.tsx src/components/modals/AssignCrewModal.tsx
```

Expected: no placeholders or raw RLS user message; required names appear.

- [ ] **Step 2: Run focused tests, then the full test and build gates**

```bash
npm test -- src/features/events/services/event-assignment-lifecycle-migration.test.ts src/features/events/services/event-assignment-lifecycle.service.test.ts src/features/events/services/events.service.test.ts src/features/timelogs/services/timelogs.service.test.ts src/features/invoices/services/approval-timelog-sync.service.test.ts src/features/uuid-write-flows.integration.test.ts src/views/EventDetailView.lifecycle.test.tsx src/views/EventDetailView.test.tsx src/components/modals/uuid-contractor-modal-identity.test.tsx
npx tsc --noEmit
npm test
npm run lint
npm run build
```

Expected: all tests PASS, lint exits 0, and Vite production build succeeds. If unrelated pre-existing dirty tests fail, record them separately and prove all touched-file tests pass.

- [ ] **Step 3: Re-read production state before any migration write**

Run read-only linked queries and confirm the assumptions have not drifted:

```bash
supabase migration list --linked
supabase db query --linked "select count(*) as duplicate_groups, coalesce(sum(row_count - 1), 0) as excess_rows from (select count(*) as row_count from public.timelogs group by event_id, contractor_id having count(*) > 1) groups;"
supabase db query --linked "select count(*) as invoice_links from public.invoice_timelogs where timelog_id in ('c55d4794-42d3-46be-aba4-931c40e495c0','ead03ebc-bc28-49ea-9297-86da3b64fcfa','9c5a8932-fb1c-4439-a6d9-955df5c12748','ce599341-ec8f-4d07-9e6d-32af0afbaa9a','33beefe4-98d0-493f-b621-42699dd99107','84dc508f-82b7-4ecd-a099-c95016a77741','b51d25df-4415-4951-9f99-fea599d33ab5','f550a5a3-9ea8-4e4d-9265-6fa377b99d5b','0ee6341d-ecc3-444d-bf4c-740392e13ac1','b4e14c6a-90f4-415a-b822-f20ce51736d8','623e3ece-5240-4d99-a354-0061e303ba3d','696327a8-8b93-4ffa-9bc8-f2eb084e5744','d2c42270-64ab-46a8-94f3-bc61fe0f4162');"
```

Expected before migration: `duplicate_groups = 9`, `excess_rows = 13`, `invoice_links = 0`. Stop if any value differs; the migration is designed to abort rather than guess.

- [ ] **Step 4: Dry-run and apply the database migration before deploying frontend code**

```bash
supabase db push --linked --dry-run
supabase db push --linked
```

Expected: dry run lists only the intended new lifecycle migration; push succeeds once. If it lists unrelated migrations, stop and reconcile migration history instead of using `--include-all`.

- [ ] **Step 5: Run database advisors and the rolled-back behavior suite**

```bash
supabase db lint --linked --level error --fail-on error
supabase db advisors --linked --type security --level warn
supabase db advisors --linked --type performance --level warn
supabase db query --linked --file supabase/verify-timelog_assignment_lifecycle.sql
```

Expected: behavior script completes and rolls back; no new unreviewed advisor error. Any warning for the three authenticated `SECURITY DEFINER` RPC endpoints must be reviewed against their explicit role checks, empty search path, exact signatures, and restricted grants rather than silently ignored. `enforce_event_application_lifecycle_update()` is a fourth `SECURITY DEFINER` function but not an endpoint: its ACL must remain non-callable by `PUBLIC`, `anon`, and `authenticated`, and only the installed trigger may invoke it.

- [ ] **Step 6: Verify production invariants and the Red Bull record**

```bash
supabase db query --linked "select event_id, contractor_id, count(*) from public.timelogs group by event_id, contractor_id having count(*) > 1;"
supabase db query --linked "select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.timelogs'::regclass and conname = 'timelogs_event_contractor_unique';"
supabase db query --linked "select id, event_id, contractor_id, status, created_at, updated_at from public.timelogs where event_id = 'bd8dcdf6-961a-43c0-9f35-d3bae4c4a2ef' and contractor_id = 'd78b1623-712b-42aa-bbc5-897b73f63ffb';"
```

Expected: first query returns zero rows; constraint is `UNIQUE (event_id, contractor_id)`; Red Bull returns exactly canonical timelog `1489bcb7-b4fa-4c93-a92d-5433e725ba03`.

- [ ] **Step 7: Perform the authenticated application smoke test**

Using the application UI after the schema migration is present:

1. Sign in as Petr Heitzer/Crew and submit the retained Red Bull draft to CrewHead.
2. Confirm the status changes to `pending_ch` and no raw RLS/unique error appears.
3. On a disposable test draft, remove Crew as CrewHead/COO and confirm the assignment, timelog, days, application status, and `crew_filled` change together.
4. Re-apply and approve the same Crew profile; confirm exactly one new clean draft exists.
5. Request withdrawal as Crew, approve that exact request as CrewHead/COO, and confirm `approve_event_withdrawal` changes the exact application to `withdrawn` while removing assignment and disposable timelog atomically.
6. Attempt approval or withdrawal approval from a stale application status; confirm the stable Czech application/withdrawal conflict and verify no rows changed.
7. Attempt removal after submission; confirm the Czech blocking message and verify no rows changed.
8. Confirm Crew re-application and withdrawal-request failures never expose `crew_lifecycle_unauthorized`, RLS text, or a unique-constraint diagnostic in either event UI.

- [ ] **Step 8: Inspect final scope and commit any verification-only corrections**

```bash
git status --short
git log --oneline -6
git diff --check
```

Expected: only intentional lifecycle files are committed; the user's pre-existing dirty files remain untouched. If verification required a correction, rerun the affected RED/GREEN test and commit only those lifecycle files with a focused message.

## Acceptance checklist

- [ ] Production has zero duplicate `(event_id, contractor_id)` timelog groups.
- [ ] `timelogs_event_contractor_unique` exists with the exact two-column definition.
- [ ] Repeated assignment approval returns the existing assignment/timelog and never resets days or status.
- [ ] Concurrent callers are serialized by the shared advisory lock and protected by unique constraints.
- [ ] Exactly three authenticated manager RPCs exist: `assign_event_crew`, `remove_event_crew`, and `approve_event_withdrawal`; each enforces CrewHead/COO internally and has the reviewed ACL.
- [ ] `enforce_event_application_lifecycle_update()` is installed as a `BEFORE UPDATE` trigger and is not executable by any API role.
- [ ] `draft` and `rejected` removal deletes the timelog/days/assignment and withdraws the application atomically.
- [ ] Every other current or future timelog status blocks removal atomically.
- [ ] Re-application after valid removal creates one new clean draft.
- [ ] Assignment approval and withdrawal approval are scoped to the exact application UUID; stale or inconsistent state produces `crew_application_conflict` or `crew_withdrawal_conflict` with no partial writes.
- [ ] Crew can change only its own application through the documented transition graph and cannot mutate application identity columns.
- [ ] Canonical event and timelog UUIDs survive hydration and refresh and are used for every Supabase write.
- [ ] Crew cannot execute manager lifecycle mutations successfully.
- [ ] UI controls block repeated clicks but do not replace database idempotency.
- [ ] Expected conflicts produce stable Czech domain messages; raw RLS, unique, trigger, and RPC messages remain diagnostic only in EventDetailView and EventsView.
- [ ] Schema migration is deployed before frontend code that calls the RPCs.
- [ ] This design and implementation plan describe the deployed three-RPC/trigger contract before the production push; any schema or contract drift stops deployment.
