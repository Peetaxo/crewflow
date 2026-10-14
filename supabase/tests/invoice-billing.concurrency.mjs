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
 insert into public.timelogs(id,event_id,contractor_id,status,km) values('${concurrentReport}','${concurrentEvent}','${profile.data}','pending_coo',null);
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
if (approvalSource.data.status === 'pending_coo') {
 const refreshedQuote = await coo.rpc('get_invoice_billing_quote', { p_timelog_ids: [concurrentReport] });
 assert.equal(refreshedQuote.error, null);
 const version = await coo.from('timelogs').select('updated_at').eq('id', concurrentReport).single();
 const approved = await bounded(coo.rpc('resolve_timelog_approvals_atomic', { p_targets: [{ id: concurrentReport, expected_updated_at: version.data.updated_at, approval_id: null, approval_updated_at: null }], p_resolution: 'approved', p_note: '', p_billing_quote: refreshedQuote.data.id }));
 assert.equal(approved.error, null);
}
let invalid = (await deviceA.rpc('get_invoice_billing_snapshot')).data.statements.find(row => row.sources.some(source => source.timelog_id === concurrentReport));
assert.equal(invalid.blocked_reason, 'financial_data_incomplete');
assert.equal(invalid.financial_verified, false);
assert.equal(invalid.financial_snapshot.reports[0].km, null, 'Real quoted NULL remains invalid');
const sourceBeforeRepair = await coo.from('timelogs').select('*').eq('id', concurrentReport).single();
assert.equal(sourceBeforeRepair.error, null);
const repairArgs = { p_request_id: crypto.randomUUID(), p_statement_id: invalid.id, p_contractor_id: profile.data, p_expected_updated_at: invalid.updated_at,
 p_sources: [{ timelog_id: concurrentReport, expected_updated_at: sourceBeforeRepair.data.updated_at, km: 5 }] };
const foreign = await login('other');
const anonymous = createClient(credentials.API_URL, credentials.ANON_KEY, options);
for (const client of [deviceA, ch, foreign, anonymous]) assert.equal((await bounded(client.rpc('repair_invoice_billing_distance', repairArgs))).error?.code, '42501');
assert.equal((await coo.from('timelogs').update({ km: 5 }).eq('id', concurrentReport)).error?.code, '42501');
assert.equal((await bounded(coo.rpc('repair_invoice_billing_distance', { ...repairArgs, p_sources: [{ ...repairArgs.p_sources[0], expected_updated_at: '2000-01-01T00:00:00Z' }] }))).error?.code, 'PT409');
assert.equal((await coo.from('profiles').update({ hourly_rate: 999 }).eq('id', profile.data)).error, null);
const repairStarted = performance.now();
const repaired = await bounded(coo.rpc('repair_invoice_billing_distance', repairArgs));
const repairElapsedMs = Math.round(performance.now() - repairStarted);
assert.equal(repaired.error, null);
assert.equal(repaired.data.statement.total_amount, 2278, 'Repair preserves quoted rate250 despite current rate999');
assert.deepEqual((await bounded(coo.rpc('repair_invoice_billing_distance', repairArgs))).data, repaired.data, 'Repair request replay is exact');
const sourceAfterRepair = await coo.from('timelogs').select('*').eq('id', concurrentReport).single();
const stripRepairFields = row => Object.fromEntries(Object.entries(row).filter(([key]) => !['km', 'updated_at'].includes(key)));
assert.deepEqual(stripRepairFields(sourceAfterRepair.data), stripRepairFields(sourceBeforeRepair.data));
invalid = repaired.data.statement;
const repairPreview = await deviceA.rpc('refresh_invoice_billing_preview', { p_request_id: crypto.randomUUID(), p_statement_id: invalid.id, p_expected_updated_at: invalid.updated_at });
assert.equal(repairPreview.error, null);
const repairIssued = await deviceA.rpc('confirm_invoice_billing', { p_request_id: crypto.randomUUID(), p_statement_id: invalid.id, p_expected_updated_at: repairPreview.data.statement.updated_at, p_non_vat_confirmed: true });
assert.equal(repairIssued.error, null);
assert.equal(repairIssued.data.statement.total_amount, 2278);
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
// Simulate only this disposable PDF job's seventh failed attempt. Setting its
// priority earlier than demo jobs lets the real service claim RPC select it
// without leasing any other demo's work.
const freshPdfSnapshot = await deviceA.rpc('get_invoice_billing_snapshot');
const freshPdfJob = freshPdfSnapshot.data.jobs.find(row => row.statement_id === invalid.id && row.kind === 'pdf');
const freshPdfStatement = freshPdfSnapshot.data.statements.find(row => row.id === invalid.id);
assert.equal(freshPdfJob.can_retry, false, 'Fresh queued work cannot be retried');
assert.equal((await bounded(deviceA.rpc('retry_invoice_billing_job', { p_request_id: crypto.randomUUID(), p_statement_id: invalid.id, p_job_id: freshPdfJob.id, p_expected_updated_at: freshPdfStatement.updated_at, p_expected_job_updated_at: freshPdfJob.updated_at }))).error?.code, '22023');
await query(`DO $$ BEGIN update private.invoice_billing_jobs set available_at='1900-01-01' where id='${freshPdfJob.id}'; END $$;`);
const firstPdfClaim = await service.rpc('claim_invoice_billing_jobs', { p_limit: 1 });
assert.equal(firstPdfClaim.error, null);
const firstPdf = firstPdfClaim.data.jobs[0];
assert.equal(firstPdf.id, freshPdfJob.id);
const runningSnapshot = await deviceA.rpc('get_invoice_billing_snapshot');
assert.equal(runningSnapshot.data.jobs.find(row => row.id === firstPdf.id).can_retry, false, 'Running work cannot be retried');
assert.equal((await bounded(deviceA.rpc('retry_invoice_billing_job', { p_request_id: crypto.randomUUID(), p_statement_id: invalid.id, p_job_id: firstPdf.id, p_expected_updated_at: freshPdfStatement.updated_at, p_expected_job_updated_at: firstPdf.updated_at }))).error?.code, 'PT409');
assert.equal((await service.rpc('complete_invoice_billing_job', { p_job_id: firstPdf.id, p_lease_token: firstPdf.lease_token, p_error: 'DISPOSABLE transient failure' })).data.status, 'queued');
const queuedSnapshot = await deviceA.rpc('get_invoice_billing_snapshot');
const queuedJob = queuedSnapshot.data.jobs.find(row => row.id === firstPdf.id);
const queuedStatement = queuedSnapshot.data.statements.find(row => row.id === invalid.id);
assert.equal(queuedJob.can_retry, true);
const wakeArgs = { p_request_id: crypto.randomUUID(), p_statement_id: invalid.id, p_job_id: firstPdf.id, p_expected_updated_at: queuedStatement.updated_at, p_expected_job_updated_at: queuedJob.updated_at };
const wake = await bounded(deviceA.rpc('retry_invoice_billing_job', wakeArgs));
assert.equal(wake.error, null);
assert.equal(wake.data.job.attempts, 1);
assert.equal(wake.data.job.retry_generation, 0);
assert.equal(wake.data.job.failure_code, null);
assert.equal(wake.data.job.can_retry, false);
assert.deepEqual((await bounded(deviceA.rpc('retry_invoice_billing_job', wakeArgs))).data, wake.data, 'Queued wake replay preserves budget and exact result');
await query(`DO $$ BEGIN update private.invoice_billing_jobs set attempts=7,available_at='1900-01-01' where statement_id='${invalid.id}' and kind='pdf'; END $$;`);
const eighth = await service.rpc('claim_invoice_billing_jobs', { p_limit: 1 });
assert.equal(eighth.error, null);
const pdfJob = eighth.data.jobs[0];
assert.equal(pdfJob.statement_id, invalid.id);
assert.equal(pdfJob.attempts, 8);
const privateError = 'DISPOSABLE worker internal detail';
const exhausted = await service.rpc('complete_invoice_billing_job', { p_job_id: pdfJob.id, p_lease_token: pdfJob.lease_token, p_error: privateError });
assert.equal(exhausted.error, null);
assert.equal(exhausted.data.status, 'failed');
assert.deepEqual((await service.rpc('complete_invoice_billing_job', { p_job_id: pdfJob.id, p_lease_token: pdfJob.lease_token, p_error: privateError })).data, exhausted.data, 'Terminal service failure replay is exact');
const failedSnapshot = await deviceA.rpc('get_invoice_billing_snapshot');
assert.equal(failedSnapshot.error, null);
assert.ok(!JSON.stringify(failedSnapshot.data).includes(privateError));
assert.ok(!JSON.stringify(failedSnapshot.data).includes('lease_token'));
const failedJob = failedSnapshot.data.jobs.find(row => row.id === pdfJob.id);
const failedStatement = failedSnapshot.data.statements.find(row => row.id === invalid.id);
assert.equal(failedJob.can_retry, true);
assert.equal(failedJob.max_attempts, 8);
const retryArgs = { p_request_id: crypto.randomUUID(), p_statement_id: invalid.id, p_job_id: pdfJob.id, p_expected_updated_at: failedStatement.updated_at, p_expected_job_updated_at: failedJob.updated_at };
for (const client of [ch, foreign, anonymous]) assert.equal((await bounded(client.rpc('retry_invoice_billing_job', retryArgs))).error?.code, '42501');
const chJobs = await ch.rpc('get_invoice_billing_snapshot');
assert.equal(chJobs.data.jobs.find(row => row.id === pdfJob.id).can_retry, false);
const retryStarted = performance.now();
const retryOutcomes = await Promise.all([bounded(deviceA.rpc('retry_invoice_billing_job', retryArgs)), bounded(deviceB.rpc('retry_invoice_billing_job', { ...retryArgs, p_request_id: crypto.randomUUID() }))]);
const recoveryElapsedMs = Math.round(performance.now() - retryStarted);
assert.equal(retryOutcomes.filter(row => !row.error).length, 1);
assert.ok(retryOutcomes.some(row => row.status === 409 && row.error?.code === 'PT409'));
const winningRetry = retryOutcomes.find(row => !row.error);
assert.equal(winningRetry.data.job.retry_generation, 1);
assert.equal(winningRetry.data.job.attempts, 0);
assert.equal(winningRetry.data.job.invoice_id, repairIssued.data.statement.invoice_id);
await query(`DO $$ BEGIN update private.invoice_billing_jobs set available_at='1900-01-01' where id='${pdfJob.id}' and statement_id='${invalid.id}'; END $$;`);
const resumed = await service.rpc('claim_invoice_billing_jobs', { p_limit: 1 });
assert.equal(resumed.error, null);
const resumedJob = resumed.data.jobs[0];
assert.equal(resumedJob.id, pdfJob.id);
const render = await service.rpc('process_invoice_billing_job', { p_job_id: resumedJob.id, p_lease_token: resumedJob.lease_token });
assert.equal(render.error, null);
assert.equal(render.data.invoice.id, repairIssued.data.statement.invoice_id);
assert.equal(render.data.invoice.total_amount, 2278);
assert.equal((await service.storage.from('invoice-pdfs').upload(render.data.pdf_path, bytes, { contentType: 'application/pdf', upsert: false })).error, null);
const delivered = await service.rpc('complete_invoice_billing_job', { p_job_id: resumedJob.id, p_lease_token: resumedJob.lease_token, p_pdf_path: render.data.pdf_path });
assert.equal(delivered.error, null);
assert.equal(delivered.data.status, 'completed');
assert.deepEqual((await service.rpc('complete_invoice_billing_job', { p_job_id: resumedJob.id, p_lease_token: resumedJob.lease_token, p_pdf_path: render.data.pdf_path })).data, delivered.data);
const deliveredSnapshot = await deviceA.rpc('get_invoice_billing_snapshot');
assert.equal(deliveredSnapshot.data.jobs.find(row => row.id === pdfJob.id).status, 'completed');
assert.equal(deliveredSnapshot.data.jobs.find(row => row.id === pdfJob.id).can_retry, false);
const repairedInvoices = await coo.from('invoices').select('id,invoice_number,total_amount,pdf_path').eq('billing_statement_id', invalid.id);
assert.equal(repairedInvoices.data.length, 1);
assert.equal(repairedInvoices.data[0].id, repairIssued.data.statement.invoice_id);
assert.equal(repairedInvoices.data[0].pdf_path, render.data.pdf_path);
const historical = await coo.from('invoices').select('total_amount,status').eq('invoice_number', 'SF-2026-CREW-D-0001').single();
assert.equal(historical.error, null);
assert.deepEqual(historical.data, { total_amount: 2056, status: 'paid' });
const result = { result: 'passed', raceElapsedMs, paymentElapsedMs, repairElapsedMs, recoveryElapsedMs, losingRaceHttpStatus: 409, losingRaceCode: 'PT409', simultaneousOperations: ['owner device A', 'owner device B', 'verified upload', 'service issue worker', 'COO preparation', 'another report approval', 'supplier identity edit'], invoiceCount: 1, sourceLinkCount: 1, totalCZK: 7030, fixtureStatementId: statement.id, invoiceKind: invoices.data[0].billing_kind, repairedInvoiceTotalCZK: 2278, actualSdkDistanceRepair: true, queuedTransientWakePreservesBudget: true, boundedPdfRetryRecoverySameInvoice: true, sanitizedTerminalAndCompletedJobState: true, paymentReplayAuditIntact: true, protectedHistoricalPaidInvoiceIntact: true };
await writeFile(`${dir}/invoice-billing-concurrency.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
