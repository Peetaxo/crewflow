// Local-only integration proof. No connection URL, remote context, or production mode exists.
// Requires an empty billing feature in the disposable crewflow-billing-tests database.
// Run: node supabase/tests/billing_groups.concurrency.mjs
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';

const context = 'colima-crewflow-billing';
const container = 'supabase_db_crewflow-billing-tests';
const actor = '10000000-0000-4000-8000-000000000901';
const groupA = '40000000-0000-4000-8000-000000000901';
const groupB = '40000000-0000-4000-8000-000000000902';
const requestA = '50000000-0000-4000-8000-000000000901';
const requestB = '50000000-0000-4000-8000-000000000902';
const requestCleanup = '50000000-0000-4000-8000-000000000903';
const dockerArgs = ['--context', context, 'exec', '-i', container, 'psql', '-U', 'postgres',
  '-d', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'];
const auth = `set local role authenticated; set local request.jwt.claims = '{"sub":"${actor}","role":"authenticated"}';`;
const save = (request, group, revision, deleting = false) =>
  `select public.save_billing_group_atomic('${request}','${group}','Concurrency fixture','{}',${revision},'{}',false,false,${deleting});`;
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
    if (state.code !== undefined) throw new Error(`Session ended before ${marker}: ${state.stderr}`);
    await pause(20);
  }
  throw new Error(`Timeout waiting for ${marker}: ${state.stderr}`);
}

function snapshot() {
  return JSON.parse(query(`select jsonb_build_object(
    'revision',(select revision from public.billing_group_state where singleton),
    'groups',(select coalesce(jsonb_agg(id order by id),'[]') from public.billing_groups),
    'members',(select count(*) from public.billing_group_members),
    'requests',(select coalesce(jsonb_agg(request_id order by request_id),'[]') from public.billing_group_requests));`));
}

let a;
let b;
let fixturesCreated = false;
try {
  // Refuse to run over real data or reuse someone else's fixture IDs.
  assert.deepEqual(snapshot(), { revision: 0, groups: [], members: 0, requests: [] });
  assert.equal(query(`select count(*) from auth.users where id='${actor}';`), '0');
  query(`begin; insert into auth.users(id,email,raw_user_meta_data)
    values('${actor}','billing-concurrency@example.invalid','{}');
    insert into public.user_roles(user_id,role) values('${actor}','crewhead'); commit;`);
  fixturesCreated = true;

  a = session(`begin; set local application_name='billing-group-concurrency-a'; ${auth}
    ${save(requestA, groupA, 0)}
    select 'A_SAVED';
  `);
  await waitForOutput(a, 'A_SAVED');
  b = session(`begin; set local application_name='billing-group-concurrency-b'; ${auth}
    ${save(requestB, groupB, 0)} commit;
    select 'B_COMMITTED';
  `);
  b.child.stdin.end();

  let observedWait = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    observedWait = query(`select exists(select 1 from pg_stat_activity b
      where b.application_name='billing-group-concurrency-b' and b.wait_event_type='Lock'
      and exists(select 1 from pg_stat_activity a where a.application_name='billing-group-concurrency-a'
        and a.pid=any(pg_blocking_pids(b.pid))));`) === 't';
    if (observedWait) break;
    if (b.code !== undefined) throw new Error(`B failed before waiting: ${b.stderr}`);
    await pause(50);
  }
  assert.ok(observedWait, 'B must actually wait on A before A commits');
  assert.deepEqual(snapshot(), { revision: 0, groups: [], members: 0, requests: [] }, 'A uncommitted changes are invisible');

  a.child.stdin.end('commit;\n\\echo A_COMMITTED\n\\q\n');
  await waitForOutput(a, 'A_COMMITTED');
  assert.equal(await a.exited, 0);
  await b.exited;
  assert.notEqual(b.code, 0, 'losing transaction must fail');
  assert.match(b.stderr, /40001:.*billing_group_conflict/);
  assert.ok(!b.stdout.includes('B_COMMITTED'));
  assert.deepEqual(snapshot(), { revision: 1, groups: [groupA], members: 0, requests: [requestA] },
    'only A commits; no B header, ledger, membership, or revision change');
  console.log('PASS: B waited on A, then failed 40001 after A committed; no partial B state.');
} finally {
  // End open transactions before touching fixtures; a failed assertion must not leave locks.
  for (const state of [a, b]) {
    if (state && state.code === undefined) {
      state.child.stdin.end('rollback;\n\\q\n');
      await state.exited;
    }
  }
  if (fixturesCreated) {
    const current = snapshot();
    if (current.revision === 1) {
      assert.deepEqual(current, { revision: 1, groups: [groupA], members: 0, requests: [requestA] },
        'refuse cleanup if database changed beyond the exact fixture');
      query(`begin; ${auth} ${save(requestCleanup, groupA, 1, true)} commit;`);
    } else {
      assert.deepEqual(current, { revision: 0, groups: [], members: 0, requests: [] },
        'refuse cleanup of unexpected state');
    }
    const expectedRevision = current.revision === 1 ? 2 : 0;
    // Test-only administrator teardown: after exact empty-feature and fixture-ledger checks,
    // restore its original revision inside a transaction. No production/client code does this.
    query(`begin;
      do $$ begin
        if (select revision from public.billing_group_state where singleton) <> ${expectedRevision}
          or exists(select 1 from public.billing_groups) or exists(select 1 from public.billing_group_members)
          or exists(select 1 from public.billing_group_requests where actor_id <> '${actor}'
            or request_id not in ('${requestA}','${requestCleanup}')) then
          raise exception 'Refusing non-fixture cleanup';
        end if;
      end $$;
      set local request.jwt.claims = '{"sub":"${actor}","role":"authenticated"}';
      set local app.billing_group_write='atomic';
      update public.billing_group_state set revision=0 where singleton and revision=${expectedRevision};
      delete from auth.users where id='${actor}' and email='billing-concurrency@example.invalid';
      commit;`);
    assert.deepEqual(snapshot(), { revision: 0, groups: [], members: 0, requests: [] });
    console.log('PASS: exact synthetic fixtures removed and isolated billing baseline restored.');
  }
}
