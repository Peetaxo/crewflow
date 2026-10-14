import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

assert.ok(process.argv[2], 'Pass isolated local demo credential directory');
const dir = resolve(process.argv[2]);
const credentials = JSON.parse(await readFile(`${dir}/local-credentials.json`, 'utf8'));
const fixtures = JSON.parse(await readFile(`${dir}/demo-accounts.json`, 'utf8'));
assert.equal(credentials.API_URL, 'http://127.0.0.1:55321');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(credentials.API_URL, credentials.SERVICE_ROLE_KEY, options);
const token = crypto.randomUUID();
const email = `billing-race-${token}@crewflow-demo.test`;
const password = `${crypto.randomUUID()}!aA1`;
const created = await service.auth.admin.createUser({ email, password, email_confirm: true,
  user_metadata: { first_name: 'DISPOSABLE billing concurrency', last_name: token } });
assert.equal(created.error, null);
const owner = created.data.user.id;
const [deviceA, deviceB] = await Promise.all([1, 2].map(async () => {
  const client = createClient(credentials.API_URL, credentials.ANON_KEY, options);
  assert.equal((await client.auth.signInWithPassword({ email, password })).error, null);
  return client;
}));
async function login(key) {
  const account = fixtures.accounts.find(row => row.key === key);
  assert.ok(account.email.endsWith('@crewflow-demo.test'));
  const client = createClient(credentials.API_URL, credentials.ANON_KEY, options);
  assert.equal((await client.auth.signInWithPassword({ email: account.email, password: account.password })).error, null);
  return client;
}
const [coo, ch] = await Promise.all(['coo', 'crewhead'].map(login));
const profile = await deviceA.rpc('current_profile_id');
assert.equal(profile.error, null);
assert.ok(profile.data);
const eventId = crypto.randomUUID(), timelogId = crypto.randomUUID(), lease = crypto.randomUUID();
async function query(sql) {
  // Fixed local destination. This helper cannot discover .env or a linked backend.
  const path = `/private/tmp/crewflow-billing-race-${token}.sql`;
  await writeFile(path, sql);
  const raw = execFileSync('supabase', ['db', 'query', '--local', '--workdir', '/Users/peetax/Projekty/.crewflow-demo-20261012', '--file', path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (raw.trim().startsWith('{')) return JSON.parse(raw).rows;
  return [];
}
await query(`DO $$ BEGIN
 update public.profiles set first_name='DISPOSABLE billing race',last_name='${token}',hourly_rate=250,ico='12345678',bank_account='123/0800',billing_street='Test street',billing_zip='10000',billing_city='Praha',billing_country='CZ' where id='${profile.data}' and user_id='${owner}';
 insert into public.user_roles(user_id,role) values('${owner}','crew') on conflict do nothing;
 insert into public.events(id,name,project_id,job_number,date_from,date_to,meal_allowance_enabled) values('${eventId}','DISPOSABLE billing race ${token}','${fixtures.projectId}','BILL-RACE','2026-10-10','2026-10-12',true);
 insert into public.timelogs(id,event_id,contractor_id,status,km) values('${timelogId}','${eventId}','${profile.data}','pending_coo',50);
 insert into public.timelog_days(timelog_id,date,time_from,time_to,day_type,meals) select '${timelogId}',date,'08:00','16:00','provoz',array['obed'] from generate_series('2026-10-10'::date,'2026-10-12'::date,interval '1 day')date;
 END $$;`);
const consent = await deviceA.rpc('set_self_billing_consent', { p_request_id: crypto.randomUUID(), p_enabled: true, p_expected_updated_at: null, p_non_vat_confirmed: true });
assert.equal(consent.error, null);
const quote = await coo.rpc('get_invoice_billing_quote', { p_timelog_ids: [timelogId] });
assert.equal(quote.error, null);
assert.equal(quote.data.preview.total_amount, 7030);
const timelog = await coo.from('timelogs').select('updated_at').eq('id', timelogId).single();
assert.equal(timelog.error, null);
const approved = await coo.rpc('resolve_timelog_approvals_atomic', { p_targets: [{ id: timelogId, expected_updated_at: timelog.data.updated_at, approval_id: null, approval_updated_at: null }], p_resolution: 'approved', p_note: '', p_billing_quote: quote.data.id });
assert.equal(approved.error, null);
// Another complete event report for the same owner exercises approval's
// event→report→profile locks while issuance/preparation and identity edits run.
const concurrentReport = crypto.randomUUID(), concurrentEvent = crypto.randomUUID();
await query(`DO $$ BEGIN
 insert into public.events(id,name,project_id,job_number,date_from,date_to,meal_allowance_enabled) values('${concurrentEvent}','DISPOSABLE concurrent approval ${token}','${fixtures.projectId}','BILL-RACE-APPROVAL','2026-10-10','2026-10-10',true);
 insert into public.timelogs(id,event_id,contractor_id,status,km) values('${concurrentReport}','${concurrentEvent}','${profile.data}','pending_coo',0);
 insert into public.timelog_days(timelog_id,date,time_from,time_to,day_type,meals) values('${concurrentReport}','2026-10-10','08:00','16:00','provoz',array['obed']);
 END $$;`);
const concurrentQuote = await coo.rpc('get_invoice_billing_quote', { p_timelog_ids: [concurrentReport] });
assert.equal(concurrentQuote.error, null);
assert.equal(concurrentQuote.data.preview.total_amount, 2250);
const concurrentVersion = await coo.from('timelogs').select('updated_at').eq('id', concurrentReport).single();
assert.equal(concurrentVersion.error, null);
const snapshot = await deviceA.rpc('get_invoice_billing_snapshot');
assert.equal(snapshot.error, null);
const statement = snapshot.data.statements.find(row => row.sources.some(source => source.timelog_id === timelogId));
assert.equal(statement.total_amount, 7030);
// Claim only this integration fixture's job as DBA. The real claim RPC is covered
// transactionally by pgTAP; this avoids leasing another ongoing demo's jobs.
await query(`DO $$ BEGIN update private.invoice_billing_jobs set status='running',attempts=attempts+1,lease_token='${lease}',locked_until=clock_timestamp()+interval '5 minutes' where statement_id='${statement.id}' and kind='issue'; END $$;`);
const jobId = (await query(`select id::text as id from private.invoice_billing_jobs where statement_id='${statement.id}' and kind='issue'`))[0].id;
const uploadRequest = crypto.randomUUID();
const uploadPath = `billing-statements/${statement.id}/documents/${uploadRequest}.pdf`;
// A real well-formed PDF (all content here is a synthetic test fixture).
const originalPath = '/Users/peetax/Projekty/.crewflow-demo-20261012/results/invoice-billing';
const { readdir } = await import('node:fs/promises');
const pdfName = (await readdir(originalPath)).find(name => name.endsWith('.pdf') && /correct|spravn|fixed/i.test(name));
assert.ok(pdfName, 'Corrected local disposable invoice PDF fixture is required');
const bytes = await readFile(`${originalPath}/${pdfName}`);
assert.ok(bytes.subarray(0, 5).equals(Buffer.from('%PDF-')));
assert.equal((await service.storage.from('invoice-pdfs').upload(uploadPath, bytes, { contentType: 'application/pdf', upsert: false })).error, null);
const sha = (await import('node:crypto')).createHash('sha256').update(bytes).digest('hex');
const bounded = request => request.abortSignal(AbortSignal.timeout(10000));
const confirmation = client => bounded(client.rpc('confirm_invoice_billing', { p_request_id: crypto.randomUUID(), p_statement_id: statement.id, p_expected_updated_at: statement.updated_at, p_non_vat_confirmed: true }));
const raceStarted = performance.now();
const outcomes = await Promise.all([
 confirmation(deviceA), confirmation(deviceB),
 bounded(service.rpc('register_invoice_billing_document', { p_request_id: uploadRequest, p_uploader_user_id: owner, p_statement_id: statement.id, p_expected_updated_at: statement.updated_at, p_storage_path: uploadPath, p_sha256: sha, p_byte_size: bytes.byteLength, p_invoice_number: `RACE-${token}`, p_issue_date: '2026-10-13', p_due_date: '2026-10-27', p_total_amount: 7030 })),
 bounded(service.rpc('process_invoice_billing_job', { p_job_id: jobId, p_lease_token: lease })),
 bounded(coo.rpc('prepare_invoice_billing_selection', { p_request_id: crypto.randomUUID(), p_timelog_ids: [timelogId] })),
 bounded(coo.rpc('resolve_timelog_approvals_atomic', { p_targets: [{ id: concurrentReport, expected_updated_at: concurrentVersion.data.updated_at, approval_id: null, approval_updated_at: null }], p_resolution: 'approved', p_note: '', p_billing_quote: concurrentQuote.data.id })),
 bounded(coo.from('profiles').update({ bank_account: '456/0800' }).eq('id', profile.data).select('bank_account').single()),
]);
const raceElapsedMs = Math.round(performance.now() - raceStarted);
assert.ok(raceElapsedMs < 10000, 'Conflict requests must return within ten seconds, without PostgREST retries');
assert.ok(outcomes.some(row => row.error?.code === 'PT409' && row.status === 409), 'A losing race returns HTTP409/PT409');
for (const outcome of outcomes) {
 if (outcome.error) assert.ok(['PT409', '22023'].includes(outcome.error.code), `Unexpected race error: ${JSON.stringify({ code: outcome.error.code, message: outcome.error.message })}`);
}
let current = (await deviceA.rpc('get_invoice_billing_snapshot')).data.statements.find(row => row.id === statement.id);
if (current.status === 'document_pending') {
 const accepted = await ch.rpc('review_invoice_billing_document', { p_request_id: crypto.randomUUID(), p_statement_id: current.id, p_document_id: current.active_document_id, p_expected_updated_at: current.updated_at, p_decision: 'accept', p_note: '' });
 if (accepted.error) {
  assert.equal(accepted.error.code, 'PT409');
  const returned = await ch.rpc('review_invoice_billing_document', { p_request_id: crypto.randomUUID(), p_statement_id: current.id, p_document_id: current.active_document_id, p_expected_updated_at: current.updated_at, p_decision: 'return', p_note: 'DISPOSABLE race: supplier identity changed; refresh preview' });
  assert.equal(returned.error, null);
  current = returned.data.statement;
 } else current = accepted.data.statement;
}
if (current.status !== 'issued') {
 const refreshed = await deviceA.rpc('refresh_invoice_billing_preview', { p_request_id: crypto.randomUUID(), p_statement_id: current.id, p_expected_updated_at: current.updated_at });
 assert.equal(refreshed.error, null);
 assert.equal(refreshed.data.statement.total_amount, 7030, 'Identity race recovery preserves frozen money');
 const confirmed = await deviceA.rpc('confirm_invoice_billing', { p_request_id: crypto.randomUUID(), p_statement_id: current.id, p_expected_updated_at: refreshed.data.statement.updated_at, p_non_vat_confirmed: true });
 assert.equal(confirmed.error, null);
 current = confirmed.data.statement;
}
assert.equal(current.status, 'issued');
const invoices = await coo.from('invoices').select('id,total_amount,invoice_number,billing_kind').eq('billing_statement_id', statement.id);
assert.equal(invoices.error, null);
assert.equal(invoices.data.length, 1, 'Two devices, worker, upload and manual preparation allocate one source invoice');
assert.equal(invoices.data[0].total_amount, 7030);
const links = await coo.from('invoice_timelogs').select('invoice_id').eq('timelog_id', timelogId);
assert.equal(links.error, null);
assert.equal(links.data.length, 1);
const source = await coo.from('timelogs').select('status').eq('id', timelogId).single();
assert.equal(source.error, null);
assert.equal(source.data.status, 'invoiced');
const approvalSource = await coo.from('timelogs').select('status').eq('id', concurrentReport).single();
assert.equal(approvalSource.error, null);
assert.ok(['approved', 'pending_coo'].includes(approvalSource.data.status), 'Concurrent approval either uses its verified amount or rejects stale identity');
const beforePaid = await coo.from('invoices').select('status,updated_at').eq('id', invoices.data[0].id).single();
assert.equal(beforePaid.error, null);
assert.equal(beforePaid.data.status, 'sent', 'New invoice is payable without an email-send transition');
const paidAt = new Date().toISOString();
const pay = () => bounded(coo.rpc('mark_invoice_paid_atomic', { p_invoice_id: invoices.data[0].id, p_expected_status: beforePaid.data.status, p_expected_updated_at: beforePaid.data.updated_at, p_paid_at: paidAt }));
const paymentStarted = performance.now();
const paymentOutcomes = await Promise.all([pay(), pay()]);
const paymentElapsedMs = Math.round(performance.now() - paymentStarted);
assert.ok(paymentElapsedMs < 10000, 'Stale payment boundary returns without PostgREST retry loop');
assert.equal(paymentOutcomes.filter(row => !row.error).length, 1);
assert.ok(paymentOutcomes.some(row => row.status === 409 && row.error?.code === 'PT409' && row.error.message === 'invoice_paid_conflict'));
const paymentAudit = await coo.from('invoices').select('status,updated_at,paid_at,paid_by_user_id,paid_by_profile_id,payment_recorded_at').eq('id', invoices.data[0].id).single();
assert.equal(paymentAudit.error, null);
assert.equal(paymentAudit.data.status, 'paid');
const cooAccount = fixtures.accounts.find(row => row.key === 'coo');
assert.equal(paymentAudit.data.paid_by_user_id, cooAccount.userId);
assert.equal(paymentAudit.data.paid_by_profile_id, cooAccount.profileId);
assert.ok(paymentAudit.data.payment_recorded_at);
const replay = await bounded(coo.rpc('mark_invoice_paid_atomic', { p_invoice_id: invoices.data[0].id, p_expected_status: 'paid', p_expected_updated_at: paymentAudit.data.updated_at, p_paid_at: paymentAudit.data.paid_at }));
assert.equal(replay.error, null);
const afterReplay = await coo.from('invoices').select('status,updated_at,paid_at,paid_by_user_id,paid_by_profile_id,payment_recorded_at').eq('id', invoices.data[0].id).single();
assert.deepEqual(afterReplay.data, paymentAudit.data, 'Payment replay preserves first actor and server marking time');
const historical = await coo.from('invoices').select('total_amount,status').eq('invoice_number', 'SF-2026-CREW-D-0001').single();
assert.equal(historical.error, null);
assert.deepEqual(historical.data, { total_amount: 2056, status: 'paid' });
const result = { result: 'passed', raceElapsedMs, paymentElapsedMs, losingRaceHttpStatus: 409, losingRaceCode: 'PT409', simultaneousOperations: ['owner device A', 'owner device B', 'verified upload', 'service issue worker', 'COO preparation', 'another report approval', 'supplier identity edit'], invoiceCount: 1, sourceLinkCount: 1, totalCZK: 7030, fixtureStatementId: statement.id, invoiceKind: invoices.data[0].billing_kind, paymentReplayAuditIntact: true, protectedHistoricalPaidInvoiceIntact: true };
await writeFile(`${dir}/invoice-billing-concurrency.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
