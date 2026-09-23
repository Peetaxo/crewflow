// Deliberately fixed local destination. No remote URL/database override exists.
// Run: node supabase/tests/shared_shift_workflows.concurrency.mjs
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';

const dockerArgs = ['--context', 'colima', 'exec', '-i', 'crewflow-event-form-db',
  'psql', '-U', 'postgres', '-d', 'crewflow_shared_shift_tests', '-X', '-qAt',
  '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'];
const id = (n) => `92000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actor = id(1);
const profile = id(11);
const events = [101, 102, 103, 104].map(id);
const requests = [401, 402].map(id);
const literalIds = (ids) => ids.map((value) => `'${value}'`).join(',');
const auth = `set local role authenticated; set local request.jwt.claim.sub='${actor}';`;
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
  child.stdin.write(`${sql}\n`);
  return state;
}
async function waitFor(state, marker) {
  for (let n = 0; n < 250; n += 1) {
    if (state.stdout.includes(marker)) return;
    if (state.code !== undefined) throw new Error(`Session ended before ${marker}: ${state.stderr}`);
    await pause(20);
  }
  throw new Error(`Timed out waiting for ${marker}`);
}
function businessSnapshot() {
  // All original business tables are compared before setup and after exact-ID cleanup.
  return JSON.parse(query(`select jsonb_build_object(
    'users',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from auth.users t),
    'profiles',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.profiles t),
    'events',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.events t),
    'projects',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.projects t),
    'assignments',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.event_assignments t),
    'timelogs',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.timelogs t),
    'days',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.timelog_days t),
    'invoices',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.invoices t),
    'receipts',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.receipts t),
    'billing_groups',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.billing_groups t));`));
}
function workflowSnapshot() {
  return JSON.parse(query(`select jsonb_build_object(
    'revision',(select revision from public.shift_workflow_state),
    'headers',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.shift_workflows t),
    'members',(select coalesce(jsonb_agg(to_jsonb(t) order by event_id),'[]') from public.shift_workflow_events t),
    'requests',(select coalesce(jsonb_agg(to_jsonb(t) order by request_id),'[]') from public.shift_workflow_requests t));`));
}

let a;
let b;
let created = false;
let committedWorkflow;
const originalBusiness = businessSnapshot();
const originalWorkflow = workflowSnapshot();
try {
  assert.equal(query(`select count(*) from (
    select id from auth.users where id='${actor}'
    union all select id from public.profiles where id='${profile}'
    union all select id from public.events where id in (${literalIds(events)})
    union all select request_id from public.shift_workflow_requests where request_id in (${literalIds(requests)})
  ) conflicts;`), '0', 'refuse to reuse existing fixture identities');
  query(`begin;
    insert into auth.users(id) values('${actor}');
    delete from public.user_roles where user_id='${actor}';
    delete from public.profiles where user_id='${actor}';
    insert into public.profiles(id,user_id,first_name,last_name) values('${profile}','${actor}','Shift concurrency','Manager');
    insert into public.user_roles(user_id,role) values('${actor}','crewhead');
    insert into public.events(id,name,job_number) values
      ${events.map((event, n) => `('${event}','Shared shift concurrency ${n}','SYNTHETIC-SHIFT')`).join(',')};
    commit;`);
  created = true;
  const versions = JSON.parse(query(`select jsonb_object_agg(id::text,updated_at) from public.events where id in (${literalIds(events)});`));
  const save = (index) => {
    const selected = events.slice(index * 2, index * 2 + 2);
    const selectedVersions = Object.fromEntries(selected.map((event) => [event, versions[event]]));
    return `select public.save_shift_workflow_atomic('${requests[index]}',null,
      array[${literalIds(selected)}]::uuid[],${originalWorkflow.revision},
      '${JSON.stringify(selectedVersions)}'::jsonb,false,false,false);`;
  };

  // A runs the real RPC and retains its revision/event locks until COMMIT.
  a = session(`begin; set local application_name='shared-shift-concurrency-a';
    ${auth} ${save(0)} select 'A_SAVED_HOLDING_REVISION';`);
  await waitFor(a, 'A_SAVED_HOLDING_REVISION');
  b = session(`begin; set local application_name='shared-shift-concurrency-b';
    ${auth} ${save(1)} commit; select 'B_COMMITTED';`);
  b.child.stdin.end();
  let blocked = false;
  for (let n = 0; n < 120; n += 1) {
    blocked = query(`select exists(
      select 1 from pg_stat_activity b join pg_stat_activity a
        on a.application_name='shared-shift-concurrency-a' and a.pid=any(pg_blocking_pids(b.pid))
      where b.application_name='shared-shift-concurrency-b' and b.wait_event_type='Lock'
        and exists(select 1 from pg_locks l where l.pid=b.pid
          and l.relation='public.shift_workflow_state'::regclass));`) === 't';
    if (blocked) break;
    if (b.code !== undefined) throw new Error(`B exited before blocking: ${b.stderr}`);
    await pause(25);
  }
  assert.ok(blocked, 'B must actually block on A while accessing singleton revision');
  a.child.stdin.end("commit; select 'A_COMMITTED';");
  assert.equal(await a.exited, 0, a.stderr);
  assert.notEqual(await b.exited, 0, 'B must reject the stale expected revision');
  assert.match(b.stderr, /40001:.*shift_workflow_revision_conflict/);
  assert.ok(!b.stdout.includes('B_COMMITTED'));
  const after = workflowSnapshot();
  const ownRequest = after.requests.find((request) => request.request_id === requests[0]);
  assert.ok(ownRequest);
  committedWorkflow = ownRequest.result.workflow_id;
  assert.equal(after.revision, originalWorkflow.revision + 1);
  assert.deepEqual(after.requests.filter((request) => requests.includes(request.request_id)).map((request) => request.request_id), [requests[0]]);
  assert.deepEqual(after.members.filter((member) => events.includes(member.event_id)).map((member) => member.event_id), events.slice(0, 2));
  assert.deepEqual(after.headers.filter((header) => header.created_by === actor).map((header) => header.id), [committedWorkflow]);
  console.log('PASS: B observed waiting on A revision lock; A committed; B failed 40001; no partial B header/member/request/revision.');
} finally {
  for (const state of [a, b]) {
    if (state && state.code === undefined) {
      state.child.stdin.end('rollback;');
      await state.exited;
    }
  }
  if (created) {
    // Resolve only a verified fixture request. Never delete by prefix or broad scope.
    const requestRows = JSON.parse(query(`select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.shift_workflow_requests r where request_id in (${literalIds(requests)});`));
    assert.ok(requestRows.length <= 1 && requestRows.every((r) => r.request_id === requests[0] && r.actor_id === actor));
    const cleanupWorkflow = requestRows[0]?.result.workflow_id;
    assert.ok(!committedWorkflow || cleanupWorkflow === committedWorkflow);
    query(`begin;
      select revision from public.shift_workflow_state for update;
      do $$ begin
        if (select revision from public.shift_workflow_state) <> ${originalWorkflow.revision + requestRows.length}
          or (select count(*) from public.shift_workflow_requests) <> ${originalWorkflow.requests.length + requestRows.length}
        then raise exception 'concurrent unrelated mutation: refuse cleanup revision restore'; end if;
      end $$;
      ${cleanupWorkflow ? `do $$ begin
        if not exists(select 1 from public.shift_workflows where id='${cleanupWorkflow}' and created_by='${actor}')
          or (select array_agg(event_id order by event_id) from public.shift_workflow_events where workflow_id='${cleanupWorkflow}')
            is distinct from array[${literalIds(events.slice(0, 2))}]::uuid[]
        then raise exception 'fixture workflow changed: refuse cleanup'; end if;
      end $$;
      delete from public.shift_workflow_events where workflow_id='${cleanupWorkflow}';
      delete from public.shift_workflows where id='${cleanupWorkflow}';
      delete from public.shift_workflow_requests where request_id='${requests[0]}' and actor_id='${actor}';` : ''}
      delete from public.events where id in (${literalIds(events)});
      delete from public.user_roles where user_id='${actor}';
      delete from public.profiles where id='${profile}' and user_id='${actor}';
      delete from auth.users where id='${actor}';
      update public.shift_workflow_state set revision=${originalWorkflow.revision} where singleton;
      commit;`);
    assert.deepEqual(businessSnapshot(), originalBusiness, 'original business rows restored byte-for-byte');
    assert.deepEqual(workflowSnapshot(), originalWorkflow, 'workflow state restored after exact fixture cleanup');
    console.log('PASS: exact fixture cleanup; original business and workflow snapshots unchanged.');
  }
}
