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
const databaseTypesPath = join(process.cwd(), 'src', 'lib', 'database.types.ts');

const readMigration = () => {
  expect(migrationFiles).toHaveLength(1);
  return readFileSync(join(migrationDirectory, migrationFiles[0]), 'utf8').toLowerCase();
};

const readVerificationScript = () => readFileSync(verificationScriptPath, 'utf8').toLowerCase();
const readDatabaseTypes = () => readFileSync(databaseTypesPath, 'utf8');

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
  it('commits a newly-added enum label before using it in replayed schema objects', () => {
    const sql = readMigration();
    const addition = sql.indexOf("add value if not exists 'pending_crew_confirmation'");
    const enumCommit = sql.indexOf('commit;', addition);
    const lifecycleTransaction = sql.indexOf('begin;', enumCommit);
    const firstTypedUse = sql.indexOf(
      "'pending_crew_confirmation'::public.timelog_status",
    );

    expect(addition).toBeGreaterThanOrEqual(0);
    expect(enumCommit).toBeGreaterThan(addition);
    expect(lifecycleTransaction).toBeGreaterThan(enumCommit);
    expect(firstTypedUse).toBeGreaterThan(lifecycleTransaction);
  });

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
    expect(authenticatedGrants[0]?.[1]).not.toContain('delete');
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

    expect(sql.match(/security definer/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
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

  it('exposes lifecycle RPCs only to authenticated users and closes both replay-safe transactions', () => {
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
    expect(sql.match(/\bcommit\s*;/g)).toHaveLength(2);
    expect(sql.trimEnd()).toMatch(/commit;$/);
    expect(sql).not.toMatch(/\bassert\b/);
  });

  it('defines versioned atomic timelog RPCs with invoker-by-default security and ordered writes', () => {
    const sql = readMigration();
    const saveFunction = readFunction(sql, 'save_timelog_atomic');
    const statusFunction = readFunction(sql, 'transition_timelog_statuses_atomic');
    const deleteFunction = readFunction(sql, 'delete_timelog_atomic');
    const importFunction = readFunction(sql, 'import_approved_timelog_atomic');
    const permissionTrigger = readFunction(sql, 'enforce_timelog_update_permissions');

    expect(saveFunction).toMatch(
      /function\s+public\.save_timelog_atomic\s*\(\s*p_timelog_id uuid,\s*p_event_id uuid,\s*p_contractor_id uuid,\s*p_expected_updated_at timestamptz,\s*p_expected_status public\.timelog_status,\s*p_km numeric,\s*p_note text,\s*p_status public\.timelog_status,\s*p_days jsonb\s*\)/,
    );
    expect(statusFunction).toMatch(
      /function\s+public\.transition_timelog_statuses_atomic\s*\(\s*p_targets jsonb,\s*p_expected_status public\.timelog_status,\s*p_next_status public\.timelog_status\s*\)/,
    );
    expect(deleteFunction).toMatch(
      /function\s+public\.delete_timelog_atomic\s*\(\s*p_timelog_id uuid,\s*p_expected_updated_at timestamptz,\s*p_expected_status public\.timelog_status\s*\)/,
    );
    expect(importFunction).toMatch(
      /function\s+public\.import_approved_timelog_atomic\s*\(\s*p_timelog_id uuid,\s*p_event_id uuid,\s*p_contractor_id uuid,\s*p_expected_updated_at timestamptz,\s*p_expected_status public\.timelog_status,\s*p_km numeric,\s*p_note text,\s*p_days jsonb\s*\)/,
    );

    [saveFunction, statusFunction, deleteFunction].forEach((functionSql) => {
      expect(functionSql).toMatch(/returns\s+jsonb\s+language\s+plpgsql\s+security invoker/);
      expect(functionSql).toContain("set search_path = ''");
    });
    expect(importFunction).toMatch(/returns\s+jsonb\s+language\s+plpgsql\s+security definer/);
    expect(importFunction).toContain("set search_path = ''");
    expect(importFunction).toMatch(
      /auth\.uid\(\) is null[\s\S]*public\.has_role\(auth\.uid\(\), 'coo'::public\.app_role\)[\s\S]*raise exception 'timelog_import_unauthorized'/,
    );
    expectMarkersInOrder(importFunction, [
      'for update;',
      "if v_timelog.status in ('approved', 'invoiced') then",
      "or v_existing_days is distinct from v_requested_days then\n        raise exception 'timelog_mutation_conflict'",
      'return pg_catalog.jsonb_build_object(',
      "pg_catalog.set_config('crewflow.approved_timelog_import', 'on', true)",
    ]);

    expectMarkersInOrder(saveFunction, [
      'for update;',
      'or v_timelog.updated_at is distinct from p_expected_updated_at',
      'update public.timelogs',
      'delete from public.timelog_days',
      'insert into public.timelog_days',
      'set status = p_status',
    ]);
    expect(statusFunction).toContain('order by (target->>\'id\')::uuid');
    expect(statusFunction).toContain("raise exception 'timelog_mutation_conflict'");
    expect(deleteFunction).toContain("status in ('draft', 'rejected')");
    expect(deleteFunction).not.toContain("'pending_ch'");
    expect(deleteFunction).not.toContain('delete from public.timelog_days');
    expectMarkersInOrder(importFunction, [
      "pg_catalog.set_config('crewflow.approved_timelog_import', 'on', true)",
      'update public.timelogs',
      'delete from public.timelog_days',
      'insert into public.timelog_days',
      "set status = 'approved'",
    ]);
    expect(importFunction).toMatch(/exception\s+when others then/);
    expect(importFunction).toContain("pg_catalog.set_config('crewflow.approved_timelog_import'");
    expect(importFunction).toContain(
      "v_timelog.status not in ('draft', 'rejected', 'pending_coo')",
    );
    expect(permissionTrigger).toMatch(
      /current_setting\('crewflow\.approved_timelog_import', true\) = 'on'[\s\S]*old\.status in \([\s\S]*'draft'::public\.timelog_status,[\s\S]*'rejected'::public\.timelog_status,[\s\S]*'pending_coo'::public\.timelog_status[\s\S]*new\.status in/,
    );
    expect(permissionTrigger).toMatch(
      /old\.status = 'invoiced'::public\.timelog_status[\s\S]*new\.status in \([\s\S]*'approved'::public\.timelog_status,[\s\S]*'paid'::public\.timelog_status/,
    );
  });

  it('exposes exactly thirteen authenticated lifecycle/timelog/receipt/invoice RPCs and keeps trigger helpers private', () => {
    const sql = readMigration();
    const publicSignatures = [
      'public.assign_event_crew(uuid, uuid, uuid, jsonb)',
      'public.remove_event_crew(uuid, uuid)',
      'public.approve_event_withdrawal(uuid, uuid, uuid)',
      'public.save_timelog_atomic(uuid, uuid, uuid, timestamptz, public.timelog_status, numeric, text, public.timelog_status, jsonb)',
      'public.transition_timelog_statuses_atomic(jsonb, public.timelog_status, public.timelog_status)',
      'public.transition_receipt_statuses_atomic(jsonb, public.receipt_status, public.receipt_status)',
      'public.delete_timelog_atomic(uuid, timestamptz, public.timelog_status)',
      'public.import_approved_timelog_atomic(uuid, uuid, uuid, timestamptz, public.timelog_status, numeric, text, jsonb)',
      'public.delete_event_atomic(uuid)',
      'public.create_invoice_atomic(jsonb, jsonb, jsonb, jsonb)',
      'public.mark_invoice_sent_atomic(uuid, timestamptz, timestamptz)',
      'public.mark_invoice_paid_atomic(uuid, public.invoice_status, timestamptz, timestamptz)',
      'public.delete_invoice_atomic(uuid, public.invoice_status, timestamptz)',
    ];

    publicSignatures.forEach((signature) => {
      expect(sql).toContain(`revoke all on function ${signature} from public;`);
      expect(sql).toContain(`revoke all on function ${signature} from anon;`);
      expect(sql).toContain(`grant execute on function ${signature} to authenticated;`);
    });
    expect(sql).toContain(
      'revoke all on function public.enforce_timelog_update_permissions() from authenticated;',
    );
    expect(sql).toContain(
      'revoke all on function public.enforce_receipt_lifecycle_update() from authenticated;',
    );
    expect(sql).toContain(
      'revoke all on function public.handle_timelog_approved() from authenticated;',
    );

    const verifier = readVerificationScript();
    publicSignatures.forEach((signature) => {
      expect(verifier).toContain(`('${signature}', true,`);
    });
    expect(verifier).toContain(
      "('public.enforce_timelog_update_permissions()', false, true, 'owner')",
    );
    expect(verifier).toContain('verification failed: direct coo timelog update bypassed import rpc');
    expect(verifier).toContain('verification failed: crew-only user imported approved timelog');
    expect(verifier).toContain('verification failed: invoice deletion did not reopen linked approval rows');
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
    const aclStart = sql.indexOf('create temporary table expected_lifecycle_function_contract');
    const fixtureStart = sql.indexOf('select p.id, p.user_id\n  into v_profile_id, v_crew_user_id');
    const aclSql = sql.slice(aclStart, fixtureStart);

    expect(aclStart).toBeGreaterThanOrEqual(0);
    expect(fixtureStart).toBeGreaterThan(aclStart);
    expect(aclSql).toContain("('public.assign_event_crew(uuid, uuid, uuid, jsonb)', true, true, 'authenticated')");
    expect(aclSql).toContain("('public.remove_event_crew(uuid, uuid)', true, true, 'authenticated')");
    expect(aclSql).toContain("('public.approve_event_withdrawal(uuid, uuid, uuid)', true, true, 'authenticated')");
    expect(aclSql).toContain("('public.delete_event_atomic(uuid)', true, true, 'authenticated')");
    expect(aclSql).toContain("('public.create_invoice_atomic(jsonb, jsonb, jsonb, jsonb)', true, true, 'authenticated')");
    expect(aclSql).toContain("('public.mark_invoice_paid_atomic(uuid, public.invoice_status, timestamptz, timestamptz)', true, true, 'authenticated')");
    expect(aclSql).toContain("('public.delete_invoice_atomic(uuid, public.invoice_status, timestamptz)', true, true, 'authenticated')");
    expect(aclSql).toContain("('public.enforce_event_application_lifecycle_update()', false, true, 'owner')");
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
      "raise exception 'verification failed: non-callable lifecycle helper is directly executable: %'",
    );
  });

  it('verifies the exact mode, empty search path, and ACL contract for every installed function', () => {
    const migration = readMigration();
    const sql = readVerificationScript();
    const contractStart = sql.indexOf(
      'insert into expected_lifecycle_function_contract',
    );
    const contractEnd = sql.indexOf('\n\ndo $$', contractStart);
    const contractSql = sql.slice(contractStart, contractEnd);
    const endpointContracts = [
      ['public.assign_event_crew(uuid, uuid, uuid, jsonb)', true],
      ['public.remove_event_crew(uuid, uuid)', true],
      ['public.approve_event_withdrawal(uuid, uuid, uuid)', true],
      [
        'public.save_timelog_atomic(uuid, uuid, uuid, timestamptz, public.timelog_status, numeric, text, public.timelog_status, jsonb)',
        false,
      ],
      [
        'public.transition_timelog_statuses_atomic(jsonb, public.timelog_status, public.timelog_status)',
        false,
      ],
      [
        'public.transition_receipt_statuses_atomic(jsonb, public.receipt_status, public.receipt_status)',
        false,
      ],
      ['public.delete_timelog_atomic(uuid, timestamptz, public.timelog_status)', false],
      [
        'public.import_approved_timelog_atomic(uuid, uuid, uuid, timestamptz, public.timelog_status, numeric, text, jsonb)',
        true,
      ],
      ['public.delete_event_atomic(uuid)', true],
      ['public.create_invoice_atomic(jsonb, jsonb, jsonb, jsonb)', true],
      ['public.mark_invoice_sent_atomic(uuid, timestamptz, timestamptz)', true],
      [
        'public.mark_invoice_paid_atomic(uuid, public.invoice_status, timestamptz, timestamptz)',
        true,
      ],
      [
        'public.delete_invoice_atomic(uuid, public.invoice_status, timestamptz)',
        true,
      ],
    ] as const;
    const helperContracts = [
      [
        'public.can_edit_timelog_data(uuid, public.timelog_status)',
        false,
        'authenticated',
      ],
      ['public.enforce_event_application_lifecycle_update()', true, 'owner'],
      ['public.enforce_timelog_update_permissions()', true, 'owner'],
      ['public.enforce_receipt_lifecycle_update()', true, 'owner'],
      ['public.handle_timelog_approved()', true, 'owner'],
    ] as const;
    const expectedInstalledFunctionNames = [
      ...endpointContracts.map(([signature]) => signature.slice(7, signature.indexOf('('))),
      ...helperContracts.map(([signature]) => signature.slice(7, signature.indexOf('('))),
    ].sort();
    const installedFunctionNames = [
      ...migration.matchAll(/create or replace function public\.([a-z0-9_]+)\s*\(/g),
    ]
      .map((match) => match[1])
      .sort();

    expect(contractStart).toBeGreaterThanOrEqual(0);
    expect(contractEnd).toBeGreaterThan(contractStart);
    expect(endpointContracts).toHaveLength(13);
    expect(helperContracts).toHaveLength(5);
    expect(contractSql.match(/\(\s*'public\./g)).toHaveLength(18);
    expect(installedFunctionNames).toEqual(expectedInstalledFunctionNames);
    endpointContracts.forEach(([signature, isDefiner]) => {
      expect(contractSql).toContain(
        `('${signature}', true, ${isDefiner}, 'authenticated')`,
      );
    });
    helperContracts.forEach(([signature, isDefiner, executeScope]) => {
      expect(contractSql).toContain(
        `('${signature}', false, ${isDefiner}, '${executeScope}')`,
      );
    });
    expect(sql).toContain(
      'pg_catalog.to_regprocedure(v_function_contract.signature)',
    );
    expect(sql).toContain(
      "raise exception 'verification failed: public lifecycle endpoint catalog is incompatible'",
    );
    expect(sql).toContain(
      "raise exception 'verification failed: installed lifecycle helper catalog is incompatible'",
    );
    expect(sql).toMatch(
      /'search_path=""'\s*=\s*any\(\s*pg_catalog\.coalesce\(\s*function_row\.proconfig,\s*array\[\]::text\[\]\s*\)\s*\)/,
    );
    expect(sql).toContain("where config_value like 'search_path=%'");
    expect(sql).toContain(
      "raise exception 'verification failed: lifecycle function mode or search path is incompatible: %'",
    );
    expect(sql).toContain(
      "raise exception 'verification failed: non-callable lifecycle helper is directly executable: %'",
    );
  });

  it('self-contains both temporary manager-role paths plus Crew adversarial cases', () => {
    const sql = readVerificationScript();

    expect(sql).not.toContain("verification fixture missing: no crewhead user exists");
    expect(sql).not.toContain("verification fixture missing: no coo user exists");
    const crewheadInsert = "insert into public.user_roles (user_id, role)\n  values (v_manager_user_id, 'crewhead'::public.app_role)";
    const crewheadDelete = "delete from public.user_roles\n  where user_id = v_manager_user_id\n    and role = 'crewhead'::public.app_role";
    const cooInsert = "insert into public.user_roles (user_id, role)\n  values (v_manager_user_id, 'coo'::public.app_role)";
    const cooDelete = "delete from public.user_roles\n  where user_id = v_manager_user_id\n    and role = 'coo'::public.app_role";
    const firstCrewheadInsert = sql.indexOf(crewheadInsert);
    const firstAssignment = sql.indexOf('v_result := public.assign_event_crew(', firstCrewheadInsert);
    const firstCrewheadDelete = sql.indexOf(crewheadDelete, firstAssignment);
    const cooRoleInsert = sql.indexOf(cooInsert, firstCrewheadDelete);
    const repeatedAssignment = sql.indexOf(
      'verification failed: repeated assignment was not idempotent',
      cooRoleInsert,
    );
    const cooRoleDelete = sql.indexOf(cooDelete, repeatedAssignment);
    const secondCrewheadInsert = sql.indexOf(crewheadInsert, cooRoleDelete);
    const crewChecksDelete = sql.indexOf(crewheadDelete, secondCrewheadInsert);
    const crewUnauthorizedCheck = sql.indexOf(
      'verification failed: crew-only user could approve event withdrawal',
      crewChecksDelete,
    );
    const thirdCrewheadInsert = sql.indexOf(crewheadInsert, crewUnauthorizedCheck);
    expect([
      firstCrewheadInsert,
      firstAssignment,
      firstCrewheadDelete,
      cooRoleInsert,
      repeatedAssignment,
      cooRoleDelete,
      secondCrewheadInsert,
      crewChecksDelete,
      crewUnauthorizedCheck,
      thirdCrewheadInsert,
    ]).toEqual([...new Set([
      firstCrewheadInsert,
      firstAssignment,
      firstCrewheadDelete,
      cooRoleInsert,
      repeatedAssignment,
      cooRoleDelete,
      secondCrewheadInsert,
      crewChecksDelete,
      crewUnauthorizedCheck,
      thirdCrewheadInsert,
    ])].sort((a, b) => a - b));
    expect(firstCrewheadInsert).toBeGreaterThanOrEqual(0);
    expect(sql.match(/insert into public\.user_roles \(user_id, role\)/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
    expect(sql.match(/delete from public\.user_roles/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
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

  it('reconciles the invoice schema required by a clean migration replay', () => {
    const sql = readMigration();
    const verifier = readVerificationScript();

    ['invoice_items', 'invoice_timelogs', 'invoice_receipts'].forEach((table) => {
      expect(sql).toContain(`create table if not exists public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security;`);
      expect(sql).toContain(`revoke all on table public.${table} from public;`);
      expect(sql).toContain(`revoke all on table public.${table} from anon;`);
      expect(sql).toContain(`revoke all on table public.${table} from authenticated;`);
    });
    expect(sql).toContain('amount_meals numeric not null default 0');
    expect(sql).toContain("raise exception 'invoice_items core columns are incompatible'");
    expect(sql).toContain("raise exception 'invoice_timelogs core columns are incompatible'");
    expect(sql).toContain("raise exception 'invoice_receipts core columns are incompatible'");
    expect(sql).toContain("raise exception 'invoice_timelogs constraints are incompatible'");
    expect(sql).toContain("raise exception 'invoice_receipts constraints are incompatible'");
    expect(sql).toContain("raise exception 'invoices timelog_id foreign key is incompatible'");
    expect(sql).toContain("raise exception 'invoices billing columns are incompatible'");
    expect(sql).toContain('create unique index if not exists invoices_invoice_number_key');
    expect(sql).toContain('where invoice_number is not null');
    expect(sql).toContain('create index if not exists idx_invoices_pdf_path');
    expect(sql).toContain('where pdf_path is not null');
    expect(verifier).toContain(
      'verification failed: invoice core column catalog is incompatible',
    );
    expect(verifier).toContain(
      'verification failed: invoice relation constraints are incompatible',
    );
    expect(verifier).toContain(
      'verification failed: invoice billing indexes are incompatible',
    );
  });

  it('keeps invoice relations read-only outside authenticated COO RPCs', () => {
    const sql = readMigration();
    const policyStart = sql.indexOf('alter table public.invoice_items enable row level security;');
    const policyEnd = sql.indexOf('create or replace function public.enforce_receipt_lifecycle_update()', policyStart);
    const policySql = sql.slice(policyStart, policyEnd);
    const verifier = readVerificationScript();

    expect(policyStart).toBeGreaterThanOrEqual(0);
    expect(policyEnd).toBeGreaterThan(policyStart);
    expect(policySql.match(/''crewhead''::public\.app_role/g)).toHaveLength(1);
    expect(policySql.match(/''coo''::public\.app_role/g)).toHaveLength(1);
    ['invoice_items', 'invoice_timelogs', 'invoice_receipts'].forEach((table) => {
      expect(policySql).toContain(`grant select on table public.${table} to authenticated;`);
      expect(policySql).not.toContain(`grant select, insert, delete on table public.${table}`);
    });
    expect(policySql).not.toContain("'create policy %i on public.%i for insert to authenticated");
    expect(policySql).not.toContain("'create policy %i on public.%i for delete to authenticated");
    expect(verifier).toContain(
      'verification failed: invoice link write policy exists',
    );
    expect(verifier).toContain(
      'verification failed: crewhead changed invoice relation snapshot directly',
    );
  });

  it('replaces broad receipt access with exact workflow policies and a non-callable trigger guard', () => {
    const sql = readMigration();
    const verifier = readVerificationScript();
    const guardFunction = readFunction(sql, 'enforce_receipt_lifecycle_update');

    [
      'crew can manage own receipts',
      'crewhead can view all receipts',
      'coo can manage all receipts',
    ].forEach((policyName) => {
      expect(sql).toContain(`drop policy if exists "${policyName}" on public.receipts;`);
    });
    expectMarkersInOrder(sql, [
      'revoke all on table public.receipts from public;',
      'revoke all on table public.receipts from anon;',
      'revoke all on table public.receipts from authenticated;',
      'grant select, insert, update, delete on table public.receipts to authenticated;',
    ]);
    [
      'Crew can view own receipts',
      'CrewHead and COO can view all receipts',
      'Crew can create own draft receipts',
      'CrewHead and COO can create draft receipts',
      'Crew can update own editable receipts',
      'CrewHead and COO can review submitted receipts',
      'COO can update invoice receipt status',
      'Crew can delete own disposable receipts',
      'CrewHead and COO can delete disposable receipts',
    ].forEach((policyName) => {
      expect(sql).toContain(`create policy "${policyName.toLowerCase()}"`);
    });
    expect(guardFunction).toMatch(/returns\s+trigger\s+language\s+plpgsql\s+security definer/);
    expect(guardFunction).toContain("set search_path = ''");
    expect(guardFunction).toContain('if auth.uid() is null then');
    ['id', 'contractor_id', 'event_id', 'created_at'].forEach((column) => {
      expect(guardFunction).toContain(`new.${column} is distinct from old.${column}`);
    });
    expect(guardFunction).toContain('new.updated_at := pg_catalog.now()');
    expect(guardFunction).toMatch(/old\.status in \([\s\S]*?'draft'[\s\S]*?'rejected'[\s\S]*?new\.status in \([\s\S]*?old\.status[\s\S]*?'submitted'/);
    expect(guardFunction).toMatch(/old\.status = 'submitted'[\s\S]*?new\.status in \('approved', 'rejected'\)/);
    expect(guardFunction).toContain("current_setting('crewflow.invoice_receipt_mutation', true) = 'on'");
    expect(guardFunction).toMatch(/old\.status = 'approved' and new\.status = 'attached'/);
    expect(guardFunction).toMatch(/old\.status = 'attached'[\s\S]*?new\.status in \('reimbursed', 'approved'\)/);
    expect(guardFunction).toContain("raise exception 'receipt_lifecycle_unauthorized'");
    expect(sql).toContain('create trigger enforce_receipt_lifecycle_update');
    expect(sql).toContain(
      'revoke all on function public.enforce_receipt_lifecycle_update() from authenticated;',
    );
    expect(verifier).toContain('verification failed: receipt workflow policy catalog is incompatible');
    expect(verifier).toContain('verification failed: non-callable lifecycle helper is directly executable');
    expect(verifier).toContain('verification failed: protected receipt allowed event deletion');
    expect(verifier).toContain('verification failed: protected receipt was mutated directly');
    expect(verifier).toContain('verification failed: coo moved protected receipt identity');
    expect(verifier).toContain('verification failed: crewhead mutated attached receipt');
    expect(verifier).toContain('verification failed: crew mutated attached receipt');
    expect(verifier).toContain('verification failed: coo mutated reimbursed receipt');
  });

  it('defines exact atomic receipt status transitions without invoice-link transitions', () => {
    const sql = readMigration();
    const transitionFunction = readFunction(sql, 'transition_receipt_statuses_atomic');

    expect(transitionFunction).toMatch(
      /function\s+public\.transition_receipt_statuses_atomic\s*\(\s*p_receipts jsonb,\s*p_expected_status public\.receipt_status,\s*p_next_status public\.receipt_status\s*\)/,
    );
    expect(transitionFunction).toMatch(/returns\s+jsonb\s+language\s+plpgsql\s+security invoker/);
    expect(transitionFunction).toContain("set search_path = ''");
    expect(transitionFunction).toContain("raise exception 'receipt_mutation_invalid'");
    expect(transitionFunction).toContain("raise exception 'receipt_mutation_conflict'");
    expect(transitionFunction).toContain("raise exception 'receipt_mutation_unauthorized'");
    expect(transitionFunction).toContain("array['expected_updated_at', 'id']::text[]");
    expect(transitionFunction).toContain('count(distinct target->>\'id\')');
    expectMarkersInOrder(transitionFunction, [
      "order by (target->>'id')::uuid",
      'for update of r;',
      'update public.receipts',
      "'updated_at', r.updated_at",
    ]);
    expect(transitionFunction).not.toContain("p_next_status = 'attached'");
    expect(transitionFunction).not.toContain("p_expected_status = 'attached'");
  });

  it('atomically links and attaches approved receipts in the legacy pending-COO invoice trigger', () => {
    const sql = readMigration();
    const verifier = readVerificationScript();
    const approvalFunction = readFunction(sql, 'handle_timelog_approved');

    expect(approvalFunction).toMatch(/returns\s+trigger\s+language\s+plpgsql\s+security definer/);
    expect(approvalFunction).toContain("set search_path = ''");
    expect(approvalFunction).toMatch(
      /auth\.uid\(\) is null[\s\S]*?'coo'::public\.app_role[\s\S]*?timelog_import_unauthorized/,
    );
    expectMarkersInOrder(approvalFunction, [
      "new.status = 'approved'",
      "old.status = 'pending_coo'",
      'from public.receipts r',
      'order by r.id',
      'for update\n    ) locked_receipt;',
      'insert into public.invoices',
      'returning id into v_invoice_id',
      'insert into public.invoice_items',
      'insert into public.invoice_timelogs',
      'insert into public.invoice_receipts',
      "set status = 'attached'",
      "new.status := 'invoiced'",
    ]);
    expect(approvalFunction).toContain("raise exception 'invoice_create_conflict'");
    expect(sql).toContain('revoke all on function public.handle_timelog_approved() from authenticated;');
    expect(verifier).toContain('verification failed: non-callable lifecycle helper is directly executable');
    expect(verifier).toContain('verification failed: timelog approval did not link and attach exact receipts');
    expect(verifier).toContain('verification failed: timelog approval receipt was refactured');
  });

  it('defines manager-only atomic event deletion with deterministic protected-row locking', () => {
    const sql = readMigration();
    const deleteEventFunction = readFunction(sql, 'delete_event_atomic');
    const verifier = readVerificationScript();

    expect(deleteEventFunction).toMatch(
      /function\s+public\.delete_event_atomic\s*\(\s*p_event_id uuid\s*\)/,
    );
    expect(deleteEventFunction).toMatch(
      /returns\s+table\s*\(\s*event_id uuid\s*\)\s+language\s+plpgsql\s+security definer/,
    );
    expect(deleteEventFunction).toContain("set search_path = ''");
    expect(deleteEventFunction).toMatch(
      /auth\.uid\(\) is null[\s\S]*?'crewhead'::public\.app_role[\s\S]*?'coo'::public\.app_role/,
    );
    expectMarkersInOrder(deleteEventFunction, [
      'from public.events',
      'for update;',
      'from public.timelogs',
      'order by t.id\n  for update;',
      "status not in ('draft', 'rejected')",
      'from public.receipts',
      'order by r.id\n  for update;',
      "r.status not in ('draft', 'rejected')",
      'delete from public.receipts',
      'delete from public.events',
    ]);
    expect(deleteEventFunction).toContain("raise exception 'event_has_protected_timelogs'");
    expect(deleteEventFunction).toContain("raise exception 'event_has_protected_receipts'");
    expect(deleteEventFunction).toContain("raise exception 'event_delete_conflict'");
    expect(deleteEventFunction).toContain("raise exception 'event_not_found'");
    expect(sql).toContain('drop policy if exists "crewhead and coo can manage events" on public.events;');
    expect(sql).toContain('revoke all on table public.events from authenticated;');
    expect(sql).toContain('grant select, insert, update on table public.events to authenticated;');
    expect(sql).not.toContain('create policy "crewhead and coo can delete events"');
    expect(verifier).toContain('verification failed: event policy catalog is incompatible');
    expect(verifier).toContain('verification failed: crewhead directly deleted an event');
    expect(verifier).toContain('verification failed: coo directly deleted an event');
    expect(verifier).toContain('verification failed: crew-only user deleted an event through rpc');
    expect(verifier).toContain('verification failed: unauthenticated caller deleted an event through rpc');
  });

  it('defines authenticated COO-only atomic invoice create, sent, payment, and deletion contracts', () => {
    const sql = readMigration();
    const createFunction = readFunction(sql, 'create_invoice_atomic');
    const sentFunction = readFunction(sql, 'mark_invoice_sent_atomic');
    const paidFunction = readFunction(sql, 'mark_invoice_paid_atomic');
    const deleteFunction = readFunction(sql, 'delete_invoice_atomic');

    expect(createFunction).toMatch(
      /function\s+public\.create_invoice_atomic\s*\(\s*p_invoice jsonb,\s*p_items jsonb,\s*p_timelogs jsonb,\s*p_receipts jsonb\s*\)/,
    );
    expect(paidFunction).toMatch(
      /function\s+public\.mark_invoice_paid_atomic\s*\(\s*p_invoice_id uuid,\s*p_expected_status public\.invoice_status,\s*p_expected_updated_at timestamptz,\s*p_paid_at timestamptz\s*\)/,
    );
    expect(sentFunction).toMatch(
      /function\s+public\.mark_invoice_sent_atomic\s*\(\s*p_invoice_id uuid,\s*p_expected_updated_at timestamptz,\s*p_sent_at timestamptz\s*\)/,
    );
    expect(deleteFunction).toMatch(
      /function\s+public\.delete_invoice_atomic\s*\(\s*p_invoice_id uuid,\s*p_expected_status public\.invoice_status,\s*p_expected_updated_at timestamptz\s*\)/,
    );

    [createFunction, sentFunction, paidFunction, deleteFunction].forEach((functionSql) => {
      expect(functionSql).toMatch(/returns\s+table\s*\([\s\S]*?invoice_id uuid,[\s\S]*?invoice_status public\.invoice_status,[\s\S]*?invoice_updated_at timestamptz,[\s\S]*?paid_at timestamptz,[\s\S]*?timelogs jsonb,[\s\S]*?receipts jsonb[\s\S]*?\)\s+language\s+plpgsql\s+security definer/);
      expect(functionSql).toContain("set search_path = ''");
      expect(functionSql).toContain("raise exception 'invoice_unauthorized'");
    });

    expect(createFunction).toContain("raise exception 'invoice_mutation_invalid'");
    expect(createFunction).toContain("raise exception 'invoice_create_conflict'");
    expect(createFunction).toContain('v_total_hours is null');
    expect(createFunction).toContain("nullif(target->>'expected_updated_at', '') is null");
    expect(createFunction).toMatch(
      /case\s+when pg_catalog\.jsonb_typeof\(item\) <> 'object' then true/,
    );
    expect(createFunction).toMatch(
      /(?:when|or)\s+numeric_value_out_of_range[\s\S]*raise exception 'invoice_mutation_invalid'/,
    );
    expect(createFunction).toContain('insert into public.invoice_items');
    expect(createFunction).toContain('insert into public.invoice_timelogs');
    expect(createFunction).toContain('insert into public.invoice_receipts');
    expectMarkersInOrder(createFunction, [
      'order by (target->>\'id\')::uuid',
      'for update of t;',
      'insert into public.invoices',
      'insert into public.invoice_items',
      'insert into public.invoice_timelogs',
      'insert into public.invoice_receipts',
      "set status = 'attached'",
      "set status = 'invoiced'",
    ]);

    expect(paidFunction).toContain("raise exception 'invoice_paid_conflict'");
    expect(paidFunction).toContain("set status = 'reimbursed'");
    expect(paidFunction).toContain("set status = 'paid'");
    expect(deleteFunction).toContain("raise exception 'invoice_delete_conflict'");
    expect(deleteFunction).toContain("raise exception 'invoice_has_protected_items'");
    expect(deleteFunction).toContain("set status = 'approved'");
    expect(deleteFunction).toContain('delete from public.invoices');
    expect(sentFunction).toContain("raise exception 'invoice_sent_conflict'");
    expect(sentFunction).toContain("set status = 'sent'");
  });

  it('runs invoker RPC and direct-write adversarial checks as authenticated', () => {
    const sql = readVerificationScript();
    const compactSql = sql.replace(/\s+/g, ' ');
    const firstRoleSet = sql.indexOf("execute 'set local role authenticated'");
    const firstInvokerCall = sql.indexOf('v_result := public.save_timelog_atomic(');

    expect(firstRoleSet).toBeGreaterThanOrEqual(0);
    expect(firstRoleSet).toBeLessThan(firstInvokerCall);
    expect(sql).toContain("execute 'reset role'");
    expect(sql).toContain('verification failed: crew directly changed protected timelog');
    expect(sql).toContain('verification failed: crew directly changed protected timelog day');
    expect(sql).toContain('verification failed: protected timelog allowed event deletion');
    expect(sql).toContain('verification failed: invoice create partially mutated rows');
    expect(sql).toContain('verification failed: invoice payment partially mutated rows');
    expect(sql).toContain('verification failed: invoice deletion partially mutated rows');
    ['timelogs', 'timelog_days'].forEach((table) => {
      ['SELECT', 'INSERT', 'UPDATE', 'DELETE'].forEach((privilege) => {
        expect(compactSql).toContain(
          `pg_catalog.has_table_privilege('authenticated', 'public.${table}', '${privilege.toLowerCase()}')`,
        );
      });
    });
    expect(compactSql).not.toMatch(
      /not pg_catalog\.has_table_privilege\('authenticated', '[^']+', 'select,insert/,
    );
  });

  it('tracks typed rows for every event and invoice atomic RPC', () => {
    const types = readDatabaseTypes();

    [
      'delete_event_atomic',
      'create_invoice_atomic',
      'mark_invoice_sent_atomic',
      'mark_invoice_paid_atomic',
      'delete_invoice_atomic',
      'transition_receipt_statuses_atomic',
    ].forEach((functionName) => {
      expect(types).toContain(`${functionName}: {`);
    });
    expect(types).toContain('p_expected_status: InvoiceStatus;');
    expect(types).toContain('invoice_updated_at: string;');
    expect(types).toContain('timelogs: Json;');
    expect(types).toContain('receipts: Json;');
    expect(types).toContain('amount_meals: number;');
  });
});
