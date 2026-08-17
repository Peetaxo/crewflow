import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationDirectory = join(process.cwd(), 'supabase', 'migrations');
const migrationFiles = readdirSync(migrationDirectory)
  .filter((name) => name.endsWith('_timelog_assignment_lifecycle.sql'));
const verificationScriptPath = join(
  process.cwd(),
  'supabase',
  'verify-timelog_assignment_lifecycle.sql',
);

const readMigration = () => {
  expect(migrationFiles).toHaveLength(1);
  return readFileSync(join(migrationDirectory, migrationFiles[0]), 'utf8').toLowerCase();
};

const readVerificationScript = () => readFileSync(verificationScriptPath, 'utf8').toLowerCase();

const repairPairs = [
  ['5e062036-278f-4e39-b0cd-8d02d33ced13', 'c55d4794-42d3-46be-aba4-931c40e495c0'],
  ['5e062036-278f-4e39-b0cd-8d02d33ced13', 'ead03ebc-bc28-49ea-9297-86da3b64fcfa'],
  ['0a75d458-e4e2-441e-8827-5b3d7778b186', '9c5a8932-fb1c-4439-a6d9-955df5c12748'],
  ['34807683-1ab8-4772-aa2d-ce8c5b55a720', 'ce599341-ec8f-4d07-9e6d-32af0afbaa9a'],
  ['b7a6497e-44ff-4f55-bf89-629adb02bb88', '33beefe4-98d0-493f-b621-42699dd99107'],
  ['b7a6497e-44ff-4f55-bf89-629adb02bb88', '84dc508f-82b7-4ecd-a099-c95016a77741'],
  ['b7a6497e-44ff-4f55-bf89-629adb02bb88', 'b51d25df-4415-4951-9f99-fea599d33ab5'],
  ['7e6ab2b5-261b-4a12-b7e0-3fdd5c0afe63', 'f550a5a3-9ea8-4e4d-9265-6fa377b99d5b'],
  ['ddfaf624-b422-48bf-889e-c43ecd4bc8b5', '0ee6341d-ecc3-444d-bf4c-740392e13ac1'],
  ['1489bcb7-b4fa-4c93-a92d-5433e725ba03', 'b4e14c6a-90f4-415a-b822-f20ce51736d8'],
  ['286d8093-4c9f-4762-ad27-a04ad6291591', '623e3ece-5240-4d99-a354-0061e303ba3d'],
  ['286d8093-4c9f-4762-ad27-a04ad6291591', '696327a8-8b93-4ffa-9bc8-f2eb084e5744'],
  ['c5190763-785c-4f7b-b96b-c0c29c960e0b', 'd2c42270-64ab-46a8-94f3-bc61fe0f4162'],
] as const;

const canonicalIds = [...new Set(repairPairs.map(([canonicalId]) => canonicalId))];
const duplicateIds = repairPairs.map(([, duplicateId]) => duplicateId);

const expectMarkersInOrder = (sql: string, markers: readonly string[]) => {
  let previousIndex = -1;

  markers.forEach((marker) => {
    const markerIndex = sql.indexOf(marker);
    expect(markerIndex, `missing or out-of-order SQL marker: ${marker}`).toBeGreaterThan(previousIndex);
    previousIndex = markerIndex;
  });
};

const readFunction = (sql: string, functionName: string) => {
  const match = sql.match(
    new RegExp(
      `create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}([\\s\\S]*?)\\n\\$\\$;`,
    ),
  );

  expect(match, `missing function public.${functionName}`).not.toBeNull();
  return match?.[0] ?? '';
};

describe('timelog assignment lifecycle migration', () => {
  it('contains the complete explicit production repair map', () => {
    const sql = readMigration();

    expect(repairPairs).toHaveLength(13);
    expect(canonicalIds).toHaveLength(9);
    expect(duplicateIds).toHaveLength(13);
    expect(new Set(canonicalIds).size).toBe(9);
    expect(new Set(duplicateIds).size).toBe(13);
    expect(new Set([...canonicalIds, ...duplicateIds]).size).toBe(22);

    repairPairs.forEach(([canonicalId, duplicateId]) => {
      expect(sql).toMatch(
        new RegExp(`\\(\\s*'${canonicalId}'\\s*,\\s*'${duplicateId}'\\s*,`),
      );
    });
    expect(sql).toContain("raise exception 'timelog repair map must contain 13 duplicate rows'");
    expect(sql).toContain("raise exception 'known timelog repair set is only partially present'");
    expect(sql).toContain("pg_catalog.to_regclass('public.invoice_timelogs')");
    expect(sql).toContain('from public.invoice_timelogs');
    expect(sql).toContain('where it.timelog_id in');
    expect(sql).toContain("raise exception 'known duplicate timelog is linked to an invoice'");
  });

  it('uses explicit exception gates that cannot be disabled', () => {
    const sql = readMigration();

    expect(sql).not.toMatch(/\bassert\b/);
    [
      'known timelog identity or status changed',
      'an exact duplicate payload changed',
      'complete Miss Agro canonical payload changed',
      'complete Miss Agro duplicate payload changed',
      'complete Miss Agro day set changed',
      'subset Miss Agro day set changed',
      'timelog duplicates remain; unique constraint was not added',
    ].forEach((message) => {
      expect(sql).toContain(`raise exception '${message.toLowerCase()}'`);
    });
    expect(sql).toContain('get diagnostics v_deleted_count = row_count');
    expect(sql).toMatch(
      /if\s+v_deleted_count\s*<>\s*13\s+then\s+raise exception 'known timelog repair deleted an unexpected number of rows'/,
    );
  });

  it('reconciles the prerequisite schema, policies, and exact privileges', () => {
    const sql = readMigration();
    const authenticatedGrants = [
      ...sql.matchAll(
        /grant\s+([^;]+)\s+on public\.event_applications to authenticated\s*;/g,
      ),
    ];
    const updatePolicies = [
      ...sql.matchAll(
        /create policy "([^"]+)"\s+on public\.event_applications for update to authenticated/g,
      ),
    ];

    expect(sql).toContain('add column if not exists planned_from time');
    expect(sql).toContain('add column if not exists planned_to time');
    expect(sql).toContain('drop constraint if exists event_applications_status_check');
    expect(sql).toContain('add constraint event_applications_status_check');
    expect(sql).toContain('event_applications_event_profile_unique');
    expect(sql).toContain("raise exception 'event_applications core columns are incompatible'");
    expect(sql).toContain("raise exception 'event_applications primary key is incompatible'");
    expect(sql).toContain("raise exception 'event_applications event_id foreign key is incompatible'");
    expect(sql).toContain("raise exception 'event_applications profile_id foreign key is incompatible'");
    expect(sql).toContain('from pg_catalog.pg_constraint');
    expect(sql).toContain('pg_catalog.pg_get_constraintdef');
    expect(sql).toContain(
      'drop policy if exists "crew can renew own event applications" on public.event_applications',
    );
    expect(sql).toContain(
      'drop policy if exists "crew can update own event applications" on public.event_applications',
    );
    expectMarkersInOrder(sql, [
      'revoke all on public.event_applications from authenticated',
      'grant select, insert, update on public.event_applications to authenticated',
      'revoke all on public.event_applications from anon',
    ]);
    expect(authenticatedGrants).toHaveLength(1);
    expect(authenticatedGrants[0]?.[1]).toBe('select, insert, update');
    expect(sql).not.toMatch(/grant\s+[^;]*\bdelete\b[^;]*\s+to authenticated\s*;/);
    expect(sql).not.toMatch(/(?:to|from)\s+service_role\b/);
    expect(updatePolicies.map((match) => match[1])).toEqual([
      'crew can renew own event applications',
    ]);
    expect(sql).not.toContain('create policy "crew can update own event applications"');
    expect(sql).toContain("raise exception 'timelog_days timelog_id foreign key is incompatible'");
    expect(sql).toContain("raise exception 'event_assignments event/profile uniqueness is incompatible'");
    expect(sql).toContain("c.confrelid = 'public.timelogs'::pg_catalog.regclass");
    expect(sql).toContain("c.confdeltype = 'c'");
    expect(sql).toContain("pg_catalog.pg_get_constraintdef(c.oid) = 'unique (event_id, profile_id)'");
  });

  it('enforces Crew-owned application identity and lifecycle transitions before every update', () => {
    const sql = readMigration();
    const guardFunction = readFunction(sql, 'enforce_event_application_lifecycle_update');

    expect(guardFunction).toMatch(/returns\s+trigger\s+language\s+plpgsql\s+security definer/);
    expect(guardFunction).toContain("set search_path = ''");
    expect(guardFunction).toContain('new.updated_at := pg_catalog.now()');
    expect(guardFunction).toMatch(/if\s+auth\.uid\(\) is null then\s+return new/);
    expect(guardFunction).toMatch(
      /public\.has_role\(auth\.uid\(\), 'crewhead'::public\.app_role\)[\s\S]*public\.has_role\(auth\.uid\(\), 'coo'::public\.app_role\)/,
    );
    expect(guardFunction).toContain('old.profile_id is distinct from public.current_profile_id()');
    expect(guardFunction).toContain(
      "not public.has_role(auth.uid(), 'crew'::public.app_role)",
    );
    ['id', 'event_id', 'profile_id', 'created_at'].forEach((column) => {
      expect(guardFunction).toContain(`new.${column} is distinct from old.${column}`);
    });
    expect(guardFunction).toContain('new.status is not distinct from old.status');
    expect(guardFunction).toMatch(/old\.status = 'pending'[\s\S]*new\.status = 'withdrawn'/);
    expect(guardFunction).toMatch(/old\.status in \('rejected', 'withdrawn'\)[\s\S]*new\.status = 'pending'/);
    expect(guardFunction).toMatch(/old\.status = 'approved'[\s\S]*new\.status = 'withdrawal_requested'/);
    expect(guardFunction).toContain("raise exception 'crew_lifecycle_unauthorized'");
    expect(sql).toContain(
      'create trigger enforce_event_application_lifecycle_update\n' +
      'before update on public.event_applications',
    );
    expect(sql).toContain(
      'revoke all on function public.enforce_event_application_lifecycle_update() from public;',
    );
    expect(sql).toContain(
      'revoke all on function public.enforce_event_application_lifecycle_update() from anon;',
    );
    expect(sql).toContain(
      'revoke all on function public.enforce_event_application_lifecycle_update() from authenticated;',
    );
  });

  it('locks every mutable repair dependency in a fixed order', () => {
    const sql = readMigration();

    expect(sql).toContain("set local lock_timeout = '5s'");
    expectMarkersInOrder(sql, [
      'lock table public.timelogs in share row exclusive mode',
      'lock table public.timelog_days in share row exclusive mode',
      'lock table public.invoices in share row exclusive mode',
      "execute 'lock table public.invoice_timelogs in share row exclusive mode'",
      'select count(*) into v_mapping_count from timelog_duplicate_repair_map',
    ]);
  });

  it('protects invoice links and the reviewed divergent parent payload', () => {
    const sql = readMigration();

    expect(sql).toContain('from public.invoices i');
    expect(sql).toContain('where i.timelog_id in');
    expect(sql).toContain(
      "raise exception 'known timelog is linked through public.invoices.timelog_id'",
    );
    expect(sql).toContain(
      "pg_catalog.to_jsonb(c) - 'id' - 'created_at' - 'updated_at' - 'note'",
    );
    expect(sql).toContain(
      "pg_catalog.to_jsonb(d) - 'id' - 'created_at' - 'updated_at' - 'note'",
    );
    expect(sql).toContain(
      '{"status":"approved","km":0.00,"note":"powerapps: rebros-2026-015.pdf"}',
    );
    expect(sql).toContain('{"status":"approved","km":0.00,"note":""}');
    expect(sql).toContain("where t.id = 'ddfaf624-b422-48bf-889e-c43ecd4bc8b5'");
    expect(sql).toContain("where t.id = '0ee6341d-ecc3-444d-bf4c-740392e13ac1'");
    expect(sql).toMatch(
      /order by d\.date, d\.time_from, d\.time_to, d\.day_type, d\.note, d\.id/,
    );
    expect(sql).toContain('timelog_duplicate_repair_map');
    expect(sql).toContain('normalized_timelog_days');
    expect(sql).toContain('pg_temp.normalized_timelog_days(c.id)');
    expect(sql).toContain('pg_temp.normalized_timelog_days(d.id)');
    expect(sql).toContain('is distinct from');
    expect(sql).toContain(
      "pg_temp.normalized_timelog_days('ddfaf624-b422-48bf-889e-c43ecd4bc8b5')",
    );
    expect(sql).toContain(
      "pg_temp.normalized_timelog_days('0ee6341d-ecc3-444d-bf4c-740392e13ac1')",
    );
  });

  it('keeps validation and exact deletion in one guard before adding uniqueness', () => {
    const sql = readMigration();
    const guardedBlockStart = sql.indexOf('do $$\ndeclare\n  v_mapping_count integer');
    const zeroReplayGuard = sql.indexOf('if v_present_count = 0 then', guardedBlockStart);
    const replayReturn = sql.indexOf('return;', zeroReplayGuard);
    const deleteIndex = sql.indexOf('delete from public.timelogs t', guardedBlockStart);
    const rowCountIndex = sql.indexOf('get diagnostics v_deleted_count = row_count', deleteIndex);
    const guardedBlockEnd = sql.indexOf('\nend\n$$;', rowCountIndex);
    const globalDuplicateCheck = sql.indexOf(
      "raise exception 'timelog duplicates remain; unique constraint was not added'",
      guardedBlockEnd,
    );
    const addConstraintIndex = sql.search(
      /alter\s+table\s+public\.timelogs\s+add\s+constraint\s+timelogs_event_contractor_unique\b/,
    );

    expect(guardedBlockStart).toBeGreaterThanOrEqual(0);
    expect(zeroReplayGuard).toBeGreaterThan(guardedBlockStart);
    expect(replayReturn).toBeGreaterThan(zeroReplayGuard);
    expect(replayReturn).toBeLessThan(deleteIndex);
    [
      "raise exception 'known timelog repair set is only partially present'",
      "raise exception 'known timelog identity or status changed'",
      "raise exception 'an exact duplicate payload changed'",
      "raise exception 'divergent miss agro parent payload changed'",
      "raise exception 'complete miss agro canonical payload changed'",
      "raise exception 'complete miss agro duplicate payload changed'",
      "raise exception 'complete miss agro day set changed'",
      "raise exception 'subset miss agro day set changed'",
      "raise exception 'known timelog is linked through public.invoices.timelog_id'",
      "raise exception 'known duplicate timelog is linked to an invoice'",
    ].forEach((marker) => {
      const markerIndex = sql.indexOf(marker, replayReturn);
      expect(markerIndex, `missing repair guard before deletion: ${marker}`).toBeGreaterThan(
        replayReturn,
      );
      expect(markerIndex, `repair guard occurs after deletion: ${marker}`).toBeLessThan(deleteIndex);
    });
    expect(rowCountIndex).toBeGreaterThan(deleteIndex);
    expect(guardedBlockEnd).toBeGreaterThan(rowCountIndex);
    expect(globalDuplicateCheck).toBeGreaterThan(guardedBlockEnd);
    expect(addConstraintIndex).toBeGreaterThan(globalDuplicateCheck);
    expect(sql.slice(0, addConstraintIndex).match(/delete from public\.timelogs/g)).toHaveLength(1);
    expect(sql).toMatch(
      /delete from public\.timelogs t\s+using timelog_duplicate_repair_map m\s+where t\.id = m\.duplicate_id;/,
    );
    expect(sql).toContain('delete from public.timelogs');
    expect(sql).toMatch(/add\s+constraint\s+timelogs_event_contractor_unique\b/);
  });

  it('defines all three atomic lifecycle RPCs with exact hardened signatures', () => {
    const sql = readMigration();
    const assignFunction = readFunction(sql, 'assign_event_crew');
    const removeFunction = readFunction(sql, 'remove_event_crew');
    const withdrawalFunction = readFunction(sql, 'approve_event_withdrawal');

    expect(sql.match(/security definer/g)).toHaveLength(4);
    expect(assignFunction).toMatch(
      /function\s+public\.assign_event_crew\s*\(\s*p_event_id uuid,\s*p_profile_id uuid,\s*p_application_id uuid default null,\s*p_days jsonb default '\[\]'::jsonb\s*\)/,
    );
    expect(removeFunction).toMatch(
      /function\s+public\.remove_event_crew\s*\(\s*p_event_id uuid,\s*p_profile_id uuid\s*\)/,
    );
    expect(withdrawalFunction).toMatch(
      /function\s+public\.approve_event_withdrawal\s*\(\s*p_event_id uuid,\s*p_profile_id uuid,\s*p_application_id uuid\s*\)/,
    );
    [assignFunction, removeFunction, withdrawalFunction].forEach((functionSql) => {
      expect(functionSql).toMatch(/returns\s+jsonb\s+language\s+plpgsql\s+security definer/);
      expect(functionSql).toContain("set search_path = ''");
      expect(functionSql).toMatch(
        /if\s+auth\.uid\(\) is null or not \(\s*public\.has_role\(auth\.uid\(\), 'crewhead'::public\.app_role\)\s*or public\.has_role\(auth\.uid\(\), 'coo'::public\.app_role\)\s*\) then\s*raise exception 'crew_lifecycle_unauthorized'/,
      );
    });

    const lockExpression =
      /perform\s+pg_catalog\.pg_advisory_xact_lock\(\s*pg_catalog\.hashtextextended\(p_event_id::text \|\| ':' \|\| p_profile_id::text, 0\)\s*\)/g;
    expect(sql.match(lockExpression)).toHaveLength(3);
    expect(assignFunction).toContain('on conflict (event_id, profile_id) do nothing');
    expect(removeFunction).toContain("status not in ('draft', 'rejected')");
  });

  it('serializes event-wide crew counts before reading or mutating lifecycle rows', () => {
    const sql = readMigration();
    const assignFunction = readFunction(sql, 'assign_event_crew');
    const removeFunction = readFunction(sql, 'remove_event_crew');
    const withdrawalFunction = readFunction(sql, 'approve_event_withdrawal');
    const pairLock =
      "perform pg_catalog.pg_advisory_xact_lock(\n    pg_catalog.hashtextextended(p_event_id::text || ':' || p_profile_id::text, 0)\n  )";
    const eventLock =
      'perform id\n  from public.events\n  where id = p_event_id\n  for update;';
    const eventNotFound =
      "if not found then\n    raise exception 'crew_lifecycle_not_found' using errcode = 'p0002';\n  end if;";
    const profileNotFound =
      "if not exists (select 1 from public.profiles where id = p_profile_id) then\n    raise exception 'crew_lifecycle_not_found' using errcode = 'p0002';\n  end if;";

    expect(assignFunction.match(/perform id\s+from public\.events\s+where id = p_event_id\s+for update;/g)).toHaveLength(1);
    expect(removeFunction.match(/perform id\s+from public\.events\s+where id = p_event_id\s+for update;/g)).toHaveLength(1);
    expect(withdrawalFunction.match(/perform id\s+from public\.events\s+where id = p_event_id\s+for update;/g)).toHaveLength(1);
    expectMarkersInOrder(assignFunction, [
      pairLock,
      eventLock,
      eventNotFound,
      profileNotFound,
      'select id into v_existing_assignment_id\n  from public.event_assignments',
    ]);
    expectMarkersInOrder(removeFunction, [
      pairLock,
      eventLock,
      eventNotFound,
      profileNotFound,
      'perform id\n  from public.timelogs',
    ]);
    expectMarkersInOrder(withdrawalFunction, [
      pairLock,
      eventLock,
      eventNotFound,
      profileNotFound,
      'select id, status into v_application_id, v_application_status\n  from public.event_applications',
      'select id into v_assignment_id\n  from public.event_assignments',
      'select id, status into v_timelog_id, v_timelog_status\n  from public.timelogs',
    ]);
  });

  it('locks exact applications and rejects stale approval or withdrawal states', () => {
    const sql = readMigration();
    const assignFunction = readFunction(sql, 'assign_event_crew');
    const withdrawalFunction = readFunction(sql, 'approve_event_withdrawal');

    expectMarkersInOrder(assignFunction, [
      'if p_application_id is not null then',
      'select id, status into v_application_id, v_application_status',
      'where id = p_application_id\n      and event_id = p_event_id\n      and profile_id = p_profile_id\n    for update;',
      "if v_application_status not in ('pending', 'approved') then",
      'select id into v_existing_assignment_id',
      'select id, status into v_timelog_id, v_timelog_status',
      "if v_application_status = 'approved'",
    ]);
    expect(assignFunction).toContain("raise exception 'crew_application_conflict'");
    expect(assignFunction).toMatch(
      /update public\.event_applications\s+set status = 'approved'[\s\S]*where id = p_application_id[\s\S]*and status = 'pending'[\s\S]*if v_application_id is null then\s+raise exception 'crew_application_conflict'/,
    );

    expect(withdrawalFunction).toContain("if v_application_status = 'withdrawn'");
    expect(withdrawalFunction).toContain("if v_application_status <> 'withdrawal_requested' then");
    expect(withdrawalFunction).toContain("raise exception 'crew_withdrawal_conflict'");
    expect(withdrawalFunction).toContain("status not in ('draft', 'rejected')");
    expect(withdrawalFunction).toMatch(
      /update public\.event_applications\s+set status = 'withdrawn'[\s\S]*where id = p_application_id[\s\S]*and status = 'withdrawal_requested'[\s\S]*if not found then\s+raise exception 'crew_withdrawal_conflict'/,
    );
    expect(withdrawalFunction).not.toContain('remove_event_crew(');
  });

  it('fully qualifies lifecycle RPC relations and catalog functions', () => {
    const sql = readMigration();
    const lifecycleFunctions = [
      readFunction(sql, 'assign_event_crew'),
      readFunction(sql, 'remove_event_crew'),
      readFunction(sql, 'approve_event_withdrawal'),
    ];

    lifecycleFunctions.forEach((functionSql) => {
      [
        'events',
        'profiles',
        'event_assignments',
        'timelogs',
        'timelog_days',
        'event_applications',
      ].forEach((relation) => {
        expect(functionSql).not.toMatch(
          new RegExp(`(?:from|into|update|delete\\s+from)\\s+${relation}\\b`),
        );
      });
      expect(functionSql).not.toMatch(/(?<!pg_catalog\.)\b(?:now|jsonb_build_object)\s*\(/);
      expect(functionSql).toContain('pg_catalog.pg_advisory_xact_lock');
      expect(functionSql).toContain('pg_catalog.hashtextextended');
    });

    const assignFunction = lifecycleFunctions[0];
    ['jsonb_typeof', 'jsonb_array_length', 'jsonb_array_elements'].forEach((catalogFunction) => {
      expect(assignFunction).toContain(`pg_catalog.${catalogFunction}`);
      expect(assignFunction).not.toMatch(
        new RegExp(`(?<!pg_catalog\\.)\\b${catalogFunction}\\s*\\(`),
      );
    });
    expect(assignFunction).toContain('insert into public.timelog_days');
  });

  it('preserves existing timelogs during assignment and validates removals before deletion', () => {
    const sql = readMigration();
    const assignFunction = readFunction(sql, 'assign_event_crew');
    const removeFunction = readFunction(sql, 'remove_event_crew');
    const createBranchStart = assignFunction.indexOf('if v_timelog_id is null then');
    const createBranchEnd = assignFunction.indexOf('\n  end if;', createBranchStart);
    const timelogInsert = assignFunction.indexOf('insert into public.timelogs');
    const dayInsert = assignFunction.indexOf('insert into public.timelog_days');

    expect(assignFunction).not.toMatch(/update\s+public\.timelogs\b/);
    expect(assignFunction).not.toMatch(/delete\s+from\s+public\.timelog_days\b/);
    expect(assignFunction.match(/insert into public\.timelogs/g)).toHaveLength(1);
    expect(assignFunction.match(/insert into public\.timelog_days/g)).toHaveLength(1);
    expect(createBranchStart).toBeGreaterThanOrEqual(0);
    expect(timelogInsert).toBeGreaterThan(createBranchStart);
    expect(dayInsert).toBeGreaterThan(timelogInsert);
    expect(createBranchEnd).toBeGreaterThan(dayInsert);

    const blockedCheck = removeFunction.indexOf("status not in ('draft', 'rejected')");
    const blockedError = removeFunction.indexOf("raise exception 'crew_removal_blocked'");
    const timelogDelete = removeFunction.indexOf('delete from public.timelogs');
    const assignmentDelete = removeFunction.indexOf('delete from public.event_assignments');

    expect(blockedCheck).toBeGreaterThanOrEqual(0);
    expect(blockedError).toBeGreaterThan(blockedCheck);
    expect(timelogDelete).toBeGreaterThan(blockedError);
    expect(assignmentDelete).toBeGreaterThan(timelogDelete);
    expect(removeFunction).toContain("status in ('draft', 'rejected')");
  });

  it('maps only forced day casts to the invalid-days token', () => {
    const sql = readMigration();
    const assignFunction = readFunction(sql, 'assign_event_crew');
    const createBranchStart = assignFunction.indexOf('if v_timelog_id is null then');
    const validationHandler =
      "exception\n      when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then\n        raise exception 'crew_assignment_invalid_days' using errcode = '22023';";
    const returnIndex = assignFunction.indexOf('return pg_catalog.jsonb_build_object');

    expectMarkersInOrder(assignFunction, [
      'if v_timelog_id is null then',
      "begin\n      perform (day->>'date')::date,",
      'from pg_catalog.jsonb_array_elements(p_days) day;',
      validationHandler,
      'end;',
      'insert into public.timelogs',
    ]);
    expect(assignFunction.match(/when invalid_datetime_format/g)).toHaveLength(1);
    expect(createBranchStart).toBeGreaterThanOrEqual(0);
    expect(returnIndex).toBeGreaterThan(createBranchStart);
    expect(assignFunction.slice(returnIndex)).not.toContain('when invalid_datetime_format');
  });

  it('exposes lifecycle RPCs only to authenticated users and commits exactly once at the end', () => {
    const sql = readMigration();
    const assignSignature = 'public.assign_event_crew(uuid, uuid, uuid, jsonb)';
    const removeSignature = 'public.remove_event_crew(uuid, uuid)';
    const withdrawalSignature = 'public.approve_event_withdrawal(uuid, uuid, uuid)';

    [assignSignature, removeSignature, withdrawalSignature].forEach((signature) => {
      expect(sql).toContain(`revoke all on function ${signature} from public;`);
      expect(sql).toContain(`revoke all on function ${signature} from anon;`);
      expect(sql).toContain(`grant execute on function ${signature} to authenticated;`);
      expect(sql).not.toMatch(
        new RegExp(
          `grant execute on function ${signature.replace(/[()]/g, '\\$&')} to (?:anon|public|service_role)`,
        ),
      );
    });
    expect(sql).toContain('crew_lifecycle_not_found');
    expect(sql).toContain('crew_assignment_conflict');
    expect(sql).toContain('crew_assignment_invalid_days');
    expect(sql).toContain('crew_removal_blocked');
    expect(sql).toContain('crew_application_conflict');
    expect(sql).toContain('crew_withdrawal_conflict');
    expect(sql.match(/\bcommit\s*;/g)).toHaveLength(1);
    expect(sql.trimEnd()).toMatch(/commit;$/);
    expect(sql).not.toMatch(/\bassert\b/);
  });

  it('resets each blocked-status fixture before setting and checking the target status', () => {
    const sql = readVerificationScript();
    const loopStart = sql.indexOf('foreach v_status in array v_non_disposable_statuses loop');
    const loopEnd = sql.indexOf('\n  end loop;', loopStart);
    const loopSql = sql.slice(loopStart, loopEnd);

    expect(loopStart).toBeGreaterThanOrEqual(0);
    expect(loopEnd).toBeGreaterThan(loopStart);
    expectMarkersInOrder(loopSql, [
      "update public.timelogs\n    set status = 'draft'::public.timelog_status\n    where id = v_blocked_timelog_id",
      'get diagnostics v_reset_count = row_count',
      'update public.timelogs set status = v_status where id = v_blocked_timelog_id',
      'get diagnostics v_status_count = row_count',
      'and status = v_status',
    ]);
    expect(loopSql).toContain(
      "raise exception 'verification failed: blocking-loop timelog reset failed before %'",
    );
    expect(loopSql).toContain(
      "raise exception 'verification failed: blocking-loop timelog status update failed before %'",
    );
  });

  it('verifies exact lifecycle RPC execute ACLs before creating fixtures', () => {
    const sql = readVerificationScript();
    const aclStart = sql.indexOf("select oid into v_authenticated_role_oid\n  from pg_catalog.pg_roles");
    const fixtureStart = sql.indexOf('select ur.user_id\n  into v_crewhead_user_id');
    const aclSql = sql.slice(aclStart, fixtureStart);

    expect(aclStart).toBeGreaterThanOrEqual(0);
    expect(fixtureStart).toBeGreaterThan(aclStart);
    expect(aclSql).toContain(
      "'public.assign_event_crew(uuid, uuid, uuid, jsonb)'::pg_catalog.regprocedure",
    );
    expect(aclSql).toContain(
      "'public.remove_event_crew(uuid, uuid)'::pg_catalog.regprocedure",
    );
    expect(aclSql).toContain(
      "'public.approve_event_withdrawal(uuid, uuid, uuid)'::pg_catalog.regprocedure",
    );
    expect(aclSql).toContain(
      "'public.enforce_event_application_lifecycle_update()'::pg_catalog.regprocedure",
    );
    expect(aclSql).toContain('from pg_catalog.pg_proc p');
    expect(aclSql).toContain('pg_catalog.aclexplode(');
    expect(aclSql).toContain("coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))");
    expect(aclSql).toContain("acl.privilege_type = 'execute'");
    expect(aclSql).toContain(
      "raise exception 'verification failed: authenticated lacks execute on %'",
    );
    expect(aclSql).toContain(
      "raise exception 'verification failed: unexpected execute grantee on %'",
    );
    expect(aclSql).toContain(
      "raise exception 'verification failed: event application lifecycle trigger function is directly executable'",
    );
  });

  it('verifies both manager roles plus stale-state and Crew trigger adversarial cases', () => {
    const sql = readVerificationScript();

    expect(sql).toContain("where ur.role = 'crewhead'::public.app_role");
    expect(sql).toContain("where ur.role = 'coo'::public.app_role");
    expect(sql).toContain("raise exception 'verification fixture missing: no crewhead user exists'");
    expect(sql).toContain("raise exception 'verification fixture missing: no coo user exists'");
    expect(sql).toContain('foreach v_application_status in array v_disallowed_approval_statuses loop');
    expect(sql).toContain('foreach v_application_status in array v_disallowed_withdrawal_statuses loop');
    expect(sql).toContain("v_error_message <> 'crew_application_conflict'");
    expect(sql).toContain("v_error_message <> 'crew_withdrawal_conflict'");
    expect(sql).toContain('verification failed: crew-only user could approve event withdrawal');
    expect(sql).toContain('verification failed: crew changed approved application directly');
    expect(sql).toContain('verification failed: crew moved application identity');
    expect(sql).toContain('verification failed: pending rejection race did not preserve the first transition');
    expect(sql).toContain('verification failed: withdrawal rejection race did not preserve the first transition');
  });
});
