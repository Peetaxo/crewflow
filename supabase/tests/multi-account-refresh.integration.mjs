/** Guarded fixtures and genuine Auth/RPC transitions for the local stage-3 UI timing test. */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const directory = '/Users/peetax/Projekty/.crewflow-onboarding-pilot-20261020';
const credentials = JSON.parse(readFileSync(`${directory}/local-credentials.json`, 'utf8'));
assert.equal(credentials.API_URL, 'http://127.0.0.1:55431');
const stage = process.argv[3] ?? 'baseline';
assert.ok(['baseline', 'final'].includes(stage));
const file = `${directory}/stage3-refresh${stage === 'final' ? '-final' : ''}-fixtures.private.json`;
const command = process.argv[2] ?? 'status';
assert.ok(['setup', 'status', 'assign', 'submit', 'return', 'correct', 'handoff', 'approve', 'invoice-paid'].includes(command));
const q = s => `'${String(s).replaceAll("'", "''")}'`;
const sql = text => execFileSync('docker', ['exec', '-i', 'supabase_db_crewflow-onboarding-pilot-20261020', 'sh', '-c',
  'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d postgres -At -v ON_ERROR_STOP=1'],
{ input: text, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000 }).trim();
const client = key => createClient(credentials.API_URL, key ?? credentials.ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: (input, init) => {
    assert.equal(new URL(typeof input === 'string' ? input : input.url ?? input).origin, credentials.API_URL);
    return fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(15000) });
  } },
});
const ok = async request => { const result = await request; if (result.error) throw Object.assign(new Error('Local fixture operation failed'), { code: result.error.code, detail: result.error.message }); return result.data; };
let metadata;
const save = () => writeFileSync(file, JSON.stringify(metadata, null, 2), { mode: 0o600 });
const actors = {};
const rpc = (key, name, args) => ok(actors[key].rpc(name, args));
const evidence = [];
let phase = command;
try {
  if (command === 'setup') {
    assert.ok(!existsSync(file), 'Preserve existing stage-3 fixtures; use status, do not reset them.');
    metadata = { run: `stage3-${Date.now()}-${randomBytes(3).toString('hex')}`, accounts: [], clientId: randomUUID(), projectId: randomUUID(), eventId: randomUUID(), invoiceId: randomUUID(), receiptId: randomUUID() };
    const service = client(credentials.SERVICE_ROLE_KEY);
    for (const [key, role] of [['crew', 'crew'], ['crewB', 'crew'], ['ch', 'crewhead'], ['coo', 'coo']]) {
      const email = `${metadata.run}-${key.toLowerCase()}@crewflow-onboarding.test`;
      const password = randomBytes(24).toString('base64url');
      const firstName = stage === 'final' ? 'Sync final' : 'Sync';
      const created = await ok(service.auth.admin.createUser({ email, password, email_confirm: true,
        user_metadata: { first_name: firstName, last_name: key } }));
      const profile = await ok(service.from('profiles').select('id').eq('user_id', created.user.id).single());
      metadata.accounts.push({ key, role, email, password, userId: created.user.id, profileId: profile.id });
      save();
      sql(`begin; delete from public.user_roles where user_id=${q(created.user.id)}; insert into public.user_roles(user_id,role) values(${q(created.user.id)},${q(role)});
        update public.profiles set first_name=${q(firstName)},last_name=${q(key)},hourly_rate=250,ico='12345678',bank_account='123/0800',billing_street='Testovací 1',billing_zip='10000',billing_city='Praha',billing_country='CZ' where id=${q(profile.id)}; commit;`);
    }
    const actor = key => metadata.accounts.find(a => a.key === key).profileId;
    sql(`begin;
      insert into public.clients(id,name,ico,street,zip,city,country) values(${q(metadata.clientId)},${q(metadata.run)},'87654321','Testovací 2','10000','Praha','CZ');
      insert into public.projects(id,job_number,name,client_id) values(${q(metadata.projectId)},${q(metadata.run)},'NODU SYNC pilot',${q(metadata.clientId)});
      insert into public.events(id,name,project_id,job_number,client_name,date_from,date_to,time_from,time_to,city,address,crew_needed,status,schedule_version,contact_profile_id,contact_approves_hours,timelog_approver_profile_id)
        values(${q(metadata.eventId)},${q(stage === 'final' ? 'NODU SYNC – závěrečné ověření' : 'NODU SYNC – aktuálnost')},${q(metadata.projectId)},${q(metadata.run)},${q(metadata.run)},'2026-10-28','2026-10-28','08:00','16:00','Praha','Testovací 1',1,'upcoming',2,${q(actor('coo'))},true,${q(actor('ch'))});
      insert into public.invoices(id,contractor_id,event_id,job_number,invoice_number,total_amount,status) values(${q(metadata.invoiceId)},${q(actor('crew'))},${q(metadata.eventId)},${q(metadata.run)},${q(metadata.run)},2000,'sent');
      insert into public.receipts(id,contractor_id,event_id,name,amount,status) values(${q(metadata.receiptId)},${q(actor('crew'))},${q(metadata.eventId)},'NODU SYNC soukromá účtenka',100,'draft');
      commit;`);
  } else metadata = JSON.parse(readFileSync(file, 'utf8'));
  assert.match(metadata.run, /^stage3-\d+-[a-f0-9]+$/);
  for (const account of metadata.accounts) {
    assert.ok(account.email.startsWith(metadata.run) && account.email.endsWith('@crewflow-onboarding.test'));
    actors[account.key] = client();
    await ok(actors[account.key].auth.signInWithPassword({ email: account.email, password: account.password }));
  }
  const event = await ok(actors.ch.from('events').select('id,name,job_number').eq('id', metadata.eventId).single());
  assert.equal(event.job_number, metadata.run);
  const crew = metadata.accounts.find(a => a.key === 'crew');
  if (!metadata.reportId) {
    const existing = await ok(actors.crew.from('timelogs').select('id').eq('event_id', metadata.eventId).eq('contractor_id', crew.profileId).maybeSingle());
    if (existing) { metadata.reportId = existing.id; save(); }
  }
  if (metadata.reportId && ['status', 'return', 'handoff', 'approve'].includes(command)) {
    const snapshot = await rpc('crew', 'read_shift_workflows');
    const round = snapshot.rounds.filter(r => r.timelog_ids.includes(metadata.reportId))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
    if (round) {
      metadata.round = { round, timelogs: [await ok(actors.crew.from('timelogs').select('id,status,updated_at').eq('id', metadata.reportId).single())] };
      save();
    }
  }
  if (command === 'assign') {
    const result = await rpc('ch', 'assign_event_crew', { p_event_id: metadata.eventId, p_profile_id: crew.profileId, p_application_id: null,
      p_days: [{ date: '2026-10-28', time_from: '08:00', time_to: '16:00', day_type: 'provoz' }] });
    metadata.assignment = result;
    const report = await ok(actors.crew.from('timelogs').select('id').eq('event_id', metadata.eventId).eq('contractor_id', crew.profileId).single());
    metadata.reportId = report.id; save();
  }
  if (['submit', 'correct'].includes(command)) {
    assert.ok(metadata.reportId);
    const row = await ok(actors.crew.from('timelogs').select('*').eq('id', metadata.reportId).single());
    const days = await ok(actors.crew.from('timelog_days').select('*').eq('timelog_id', row.id).order('date'));
    const result = await rpc('crew', 'submit_shift_workflow_round_atomic', { p_request_id: randomUUID(), p_round_id: randomUUID(), p_workflow_id: null,
      p_contractor_id: crew.profileId, p_anchor_event_id: metadata.eventId,
      p_timelogs: [{ id: row.id, event_id: metadata.eventId, expected_updated_at: row.updated_at, expected_status: row.status, km: 0,
        note: command === 'correct' ? 'NODU SYNC opraveno' : 'NODU SYNC odesláno',
        days: days.map(({ id, date, time_from, time_to, day_type }) => ({ id, date, time_from, time_to: command === 'correct' ? '17:00' : time_to, day_type, note: '', meal: null, meals: [] })) }] });
    metadata.round = result; save();
  }
  if (['return', 'handoff', 'approve'].includes(command)) {
    assert.ok(metadata.round?.round?.id);
    let quote;
    if (command === 'approve') quote = await rpc('coo', 'get_invoice_billing_quote', { p_timelog_ids: [metadata.reportId] });
    const result = await rpc(command === 'approve' ? 'coo' : 'ch', 'transition_shift_workflow_round_atomic', {
      p_request_id: randomUUID(), p_round_id: metadata.round.round.id, p_expected_round_updated_at: metadata.round.round.updated_at,
      p_targets: metadata.round.timelogs.map(t => ({ id: t.id, expected_updated_at: t.updated_at, expected_status: t.status })),
      p_action: command === 'return' ? 'return' : command === 'handoff' ? 'handoff' : 'approve',
      p_note: command === 'return' ? 'NODU SYNC doplň poslední hodinu' : '', p_affected_event_id: command === 'return' ? metadata.eventId : null,
      p_corrections: null, ...(quote ? { p_billing_quote: quote.id } : {}),
    }); metadata.round = result; save();
  }
  if (command === 'invoice-paid') {
    const invoice = await ok(actors.coo.from('invoices').select('id,status,updated_at').eq('id', metadata.invoiceId).single());
    await rpc('coo', 'mark_invoice_paid_atomic', { p_invoice_id: invoice.id, p_expected_status: invoice.status, p_expected_updated_at: invoice.updated_at, p_paid_at: new Date().toISOString() });
  }
  const acknowledgedAt = new Date().toISOString();
  const report = metadata.reportId ? await ok(actors.crew.from('timelogs').select('status,note,updated_at').eq('id', metadata.reportId).single()) : null;
  const invoice = await ok(actors.crew.from('invoices').select('status').eq('id', metadata.invoiceId).single());
  const expected = { assign: 'draft', submit: 'pending_ch', return: 'rejected', correct: 'pending_ch', handoff: 'pending_coo', approve: 'approved' }[command];
  if (expected) assert.equal(report?.status, expected);
  if (command === 'invoice-paid') assert.equal(invoice.status, 'paid');
  evidence.push({ command, acknowledgedAt, run: metadata.run, report, invoice });
  appendFileSync(`${directory}/stage3-api-events.private.jsonl`, `${JSON.stringify(evidence[0])}\n`, { mode: 0o600 });
  console.log(JSON.stringify(evidence[0]));
} catch (error) {
  console.error(JSON.stringify({ phase, code: error?.code ?? error?.name, message: error?.detail ?? error?.message }));
  process.exitCode = 1;
} finally { for (const c of Object.values(actors)) await c.auth.signOut({ scope: 'local' }); }
