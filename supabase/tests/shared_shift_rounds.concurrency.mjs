// Fixed local destination; no linked/remote option or user data fixture reuse.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';

const dockerArgs = ['--context', 'colima', 'exec', '-i', '-e', 'PGOPTIONS=-c supautils.hint_roles=',
  'crewflow-event-form-db', 'psql', '-U', 'postgres', '-d', 'crewflow_shared_shift_tests',
  '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'];
const id = n => `94000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const q = value => `'${String(value).replaceAll("'", "''")}'`;
const list = values => values.map(q).join(',');
const events = [101,102,103].map(id);
const actors = [1,2,3].map(id);
const profiles = [11,12,13].map(id);
const requests = [501,502,503,504,505,506].map(id);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const auth = n => `set local role authenticated;set local request.jwt.claim.sub=${q(id(n))};`;

function query(sql) {
  const result = spawnSync('docker', dockerArgs, { input: sql, encoding: 'utf8', timeout: 20000 });
  if (result.status !== 0) throw new Error(`Local query failed: ${result.stderr}`);
  return result.stdout.trim();
}
function session(name, sql) {
  const child = spawn('docker', dockerArgs, { stdio: ['pipe','pipe','pipe'] });
  const state = { child, stdout: '', stderr: '', code: undefined, name };
  child.stdout.setEncoding('utf8').on('data', chunk => { state.stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', chunk => { state.stderr += chunk; });
  state.exited = new Promise((resolve,reject) => {
    child.once('error', reject); child.once('close', code => { state.code=code; resolve(code); });
  });
  child.stdin.write(`begin;set local application_name=${q(name)};${sql}\n`);
  return state;
}
async function waitFor(state, marker) {
  for(let n=0;n<200;n++) {
    if(state.stdout.includes(marker)) return;
    if(state.code!==undefined) throw new Error(`Session ended: ${state.stderr}`);
    await pause(25);
  }
  throw new Error(`Timed out: ${marker}`);
}
async function blockedBy(b,a) {
  for(let n=0;n<100;n++) {
    if(query(`select exists(select 1 from pg_stat_activity b join pg_stat_activity a on a.pid=any(pg_blocking_pids(b.pid))
      where a.application_name=${q(a.name)} and b.application_name=${q(b.name)} and b.wait_event_type='Lock');`)==='t') return;
    if(b.code!==undefined) throw new Error(`Contender failed before blocking: ${b.stderr}`);
    await pause(25);
  }
  throw new Error('Contender never observed waiting on the winning session');
}
const tables = ['auth.users','public.user_roles','public.profiles','public.events','public.projects','public.event_assignments',
  'public.timelogs','public.timelog_days','public.timelog_approvals','public.invoices','public.invoice_timelogs','public.receipts',
  'public.billing_groups','public.shift_workflows','public.shift_workflow_events','public.shift_workflow_state',
  'public.shift_workflow_requests','public.shift_workflow_rounds','public.shift_workflow_round_items','public.shift_workflow_round_actions',
  'private.shift_workflow_write_permits','private.shift_workflow_assignment_permits'];
function snapshot() {
  return JSON.parse(query(`select jsonb_build_object(${tables.map(t => `${q(t)},(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from ${t} t)`).join(',')});`));
}
function payload() {
  const rows=JSON.parse(query(`select jsonb_agg(to_jsonb(t) order by t.id) from public.timelogs t where t.contractor_id=${q(id(13))} and t.event_id in(${list(events)});`));
  return rows.map((t,n) => ({ id:t.id,event_id:t.event_id,expected_updated_at:t.updated_at,expected_status:t.status,km:1,note:'Concurrency actuals',
    days:[{id:id(800+n),date:'2099-10-01',time_from:'08:00',time_to:'16:00',day_type:'pripravy',note:null,meal:null,meals:[]}] }));
}
function sharedData() {
  return JSON.parse(query(`select jsonb_build_object(
    'timelogs',(select jsonb_agg(to_jsonb(t) order by id) from public.timelogs t where contractor_id=${q(id(13))}),
    'days',(select coalesce(jsonb_agg(to_jsonb(d) order by d.id),'[]') from public.timelog_days d join public.timelogs t on t.id=d.timelog_id where t.contractor_id=${q(id(13))}));`));
}
function submit(request, rows) {
  return `select public.submit_shift_workflow_round_atomic(${q(id(request))},${q(id(600))},${q(id(400))},${q(id(13))},${q(id(101))},${q(JSON.stringify(rows))}::jsonb);`;
}
function transition(request, action, round, targets) {
  return `select public.transition_shift_workflow_round_atomic(${q(id(request))},${q(id(600))},${q(round.updated_at)},
    ${q(JSON.stringify(targets))}::jsonb,${q(action)},${q(action==='return'?'Concurrent return':'')},
    ${action==='return'?q(id(101)):'null'},null);`;
}

const original=snapshot();
const sessions=[];
let created=false;
try {
  assert.equal(query(`select count(*) from (select id from auth.users where id in(${list(actors)}) union all
    select id from public.events where id in(${list([...events,id(104)])}) union all select id from public.shift_workflows where id=${q(id(400))}
    union all select request_id from public.shift_workflow_requests where request_id in(${list(requests)})) x;`),'0');
  query(`begin;insert into auth.users(id) values ${actors.map(a=>`(${q(a)})`).join(',')};
    delete from public.user_roles where user_id in(${list(actors)});delete from public.profiles where user_id in(${list(actors)});
    insert into public.profiles(id,user_id,first_name,last_name) values ${profiles.map((p,n)=>`(${q(p)},${q(actors[n])},'Round concurrency',${q(n)})`).join(',')};
    insert into public.user_roles(user_id,role) values(${q(id(1))},'crewhead'),(${q(id(2))},'coo'),(${q(id(3))},'crew');
    insert into public.events(id,name,contact_profile_id,contact_approves_hours) values
      ${events.map(e=>`(${q(e)},'Round concurrency',${q(id(12))},true)`).join(',')};
    insert into public.events(id,name) values(${q(id(104))},'Foreign unlinked day fixture');
    insert into public.timelogs(id,event_id,contractor_id,status) values(${q(id(204))},${q(id(104))},${q(id(12))},'draft');
    insert into public.event_assignments(event_id,profile_id) values(${q(id(101))},${q(id(13))}),(${q(id(102))},${q(id(13))});
    insert into public.timelogs(id,event_id,contractor_id,status) values(${q(id(201))},${q(id(101))},${q(id(13))},'draft'),(${q(id(202))},${q(id(102))},${q(id(13))},'draft');
    insert into public.shift_workflows(id,created_by) values(${q(id(400))},${q(id(1))});
    insert into public.shift_workflow_events(workflow_id,event_id,position) values ${events.map((e,n)=>`(${q(id(400))},${q(e)},${n})`).join(',')};commit;`);
  created=true;
  const oldPayload=payload();

  // A creates a canonical later assignment and holds the event/child locks.
  // B must wait and then reject its now-incomplete entire submission set.
  const a=session('shared-round-assign-a',`${auth(1)}select public.assign_event_crew(${q(id(103))},${q(id(13))},null,'[{"date":"2099-10-01","time_from":"","time_to":"","day_type":"deinstal"}]');select 'A_ASSIGNED';`);
  sessions.push(a);await waitFor(a,'A_ASSIGNED');
  const b=session('shared-round-submit-b',`${auth(3)}${submit(501,oldPayload)}commit;`);
  sessions.push(b);b.child.stdin.end();await blockedBy(b,a);
  a.child.stdin.end('commit;');assert.equal(await a.exited,0,a.stderr);assert.notEqual(await b.exited,0);
  assert.match(b.stderr,/22023:.*shift_workflow_set_invalid/);
  assert.equal(query(`select count(*) from public.shift_workflow_rounds where id=${q(id(600))};`),'0');
  assert.equal(query(`select count(*) from public.timelogs where contractor_id=${q(id(13))} and status='draft';`),'3');
  console.log('PASS: submission waited for assignment commit, rejected missing new member, no partial round/status/request.');

  // A's foreign day UUID is invisible when B checks ownership. A then commits
  // while B waits on the unique index, so the conflict action itself must check
  // the parent and reject the whole batch without touching the foreign record.
  const beforeCollision=sharedData();
  const colliding=payload().map(t=>({...t,km:77,note:'Collision batch must roll back'}));
  colliding.at(-1).days[0].id=id(900);
  const foreignInsert=session('shared-round-foreign-day-a',`${auth(1)}insert into public.timelog_days(id,timelog_id,date,time_from,time_to,day_type,note,meal,meals)
    values(${q(id(900))},${q(id(204))},'2099-11-11','11:00','13:00','provoz','Foreign immutable note','obed',array['obed','vecere']);
    select 'A_FOREIGN_DAY_'||to_jsonb(d)::text from public.timelog_days d where id=${q(id(900))};`);
  sessions.push(foreignInsert);await waitFor(foreignInsert,'A_FOREIGN_DAY_');
  const expectedForeign=JSON.parse(foreignInsert.stdout.split('\n').find(line=>line.startsWith('A_FOREIGN_DAY_')).slice('A_FOREIGN_DAY_'.length));
  const collisionSave=session('shared-round-collision-b',`${auth(3)}select public.save_shift_workflow_drafts_atomic(${q(id(506))},${q(id(400))},${q(id(13))},${q(id(101))},${q(JSON.stringify(colliding))}::jsonb);commit;`);
  sessions.push(collisionSave);collisionSave.child.stdin.end();await blockedBy(collisionSave,foreignInsert);
  foreignInsert.child.stdin.end('commit;');assert.equal(await foreignInsert.exited,0,foreignInsert.stderr);
  const collisionExit=await collisionSave.exited;
  assert.deepEqual(JSON.parse(query(`select to_jsonb(d) from public.timelog_days d where id=${q(id(900))};`)),expectedForeign,'foreign unlinked day must stay byte-for-byte unchanged');
  assert.notEqual(collisionExit,0,'foreign day conflict must reject the entire shared save');
  assert.match(collisionSave.stderr,/22023:.*shift_workflow_day_invalid/);
  assert.deepEqual(sharedData(),beforeCollision,'collision must roll back every shared parent/day/version');
  assert.equal(query(`select count(*) from public.shift_workflow_requests where request_id=${q(id(506))};`),'0');
  console.log('PASS: invisible foreign day UUID conflict waited then failed closed; foreign data and complete shared batch unchanged.');

  // A row-level day write can hold a day tuple before its BEFORE trigger runs.
  // The shared guard must reject unauthorized DML before waiting on its parent,
  // or a simultaneous legitimate parent-first batch could deadlock with it.
  const day=query(`select d.id from public.timelog_days d join public.timelogs t on t.id=d.timelog_id where t.event_id=${q(id(103))} and t.contractor_id=${q(id(13))};`);
  const dayWriter=session('shared-round-day-a',`${auth(3)}select id from public.timelog_days where id=${q(day)} for update;select 'A_DAY_LOCKED';`);
  sessions.push(dayWriter);await waitFor(dayWriter,'A_DAY_LOCKED');
  const batchWriter=session('shared-round-save-b',`${auth(3)}select public.save_shift_workflow_drafts_atomic(${q(id(505))},${q(id(400))},${q(id(13))},${q(id(101))},${q(JSON.stringify(payload()))}::jsonb);commit;`);
  sessions.push(batchWriter);batchWriter.child.stdin.end();await blockedBy(batchWriter,dayWriter);
  dayWriter.child.stdin.end(`update public.timelog_days set note='forbidden concurrent raw edit' where id=${q(day)};commit;`);
  assert.notEqual(await dayWriter.exited,0);assert.match(dayWriter.stderr,/42501:.*shared_shift_write_required/);
  assert.equal(await batchWriter.exited,0,batchWriter.stderr);
  console.log('PASS: raw day write denied before parent wait; legitimate full save completed without lock inversion.');

  // A submits the full current set. Raw assignment deletion B must wait for
  // A's assignment-row locks, then recheck active membership after the wait.
  const c=session('shared-round-submit-a',`${auth(3)}${submit(502,payload())}select 'A_SUBMITTED';`);
  sessions.push(c);await waitFor(c,'A_SUBMITTED');
  const d=session('shared-round-delete-b',`${auth(1)}delete from public.event_assignments where event_id=${q(id(101))} and profile_id=${q(id(13))};commit;`);
  sessions.push(d);d.child.stdin.end();await blockedBy(d,c);
  c.child.stdin.end('commit;');assert.equal(await c.exited,0,c.stderr);assert.notEqual(await d.exited,0);
  assert.match(d.stderr,/55000:.*shared_shift_assignment_locked/);
  assert.equal(query(`select count(*) from public.event_assignments where profile_id=${q(id(13))};`),'3');
  console.log('PASS: raw assignment deletion waited for submission and then failed; frozen assignments remain intact.');

  const round=JSON.parse(query(`select to_jsonb(r) from public.shift_workflow_rounds r where id=${q(id(600))};`));
  const targets=JSON.parse(query(`select jsonb_agg(jsonb_build_object('id',t.id,'expected_updated_at',t.updated_at,'expected_status',t.status) order by t.id)
    from public.timelogs t join public.shift_workflow_round_items i on i.timelog_id=t.id where i.round_id=${q(id(600))};`));
  const e=session('shared-round-decision-a',`${auth(1)}${transition(503,'approve',round,targets)}select 'A_HANDED_OFF';`);
  sessions.push(e);await waitFor(e,'A_HANDED_OFF');
  const f=session('shared-round-decision-b',`${auth(1)}${transition(504,'return',round,targets)}commit;`);
  sessions.push(f);f.child.stdin.end();await blockedBy(f,e);
  e.child.stdin.end('commit;');assert.equal(await e.exited,0,e.stderr);assert.notEqual(await f.exited,0);
  assert.match(f.stderr,/40001:.*shift_workflow_round_conflict/);
  assert.equal(query(`select count(*) from public.timelogs where contractor_id=${q(id(13))} and status='pending_coo';`),'3');
  assert.equal(query(`select count(*) from public.shift_workflow_round_actions where round_id=${q(id(600))};`),'2');
  assert.equal(query(`select count(*) from public.shift_workflow_round_items where round_id=${q(id(600))} and released_at is not null;`),'0');
  assert.equal(query(`select count(*) from public.shift_workflow_requests where request_id in(${q(id(501))},${q(id(504))});`),'0');
  assert.equal(query(`select count(*) from public.timelog_approvals where timelog_id in(select timelog_id from public.shift_workflow_round_items where round_id=${q(id(600))}) and status='pending';`),'3');
  console.log('PASS: conflicting approval/return serialized; loser failed 40001 with no partial status/action/release/approval/request.');
} finally {
  for(const state of sessions) if(state.code===undefined) { state.child.stdin.end('rollback;');await state.exited; }
  if(created) {
    // Resolve generated canonical IDs only through verified fixture ownership.
    const owned=JSON.parse(query(`select jsonb_agg(to_jsonb(t) order by t.id) from public.timelogs t where contractor_id=${q(id(13))};`));
    assert.ok(owned.length>=2 && owned.length<=3 && owned.every(t=>events.includes(t.event_id)));
    const timelogs=owned.map(t=>t.id);
    query(`begin;
      do $$ begin
        if not exists(select 1 from public.shift_workflows where id=${q(id(400))} and created_by=${q(id(1))})
          or (select array_agg(event_id order by event_id) from public.shift_workflow_events where workflow_id=${q(id(400))})
            is distinct from array[${list(events)}]::uuid[]
          or exists(select 1 from public.shift_workflow_rounds where id=${q(id(600))} and (workflow_id<>${q(id(400))} or contractor_id<>${q(id(13))}))
        then raise exception 'fixture ownership changed; refuse cleanup';end if;
      end $$;
      delete from public.shift_workflow_round_actions where round_id=${q(id(600))};
      delete from public.shift_workflow_round_items where round_id=${q(id(600))};
      delete from public.shift_workflow_rounds where id=${q(id(600))};
      delete from public.shift_workflow_requests where request_id in(${list(requests)}) and actor_id in(${list(actors)});
      delete from public.shift_workflow_events where workflow_id=${q(id(400))};delete from public.shift_workflows where id=${q(id(400))};
      delete from public.timelog_approvals where timelog_id in(${list(timelogs)});
      delete from public.timelogs where id in(${list(timelogs)}) and contractor_id=${q(id(13))};
      delete from public.timelogs where id=${q(id(204))} and event_id=${q(id(104))} and contractor_id=${q(id(12))};
      delete from public.event_assignments where event_id in(${list(events)}) and profile_id=${q(id(13))};
      delete from public.events where id in(${list(events)});
      delete from public.events where id=${q(id(104))} and name='Foreign unlinked day fixture';
      delete from public.user_roles where user_id in(${list(actors)});
      delete from public.profiles where id in(${list(profiles)}) and user_id in(${list(actors)});
      delete from auth.users where id in(${list(actors)});commit;`);
    assert.deepEqual(snapshot(),original,'all original business/workflow/permit rows must be unchanged after exact cleanup');
    console.log('PASS: exact fixture cleanup; all original rows unchanged.');
  }
}
