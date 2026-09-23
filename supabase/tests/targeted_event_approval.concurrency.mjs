// Local-only integration proof. No connection URL, remote context, or production mode exists.
// Requires the disposable crewflow-event-form-db database with the approval migration applied.
// Run: node supabase/tests/targeted_event_approval.concurrency.mjs
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';

const container = 'crewflow-event-form-db';
const database = process.env.CREWFLOW_APPROVAL_TEST_DB ?? 'postgres';
const crewheadUser = '60000000-0000-4000-8000-000000000701';
const approverUser = '60000000-0000-4000-8000-000000000702';
const contractorUser = '60000000-0000-4000-8000-000000000703';
const crewheadProfile = '60000000-0000-4000-8000-000000000711';
const approverProfile = '60000000-0000-4000-8000-000000000712';
const contractorProfile = '60000000-0000-4000-8000-000000000713';
const eventId = '60000000-0000-4000-8000-000000000721';
const timelogId = '60000000-0000-4000-8000-000000000731';
const dayId = '60000000-0000-4000-8000-000000000741';
const approvalId = '60000000-0000-4000-8000-000000000751';
const roundId = '60000000-0000-4000-8000-000000000761';
const dockerArgs = ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', database,
  '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'];
const auth = (userId) => `set local role authenticated;
  set local request.jwt.claims = '{"sub":"${userId}","role":"authenticated"}';
  set local request.jwt.claim.sub = '${userId}';`;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function query(sql) {
  const result = spawnSync('docker', dockerArgs, { input: sql, encoding: 'utf8', timeout: 15000 });
  if (result.status !== 0) throw new Error(`Local SQL failed (${result.status}): ${result.stderr}`);
  return result.stdout.trim();
}

function session(sql) {
  const child = spawn('docker', dockerArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
  const state = { child, stdout: '', stderr: '', code: undefined };
  child.stdout.setEncoding('utf8').on('data', (chunk) => { state.stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { state.stderr += chunk; });
  state.exited = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => { state.code = code; resolve(code); });
  });
  child.stdin.write(sql);
  return state;
}

async function waitForOutput(state, marker) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (state.stdout.includes(marker)) return;
    if (state.code !== undefined) {
      throw new Error(`Session ended before ${marker}: ${state.stderr}`);
    }
    await pause(20);
  }
  throw new Error(`Timeout waiting for ${marker}: ${state.stderr}`);
}

function fixtureCounts() {
  return JSON.parse(query(`select jsonb_build_object(
    'users',(select count(*) from auth.users where id in ('${crewheadUser}','${approverUser}','${contractorUser}')),
    'profiles',(select count(*) from public.profiles where id in ('${crewheadProfile}','${approverProfile}','${contractorProfile}')),
    'events',(select count(*) from public.events where id='${eventId}'),
    'timelogs',(select count(*) from public.timelogs where id='${timelogId}'),
    'days',(select count(*) from public.timelog_days where id='${dayId}'),
    'approvals',(select count(*) from public.timelog_approvals where id='${approvalId}'));`));
}

let a;
let b;
let fixturesCreated = false;
try {
  assert.deepEqual(fixtureCounts(), {
    users: 0, profiles: 0, events: 0, timelogs: 0, days: 0, approvals: 0,
  }, 'refuse to reuse existing synthetic fixture IDs');

  query(`begin;
    insert into auth.users(id) values ('${crewheadUser}'),('${approverUser}'),('${contractorUser}');
    delete from public.user_roles where user_id in ('${crewheadUser}','${approverUser}','${contractorUser}');
    delete from public.profiles where user_id in ('${crewheadUser}','${approverUser}','${contractorUser}');
    insert into public.profiles(id,user_id,first_name,last_name) values
      ('${crewheadProfile}','${crewheadUser}','Concurrency','Crewhead'),
      ('${approverProfile}','${approverUser}','Concurrency','Approver'),
      ('${contractorProfile}','${contractorUser}','Concurrency','Contractor');
    insert into public.user_roles(user_id,role) values
      ('${crewheadUser}','crewhead'),('${approverUser}','coo'),('${contractorUser}','crew');
    insert into public.events(id,name,contact_profile_id,contact_approves_hours,timelog_approver_profile_id)
      values ('${eventId}','Targeted approval concurrency','${approverProfile}',true,null);
    insert into public.timelogs(id,event_id,contractor_id,status,km,note)
      values ('${timelogId}','${eventId}','${contractorProfile}','pending_ch',0,'concurrency');
    insert into public.timelog_days(id,timelog_id,date,time_from,time_to,day_type)
      values ('${dayId}','${timelogId}','2099-07-01','08:00','17:00','provoz');
    commit;`);
  fixturesCreated = true;

  const [eventUpdatedAt, timelogUpdatedAt] = query(`select e.updated_at from public.events e where e.id='${eventId}';
    select t.updated_at from public.timelogs t where t.id='${timelogId}';`).split('\n');

  // A holds the same first parent lock that the handoff RPC takes. B then
  // acquires its event lock and demonstrably waits for A's timelog lock.
  a = session(`begin;
    set local application_name='targeted-approval-concurrency-a';
    ${auth(crewheadUser)}
    select id from public.timelogs where id='${timelogId}' for update;
    select 'A_LOCKED_TIMELOG';
  `);
  await waitForOutput(a, 'A_LOCKED_TIMELOG');

  b = session(`begin;
    set local application_name='targeted-approval-concurrency-b';
    ${auth(crewheadUser)}
    select * from public.delete_event_atomic('${eventId}','${eventUpdatedAt}');
    commit;
    select 'B_COMMITTED';
  `);
  b.child.stdin.end();

  let bWaitsOnA = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    bWaitsOnA = query(`select exists(
      select 1 from pg_catalog.pg_stat_activity b
      join pg_catalog.pg_stat_activity a
        on a.application_name='targeted-approval-concurrency-a'
       and a.pid=any(pg_catalog.pg_blocking_pids(b.pid))
      where b.application_name='targeted-approval-concurrency-b'
        and b.wait_event_type='Lock');`) === 't';
    if (bWaitsOnA) break;
    if (b.code !== undefined) throw new Error(`B ended before waiting on A: ${b.stderr}`);
    await pause(25);
  }
  assert.ok(bWaitsOnA, 'B delete must actually wait on A timelog lock');

  a.child.stdin.write(`select public.handoff_timelogs_for_approval_atomic(jsonb_build_array(jsonb_build_object(
    'id','${timelogId}','expected_updated_at','${timelogUpdatedAt}',
    'approval_id','${approvalId}','approval_round_id','${roundId}')));
    select 'A_HANDED_OFF';
    commit;
    select 'A_COMMITTED';
  `);
  a.child.stdin.end();

  let aBlockedByB = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (a.stdout.includes('A_HANDED_OFF') || a.code !== undefined) break;
    aBlockedByB ||= query(`select exists(
      select 1 from pg_catalog.pg_stat_activity a
      join pg_catalog.pg_stat_activity b
        on b.application_name='targeted-approval-concurrency-b'
       and b.pid=any(pg_catalog.pg_blocking_pids(a.pid))
      where a.application_name='targeted-approval-concurrency-a'
        and a.wait_event_type='Lock');`) === 't';
    if (aBlockedByB) break;
    await pause(20);
  }
  if (aBlockedByB) {
    await Promise.all([a.exited, b.exited]);
    throw new Error(`A handoff was blocked by B event lock (pre-fix cycle).\nA: ${a.stderr}\nB: ${b.stderr}`);
  }
  await waitForOutput(a, 'A_COMMITTED');
  assert.equal(await a.exited, 0, `A handoff failed: ${a.stderr}`);

  await b.exited;
  assert.notEqual(b.code, 0, 'B delete must fail after A protects the timelog');
  assert.match(b.stderr, /P0001:.*event_has_protected_timelogs/);
  assert.doesNotMatch(b.stderr, /40P01|deadlock detected/i);
  assert.ok(!b.stdout.includes('B_COMMITTED'));

  assert.deepEqual(JSON.parse(query(`select jsonb_build_object(
    'event_exists',exists(select 1 from public.events where id='${eventId}'),
    'timelog_status',(select status from public.timelogs where id='${timelogId}'),
    'day_count',(select count(*) from public.timelog_days where id='${dayId}' and timelog_id='${timelogId}'),
    'approval_count',(select count(*) from public.timelog_approvals
      where id='${approvalId}' and timelog_id='${timelogId}' and status='pending'))::text;`)), {
    day_count: 1, event_exists: true, timelog_status: 'pending_coo', approval_count: 1,
  });
  console.log('PASS: B waited on A; A never waited on B; B failed with protected timelog and no partial delete.');
} finally {
  for (const state of [a, b]) {
    if (state && state.code === undefined) {
      state.child.stdin.end('rollback;\n\\q\n');
      await state.exited;
    }
  }
  if (fixturesCreated) {
    const current = fixtureCounts();
    assert.equal(current.users, 3, 'refuse cleanup after unexpected auth fixture change');
    assert.equal(current.profiles, 3, 'refuse cleanup after unexpected profile fixture change');
    assert.ok(current.events <= 1 && current.timelogs <= 1 && current.days <= 1 && current.approvals <= 1,
      'refuse cleanup after unexpected fixture duplication');
    query(`begin;
      delete from public.timelog_approvals where id='${approvalId}';
      delete from public.timelog_days where id='${dayId}';
      delete from public.timelogs where id='${timelogId}';
      delete from public.events where id='${eventId}';
      delete from public.user_roles where user_id in ('${crewheadUser}','${approverUser}','${contractorUser}');
      delete from public.profiles where id in ('${crewheadProfile}','${approverProfile}','${contractorProfile}');
      delete from auth.users where id in ('${crewheadUser}','${approverUser}','${contractorUser}');
      commit;`);
    assert.deepEqual(fixtureCounts(), {
      users: 0, profiles: 0, events: 0, timelogs: 0, days: 0, approvals: 0,
    });
    console.log('PASS: exact synthetic concurrency fixtures removed.');
  }
}
