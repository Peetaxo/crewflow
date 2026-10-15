import assert from "node:assert/strict";
import { chmod, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  delayJobTimers,
  restoreJobTimers,
  snapshotJobTimers,
  localQuery,
} from "./invoice-job-test-state.mjs";
import {
  createInvoiceTestLifecycle,
  InvoiceTestInterrupted,
} from "./invoice-worker-test-lifecycle.mjs";
import { createInvoiceCronTracker } from "./invoice-cron-test-tracker.mjs";
process.umask(0o077);
assert.ok(
  process.argv[2] && process.argv[3],
  "Pass private local demo directory and private worker env file",
);
const dir = resolve(process.argv[2]);
const workerEnv = resolve(process.argv[3]);
const credentials = JSON.parse(
  await readFile(`${dir}/local-credentials.json`, "utf8"),
);
const fixtures = JSON.parse(
  await readFile(`${dir}/demo-accounts.json`, "utf8"),
);
assert.equal(credentials.API_URL, "http://127.0.0.1:55321");
const workerSecret = (await readFile(workerEnv, "utf8")).match(
  /^INVOICE_PDF_WORKER_SECRET=(.+)$/m,
)?.[1];
assert.ok(workerSecret);
const run = randomUUID();
const output = `/private/tmp/crewflow-invoice-workflow-20261015-dispatch/run-${run}`;
await import("node:fs/promises").then((fs) =>
  fs.mkdir(output, { recursive: true })
);
async function rawQuery(sql, privateFile = false) {
  const file = `${output}/query.sql`;
  await writeFile(file, sql, { mode: 0o600 });
  await chmod(file, 0o600);
  const rows = await localQuery(sql, file);
  if (privateFile) {
    await writeFile(file, "-- private setup redacted after execution\n", {
      mode: 0o600,
    });
  }
  return rows;
}
let beforeJobTimers = null;
let bucketRestore = null;
let cronTracker = null;
let protectedBefore = null;
let originalGuards = null;
const guardsSql = "select n.nspname schema,c.relname table_name,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname in('public','private') order by n.nspname,c.relname,t.tgname";
const protectedSql = await readFile(new URL("./invoice-protected-state.sql", import.meta.url), "utf8");
const protectedRows = async () => Object.values((await rawQuery(protectedSql))[0])[0];
const canonical = (value) => JSON.stringify(value, (_key, item) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
    : item);
async function verifyProtectedRows() {
  const after = await protectedRows();
  const tables = [];
  for (const [table, rows] of Object.entries(protectedBefore)) {
    const current = new Map();
    for (const row of after[table]) {
      const key = canonical(row);
      current.set(key, (current.get(key) ?? 0) + 1);
    }
    for (const row of rows) {
      const key = canonical(row);
      assert.ok(current.get(key) > 0, `Original row changed or missing in ${table}`);
      current.set(key, current.get(key) - 1);
    }
    tables.push({ table, original: rows.length, preserved: rows.length, added: after[table].length - rows.length });
  }
  await writeFile(`${output}/protected-after.private.json`, JSON.stringify(after));
  const summary = { tables, tableCount: tables.length, original: tables.reduce((n, t) => n + t.original, 0), preserved: tables.reduce((n, t) => n + t.preserved, 0) };
  await writeFile(`${output}/preservation.json`, JSON.stringify(summary, null, 2));
  return summary;
}
async function verifyServedSources() {
  const source = resolve(new URL("..", import.meta.url).pathname);
  const served = "/Users/peetax/Projekty/.crewflow-demo-20261012/supabase";
  const rows = [];
  async function walk(path) {
    for (const name of await readdir(path)) {
      const file = join(path, name);
      if ((await stat(file)).isDirectory()) await walk(file);
      else if (/\.(ts|ttf|otf|png)$/.test(name)) {
        const a = await readFile(file), b = await readFile(join(served, relative(source, file)));
        rows.push({ path: relative(source, file), same: a.equals(b), sha256: createHash("sha256").update(a).digest("hex") });
      }
    }
  }
  for (const name of ["generate-invoice-pdf", "upload-invoice-document", "process-invoice-pdfs"]) await walk(join(source, "functions", name));
  const configs = await Promise.all([source, served].map(async (path) => {
    const text = await readFile(join(path, "config.toml"), "utf8");
    return Object.fromEntries(["generate-invoice-pdf", "upload-invoice-document", "process-invoice-pdfs"].map((name) => [name, text.match(new RegExp(`\\[functions\\.${name}\\]([\\s\\S]*?)(?=\\n\\[|$)`))?.[1].trim()]));
  }));
  assert.ok(rows.every((row) => row.same), "Served runtime source must match reviewed source");
  assert.deepEqual(configs[0], configs[1]);
  await writeFile(`${output}/edge-source-preflight.json`, JSON.stringify({ rows, configSame: true, configs }, null, 2));
}
const rawFetch = globalThis.fetch.bind(globalThis);
let cleanupService;
const lifecycle = createInvoiceTestLifecycle({
  fetch: rawFetch,
  stopSchedule: async () => {
    if (cronTracker) await cronTracker.stop();
  },
  drainCron: async () =>
    cronTracker
      ? await cronTracker.drain()
      : { fenced: true, activeCronCommands: 0, requests: [] },
  record: async (evidence) => {
    const body = { ...evidence, snapshotFile: beforeJobTimers };
    await writeFile(
      `${output}/${
        evidence.stage === "drained"
          ? "worker-drain.private.json"
          : evidence.stage === "blocked"
          ? "cleanup-blocked.private.json"
          : evidence.stage === "stopped"
          ? "worker-stop.private.json"
          : "cleanup.json"
      }`,
      JSON.stringify(body, null, 2),
      { mode: 0o600 },
    );
    process.send?.({ stage: evidence.stage });
  },
  restore: async (proof) => {
    if (bucketRestore) {
      assert.equal(
        (await cleanupService.storage.updateBucket("invoice-pdfs", {
          public: bucketRestore.public,
          allowedMimeTypes: bucketRestore.allowed_mime_types,
        })).error,
        null,
      );
      bucketRestore = null;
    }
    await cronTracker.drop();
    const restored = await restoreJobTimers(beforeJobTimers, {
      ...proof,
      snapshotFile: beforeJobTimers,
    });
    const preservation = await verifyProtectedRows();
    assert.deepEqual(await rawQuery(guardsSql), originalGuards, "Every original lifecycle trigger and enabled state must remain exact");
    const finalState = (await rawQuery(`select (select enabled from private.invoice_worker_dispatch_control where id=1) dispatch_enabled,
 (select count(*) from cron.job where jobname='crewflow-invoice-pdfs')::integer cron_jobs,
 (select count(*) from net.http_request_queue)::integer http_queued,
 (select count(*) from pg_stat_activity where pid<>pg_backend_pid() and query ilike '%claim_invoice_billing_jobs%' and state='active')::integer active_claims,
 (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname like 'invoice_pdf_test_%')::integer test_tables,
 (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'invoice_pdf_test_%')::integer test_functions,
 (select count(*) from pg_trigger where not tgisinternal and tgname like 'invoice_pdf_test_%')::integer test_recorders,
 (select count(*) from pg_trigger where not tgisinternal and tgname in('invoice_billing_jobs_dispatch','invoice_lifecycle_guard','timelog_lifecycle_guard','invoice_billing_version_guard','invoice_billing_sources_guard') and tgenabled='D')::integer disabled_guards`))[0];
    assert.deepEqual(finalState, { dispatch_enabled: false, cron_jobs: 0, http_queued: 0, active_claims: 0, test_tables: 0, test_functions: 0, test_recorders: 0, disabled_guards: 0 });
    await writeFile(`${output}/final-state.json`, JSON.stringify({ ...finalState, preservation }, null, 2));
    return restored;
  },
});
const fetch = lifecycle.fetch.bind(lifecycle);
async function query(sql, privateFile = false) {
  lifecycle.check();
  const result = await rawQuery(sql, privateFile);
  lifecycle.check();
  return result;
}
const options = {
  global: { fetch },
  auth: { persistSession: false, autoRefreshToken: false },
};
const service = createClient(
  credentials.API_URL,
  credentials.SERVICE_ROLE_KEY,
  options,
);
const anon = createClient(credentials.API_URL, credentials.ANON_KEY, options);
cleanupService = createClient(
  credentials.API_URL,
  credentials.SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: rawFetch },
  },
);
const rpc = async (client, name, args) => {
  const r = await client.rpc(name, args);
  assert.equal(r.error, null, `${name}: ${r.error?.message}`);
  return r.data;
};
async function login(account) {
  assert.ok(account.email.endsWith("@crewflow-demo.test"));
  const client = createClient(
    credentials.API_URL,
    credentials.ANON_KEY,
    options,
  );
  const { data, error } = await client.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });
  assert.equal(error, null);
  return { client, token: data.session.access_token };
}
const firstBytes = await readFile(
  `/Users/peetax/Projekty/.crewflow-demo-20261012/results/invoice-billing/own-invoice-returned.pdf`,
);
const replacementBytes = await readFile(
  `/Users/peetax/Projekty/.crewflow-demo-20261012/results/invoice-billing/own-invoice-corrected.pdf`,
);
for (const bytes of [firstBytes, replacementBytes]) {
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  assert.ok(bytes.length <= 5 * 1024 * 1024);
}
for (
  const functionName of ["generate-invoice-pdf", "upload-invoice-document"]
) {
  const response = await fetch(
    `${credentials.API_URL}/functions/v1/${functionName}`,
    { method: "OPTIONS" },
  );
  assert.equal(response.status, 200);
}
assert.equal(
  (await fetch(`${credentials.API_URL}/functions/v1/process-invoice-pdfs`, {
    method: "POST",
  })).status,
  401,
);
const existingSchedule = await query(
  "select count(*)::integer count from cron.job where jobname='crewflow-invoice-pdfs'",
);
assert.equal(
  existingSchedule[0].count,
  0,
  "Stop any existing local schedule before isolated worker tests",
);
await verifyServedSources();
const initialState = (await query(`select enabled,(select count(*) from net.http_request_queue)::integer queued,
 (select count(*) from pg_stat_activity where pid<>pg_backend_pid() and query ilike '%claim_invoice_billing_jobs%' and state='active')::integer active_claims
 from private.invoice_worker_dispatch_control where id=1`))[0];
assert.deepEqual(initialState, { enabled: false, queued: 0, active_claims: 0 });
const localConfig = (await query(`select
 (select decrypted_secret='http://supabase_kong_crewflow-demo-20261012:8000/functions/v1/process-invoice-pdfs' from vault.decrypted_secrets where name='invoice_pdf_worker_url') local_url,
 (select decrypted_secret='${workerSecret.replaceAll("'", "''")}' from vault.decrypted_secrets where name='invoice_pdf_worker_secret') matching_secret`, true))[0];
assert.deepEqual(localConfig, { local_url: true, matching_secret: true }, "Vault must target only this exact localhost stack and existing local worker secret");
await writeFile(`${output}/local-config-preflight.json`, JSON.stringify(localConfig));
protectedBefore = await protectedRows();
await writeFile(`${output}/protected-before.private.json`, JSON.stringify(protectedBefore));
originalGuards = await query(guardsSql);
await writeFile(`${output}/lifecycle-guards-before.json`, JSON.stringify(originalGuards));
const created = await service.auth.admin.createUser({
  email: `document-${run}@crewflow-demo.test`,
  password: `${run}!aA1`,
  email_confirm: true,
  user_metadata: { first_name: "DISPOSABLE PDF", last_name: run },
});
assert.equal(created.error, null);
const userId = created.data.user.id;
const owner = await login({
  email: created.data.user.email,
  password: `${run}!aA1`,
});
const [ch, coo, other] = await Promise.all(
  ["crewhead", "coo", "other"].map((key) =>
    login(fixtures.accounts.find((a) => a.key === key))
  ),
);
const profile = await rpc(owner.client, "current_profile_id");
beforeJobTimers = await snapshotJobTimers(output);
cronTracker = createInvoiceCronTracker({
  query: rawQuery,
  run,
  record: async (manifest) =>
    writeFile(
      `${output}/cron-manifest.private.json`,
      JSON.stringify({ ...manifest, snapshotFile: beforeJobTimers }),
      { mode: 0o600 },
    ),
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => lifecycle.stop(signal));
}
try {
  await cronTracker.initialize();
  await delayJobTimers(beforeJobTimers);
  await query(
    `DO $$ BEGIN update public.profiles set hourly_rate=250,ico='12345678',bank_account='123/0800',billing_street='Testovací ulice 1',billing_zip='10000',billing_city='Praha',billing_country='CZ' where id='${profile}' and user_id='${userId}'; insert into public.user_roles(user_id,role) values('${userId}','crew') on conflict do nothing; END $$;`,
  );
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  let reportPilot = null;
  // Exercise the actual single-event round RPCs with only this run's new owner.
  // Worker, timer, Cron and cleanup ownership remain with the existing lifecycle.
  async function completeReportPilot(event, report) {
    async function payload() {
      const row = await owner.client.from("timelogs").select("*").eq("id", report).single();
      const days = await owner.client.from("timelog_days").select("*").eq("timelog_id", report).order("date");
      assert.equal(row.error, null);
      assert.equal(days.error, null);
      assert.equal(days.data.length, 3);
      return [{ id: report, event_id: event, expected_updated_at: row.data.updated_at,
        expected_status: row.data.status, km: row.data.km, note: row.data.note ?? "",
        days: days.data.map(({ id, date, time_from, time_to, day_type, note, meal, meals }) =>
          ({ id, date, time_from, time_to, day_type, note, meal, meals })) }];
    }
    const write = (name, roundId, timelogs) => rpc(owner.client, name, {
      p_request_id: randomUUID(), p_round_id: roundId, p_workflow_id: null,
      p_contractor_id: profile, p_anchor_event_id: event, p_timelogs: timelogs,
    });
    const transition = (session, receipt, action, note = "", quoteId = null) =>
      rpc(session.client, "transition_shift_workflow_round_atomic", {
        p_request_id: randomUUID(), p_round_id: receipt.round.id,
        p_expected_round_updated_at: receipt.round.updated_at,
        p_targets: receipt.timelogs.map((t) => ({ id: t.id, expected_updated_at: t.updated_at, expected_status: t.status })),
        p_action: action, p_note: note, p_affected_event_id: action === "return" ? event : null,
        p_corrections: null, ...(quoteId ? { p_billing_quote: quoteId } : {}),
      });
    const incomplete = await payload();
    incomplete[0].days[0].time_from = "";
    incomplete[0].days[0].time_to = "";
    const draft = await write("save_shift_workflow_drafts_atomic", null, incomplete);
    assert.equal(draft.round, null);
    assert.equal(draft.timelogs[0].status, "draft");
    const initial = await payload();
    initial[0].days[0].time_from = "08:00";
    initial[0].days[0].time_to = "15:00";
    const submitted = await write("submit_shift_workflow_round_atomic", randomUUID(), initial);
    assert.equal(submitted.round.status, "pending_ch");
    const returnNote = "DISPOSABLE pilot: doplnit chybějící hodinu prvního dne";
    const returned = await transition(ch, submitted, "return", returnNote);
    assert.equal(returned.round.status, "rejected");
    assert.equal(returned.round.note, returnNote);
    const corrected = await payload();
    corrected[0].days[0].time_to = "16:00";
    corrected[0].note = "DISPOSABLE pilot: opraven celý třídenní výkaz";
    const resubmitted = await write("submit_shift_workflow_round_atomic", randomUUID(), corrected);
    assert.equal(resubmitted.round.status, "pending_ch");
    assert.notEqual(resubmitted.round.id, submitted.round.id);
    const handedOff = await transition(ch, resubmitted, "handoff");
    assert.equal(handedOff.round.status, "pending_coo");
    const quote = await rpc(coo.client, "get_invoice_billing_quote", { p_timelog_ids: [report] });
    assert.equal(quote.preview.reports.length, 1);
    assert.equal(quote.preview.reports[0].days.length, 3);
    assert.equal(quote.preview.total_amount, 7030);
    const approved = await transition(coo, handedOff, "approve", "", quote.id);
    assert.equal(approved.round.status, "approved");
    const history = await owner.client.from("shift_workflow_rounds").select("id,status,note").in("id", [submitted.round.id, resubmitted.round.id]);
    assert.equal(history.error, null);
    assert.equal(history.data.find((r) => r.id === submitted.round.id).status, "rejected");
    reportPilot = { eventId: event, reportId: report, days: 3, returnNote,
      returnedRoundId: submitted.round.id, approvedRoundId: approved.round.id,
      quoteId: quote.id, totalAmount: quote.preview.total_amount };
  }
  async function markPaid(invoiceId) {
    const before = await coo.client.from("invoices").select("*").eq("id", invoiceId).single();
    assert.equal(before.error, null);
    assert.equal(before.data.status, "sent");
    const paidAt = new Date().toISOString();
    await rpc(coo.client, "mark_invoice_paid_atomic", { p_invoice_id: invoiceId,
      p_expected_status: before.data.status, p_expected_updated_at: before.data.updated_at, p_paid_at: paidAt });
    const after = await coo.client.from("invoices").select("*").eq("id", invoiceId).single();
    assert.equal(after.error, null);
    for (const key of ["id", "invoice_number", "total_amount", "pdf_path", "supplier_snapshot", "customer_snapshot"]) {
      assert.deepEqual(after.data[key], before.data[key]);
    }
    const actor = fixtures.accounts.find((a) => a.key === "coo");
    assert.equal(after.data.status, "paid");
    assert.equal(after.data.paid_by_user_id, actor.userId);
    assert.equal(after.data.paid_by_profile_id, actor.profileId);
    assert.equal(Date.parse(after.data.paid_at), Date.parse(paidAt));
    assert.ok(Date.parse(after.data.payment_recorded_at) >= Date.parse(paidAt) - 1000);
    const duplicate = await coo.client.rpc("mark_invoice_paid_atomic", { p_invoice_id: invoiceId,
      p_expected_status: before.data.status, p_expected_updated_at: before.data.updated_at, p_paid_at: paidAt });
    assert.equal(duplicate.error?.code, "PT409");
    const preserved = await coo.client.from("invoices").select("paid_by_user_id,paid_by_profile_id,paid_at,payment_recorded_at").eq("id", invoiceId).single();
    assert.equal(preserved.error, null);
    for (const key of Object.keys(preserved.data)) assert.equal(preserved.data[key], after.data[key]);
    return { invoiceId, invoiceNumber: after.data.invoice_number, totalAmount: after.data.total_amount,
      originalPath: after.data.pdf_path, paidByUserId: after.data.paid_by_user_id,
      paidByProfileId: after.data.paid_by_profile_id, paidAt: after.data.paid_at,
      paymentRecordedAt: after.data.payment_recorded_at };
  }
  async function statementFor(
    label,
    days = 3,
    minutes = 480,
    km = 50,
    meals = true,
    pilot = false,
    prepareOnly = false,
  ) {
    const event = randomUUID(), report = randomUUID();
    const end = minutes === 500 ? "16:20" : "16:00";
    await query(
      `DO $$ BEGIN insert into public.events(id,name,project_id,job_number,date_from,date_to,meal_allowance_enabled,contact_profile_id,contact_approves_hours) values('${event}','DISPOSABLE ${label} ${run}','${fixtures.projectId}','PDF-${label}','2026-10-10','2026-10-12',${meals},'${fixtures.accounts.find((a) => a.key === "coo").profileId}',true); ${pilot ? `insert into public.event_assignments(event_id,profile_id) values('${event}','${profile}');` : ""} insert into public.timelogs(id,event_id,contractor_id,status,km) values('${report}','${event}','${profile}','${pilot ? "draft" : "pending_coo"}',${km}); insert into public.timelog_days(timelog_id,date,time_from,time_to,day_type,meals) select '${report}','2026-10-10'::date+n,'08:00','${end}','provoz',array['obed'] from generate_series(0,${
        days - 1
      })n; END $$;`,
    );
    if (prepareOnly) {
      const row = await coo.client.from("timelogs").select("id,updated_at").eq("id", report).single();
      assert.equal(row.error, null);
      return row.data;
    }
    if (pilot) await completeReportPilot(event, report);
    else {
      const quote = await rpc(coo.client, "get_invoice_billing_quote", {
        p_timelog_ids: [report],
      });
      const result = await coo.client.from("timelogs").select("updated_at").eq(
        "id",
        report,
      ).single();
      assert.equal(result.error, null);
      await rpc(coo.client, "resolve_timelog_approvals_atomic", {
        p_targets: [{
          id: report,
          expected_updated_at: result.data.updated_at,
          approval_id: null,
          approval_updated_at: null,
        }],
        p_resolution: "approved",
        p_note: "",
        p_billing_quote: quote.id,
      });
    }
    const snapshot = await rpc(owner.client, "get_invoice_billing_snapshot");
    return snapshot.statements.find((s) =>
      s.sources.some((x) => x.timelog_id === report)
    );
  }
  async function upload(
    statement,
    requestId,
    bytes = firstBytes,
    patch = {},
    session = owner,
  ) {
    const fields = {
      requestId,
      statementId: statement.id,
      expectedUpdatedAt: statement.updated_at,
      invoiceNumber: `ORIGINAL-${run}`,
      issueDate: "2026-10-13",
      dueDate: "2026-10-27",
      ...patch,
    };
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    form.append(
      "file",
      new Blob([bytes], { type: patch.contentType ?? "application/pdf" }),
      "original.pdf",
    );
    const response = await fetch(
      `${credentials.API_URL}/functions/v1/upload-invoice-document`,
      {
        method: "POST",
        headers: {
          apikey: credentials.ANON_KEY,
          ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
        },
        body: form,
      },
    );
    return { status: response.status, body: await response.json() };
  }
  async function download(session, path) {
    const signed = await session.client.storage.from("invoice-pdfs")
      .createSignedUrl(path, 60);
    assert.equal(signed.error, null, signed.error?.message);
    const r = await fetch(signed.data.signedUrl);
    assert.equal(r.status, 200);
    return new Uint8Array(await r.arrayBuffer());
  }
  async function worker(authorization = `Bearer ${workerSecret}`) {
    const r = await fetch(
      `${credentials.API_URL}/functions/v1/process-invoice-pdfs`,
      {
        method: "POST",
        headers: {
          ...(authorization ? { Authorization: authorization } : {}),
          "Content-Type": "application/json",
        },
        body: "{}",
      },
    );
    return { status: r.status, body: await r.json() };
  }
  const own = await statementFor("own", 3, 480, 50, true, true);
  assert.equal(own.total_amount, 7030);
  assert.equal(own.sources.length, 1);
  assert.equal(own.financial_snapshot.reports[0].days.length, 3);
  assert.equal(
    (await upload(own, randomUUID(), firstBytes, { contentType: "image/png" }))
      .status,
    400,
  );
  assert.equal(
    (await upload(own, randomUUID(), Buffer.from("not a pdf"))).status,
    400,
  );
  assert.equal(
    (await upload(own, randomUUID(), Buffer.alloc(5 * 1024 * 1024 + 1))).status,
    413,
  );
  assert.equal(
    (await upload(own, randomUUID(), firstBytes, {
      expectedUpdatedAt: "2026-01-01T00:00:00Z",
    })).status,
    409,
  );
  assert.equal(
    (await upload(own, randomUUID(), firstBytes, {}, other)).status,
    403,
  );
  assert.equal(
    (await upload(own, randomUUID(), firstBytes, {}, null)).status,
    401,
  );
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(
          '--proof\r\nContent-Disposition: form-data; name="file"; filename="test.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-',
        ),
      );
      for (let n = 0; n < 8; n++) {
        controller.enqueue(new Uint8Array(1024 * 1024));
      }
      controller.enqueue(new TextEncoder().encode("\r\n--proof--\r\n"));
      controller.close();
    },
  });
  const streamed = await fetch(
    `${credentials.API_URL}/functions/v1/upload-invoice-document`,
    {
      method: "POST",
      headers: {
        apikey: credentials.ANON_KEY,
        Authorization: `Bearer ${owner.token}`,
        "Content-Type": "multipart/form-data; boundary=proof",
      },
      body: stream,
      duplex: "half",
    },
  );
  assert.equal(
    streamed.status,
    413,
    "Chunked actual bytes are bounded before multipart allocation",
  );
  const requestId = randomUUID();
  const initial = await upload(own, requestId);
  assert.equal(initial.status, 200, JSON.stringify(initial.body));
  const original = initial.body.document;
  assert.equal(original.sha256, hash(firstBytes));
  assert.deepEqual((await upload(own, requestId)).body, initial.body);
  assert.equal((await upload(own, requestId, replacementBytes)).status, 409);
  assert.equal(
    (await upload(own, requestId, firstBytes, { dueDate: "2026-10-28" }))
      .status,
    409,
  );
  for (const session of [owner, ch, coo]) {
    assert.equal(
      hash(await download(session, original.storage_path)),
      original.sha256,
    );
  }
  for (const session of [other, { client: anon }]) {
    assert.ok(
      (await session.client.storage.from("invoice-pdfs").createSignedUrl(
        original.storage_path,
        60,
      )).error,
    );
  }
  assert.ok(
    (await owner.client.storage.from("invoice-pdfs").upload(
      `billing-statements/${own.id}/documents/guess.pdf`,
      firstBytes,
      { contentType: "application/pdf" },
    )).error,
  );
  assert.ok(
    (await owner.client.storage.from("invoice-pdfs").update(
      original.storage_path,
      replacementBytes,
      { contentType: "application/pdf" },
    )).error,
  );
  await owner.client.storage.from("invoice-pdfs").remove([
    original.storage_path,
  ]);
  assert.equal(
    hash(await download(owner, original.storage_path)),
    original.sha256,
    "A direct delete cannot remove the original",
  );
  const returned = await rpc(ch.client, "review_invoice_billing_document", {
    p_request_id: randomUUID(),
    p_statement_id: own.id,
    p_document_id: original.id,
    p_expected_updated_at: initial.body.statement.updated_at,
    p_decision: "return",
    p_note: "DISPOSABLE test return",
  });
  assert.deepEqual(
    (await upload(own, requestId)).body,
    initial.body,
    "Saved upload replays after CH return",
  );
  const replacementId = randomUUID();
  const replace = await upload(
    returned.statement,
    replacementId,
    replacementBytes,
    { invoiceNumber: `CORRECTED-${run}` },
  );
  assert.equal(replace.status, 200, JSON.stringify(replace.body));
  const accepted = await rpc(ch.client, "review_invoice_billing_document", {
    p_request_id: randomUUID(),
    p_statement_id: own.id,
    p_document_id: replace.body.document.id,
    p_expected_updated_at: replace.body.statement.updated_at,
    p_decision: "accept",
    p_note: "",
  });
  assert.equal(accepted.statement.invoice_id !== null, true);
  assert.deepEqual(
    (await upload(own, requestId)).body,
    initial.body,
    "Saved replay survives acceptance",
  );
  for (const session of [owner, ch, coo]) {
    assert.equal(
      hash(await download(session, original.storage_path)),
      hash(firstBytes),
    );
    assert.equal(
      hash(await download(session, replace.body.document.storage_path)),
      hash(replacementBytes),
    );
  }
  const acceptedInvoice = await coo.client.from("invoices").select("*").eq(
    "id",
    accepted.statement.invoice_id,
  ).single();
  assert.equal(acceptedInvoice.error, null);
  assert.equal(
    acceptedInvoice.data.pdf_path,
    replace.body.document.storage_path,
  );
  const guardBefore = {
    path: acceptedInvoice.data.pdf_path,
    time: acceptedInvoice.data.pdf_generated_at,
    hash: hash(await download(owner, acceptedInvoice.data.pdf_path)),
  };
  const guardResponse = await fetch(
    `${credentials.API_URL}/functions/v1/generate-invoice-pdf`,
    {
      method: "POST",
      headers: {
        apikey: credentials.ANON_KEY,
        Authorization: `Bearer ${owner.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ invoiceId: accepted.statement.invoice_id }),
    },
  );
  assert.equal(guardResponse.status, 409);
  const guardAfter = await coo.client.from("invoices").select(
    "pdf_path,pdf_generated_at",
  ).eq("id", accepted.statement.invoice_id).single();
  assert.deepEqual({
    path: guardAfter.data.pdf_path,
    time: guardAfter.data.pdf_generated_at,
    hash: hash(await download(owner, guardAfter.data.pdf_path)),
  }, guardBefore);
  const ownPayment = await markPaid(accepted.statement.invoice_id);
  assert.equal(hash(await download(owner, ownPayment.originalPath)), hash(replacementBytes));
  // Pre-upload an exact request with the same fingerprint, simulating lost registration after a committed Storage write.
  const orphanStatement = await statementFor("orphan");
  const orphanId = randomUUID();
  const path =
    `billing-statements/${orphanStatement.id}/documents/${orphanId}.pdf`;
  const expected = orphanStatement.updated_at.replace(
    /(?:\.(\d{1,6}))?(?:\+00:00|Z)$/,
    (_m, f) => `.${(f ?? "").padEnd(6, "0")}Z`,
  );
  const metadata = {
    p_request_id: orphanId,
    p_uploader_user_id: userId,
    p_statement_id: orphanStatement.id,
    p_expected_updated_at: expected,
    p_storage_path: path,
    p_sha256: hash(firstBytes),
    p_byte_size: firstBytes.length,
    p_invoice_number: `ORIGINAL-${run}`,
    p_issue_date: "2026-10-13",
    p_due_date: "2026-10-27",
    p_total_amount: 7030,
  };
  assert.equal(
    (await service.storage.from("invoice-pdfs").upload(path, firstBytes, {
      contentType: "application/pdf",
      upsert: false,
      metadata: {
        uploadFingerprint: hash(Buffer.from(JSON.stringify(metadata))),
      },
    })).error,
    null,
  );
  assert.equal(
    (await upload(orphanStatement, orphanId, firstBytes, {
      dueDate: "2026-10-28",
    })).status,
    409,
  );
  const recovered = await upload(orphanStatement, orphanId);
  assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
  assert.equal(hash(await download(owner, path)), hash(firstBytes));
  const activation = await readFile(new URL("../functions/process-invoice-pdfs/activate-dispatch.sql", import.meta.url), "utf8");
  const schedule = await readFile(new URL("../functions/process-invoice-pdfs/schedule.sql", import.meta.url), "utf8");
  const pause = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms));
  async function until(read, predicate, label, timeout = 90000) {
    const deadline = Date.now() + timeout;
    while (true) {
      lifecycle.check();
      const value = await read();
      if (predicate(value)) return value;
      assert.ok(Date.now() < deadline, `Timed out: ${label}`);
      await pause();
    }
  }
  const requestRows = () => query(`select t.request_id::text id,t.transaction_id::text,t.created_at,(q.id is not null) queued,r.status_code,r.timed_out,r.error_msg,r.content from private.${cronTracker.table} t left join net.http_request_queue q on q.id=t.request_id left join net._http_response r on r.id=t.request_id order by t.request_id`);
  async function settledRequests() {
    const rows = await until(requestRows, (items) => items.every((row) => !row.queued && row.status_code != null), "all recorded event requests");
    for (const row of rows) {
      assert.equal(row.status_code, 200, `Ambiguous/unexpected response for ${row.id}`);
      assert.ok(!row.timed_out && !row.error_msg);
      const body = JSON.parse(row.content);
      assert.ok(Number.isInteger(body.processed) && body.processed >= 0 && body.processed <= 4);
      assert.ok(Number.isInteger(body.rendered) && body.rendered >= 0 && body.rendered <= 1);
    }
    return rows;
  }
  async function invoiceFor(statementId) {
    const state = await rpc(owner.client, "get_invoice_billing_snapshot");
    const statement = state.statements.find((row) => row.id === statementId);
    if (!statement?.invoice_id) return null;
    const record = await owner.client.from("invoices").select("*").eq("id", statement.invoice_id).single();
    assert.equal(record.error, null);
    return record.data?.pdf_path ? record.data : null;
  }
  const waitForInvoice = (id) => until(() => invoiceFor(id), Boolean, `event PDF for ${id}`);
  const ledgerCount = async () => (await query(`select count(*)::integer count from private.${cronTracker.table}`))[0].count;
  const storedCommand = () => query("DO $fallback$ DECLARE command text; BEGIN select j.command into strict command from cron.job j where j.jobname='crewflow-invoice-pdfs';execute command;END $fallback$;");
  // Install the intentional Storage failure BEFORE confirmation can commit an event wake.
  const self = await statementFor("self", 1, 500, 0, false);
  assert.equal(self.total_amount, 2083.33);
  const bucketBefore = await service.storage.getBucket("invoice-pdfs");
  assert.equal(bucketBefore.error, null);
  assert.equal(bucketBefore.data.public, false);
  await writeFile(`${output}/before-bucket.private.json`, JSON.stringify(bucketBefore.data));
  bucketRestore = bucketBefore.data;
  assert.equal((await service.storage.updateBucket("invoice-pdfs", { public: false, allowedMimeTypes: ["image/png"] })).error, null);
  await query(activation);
  let issued, frozen, invoiceId, job;
  try {
    issued = await rpc(owner.client, "confirm_invoice_billing", {
      p_request_id: randomUUID(), p_statement_id: self.id,
      p_expected_updated_at: self.updated_at, p_non_vat_confirmed: true,
    });
    invoiceId = issued.statement.invoice_id;
    frozen = (await owner.client.from("invoices").select("id,invoice_number,total_amount,supplier_snapshot,customer_snapshot").eq("id", invoiceId).single()).data;
    const manual = await fetch(`${credentials.API_URL}/functions/v1/generate-invoice-pdf`, {
      method: "POST", headers: { apikey: credentials.ANON_KEY, Authorization: `Bearer ${owner.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ invoiceId }),
    });
    assert.equal(manual.status, 409);
    assert.equal((await worker(null)).status, 401);
    assert.equal((await worker(`Bearer ${credentials.ANON_KEY}`)).status, 401);
    assert.equal((await worker("Bearer wrong")).status, 401);
    job = await until(async () => (await rpc(owner.client, "get_invoice_billing_snapshot")).jobs.find((j) => j.invoice_id === invoiceId),
      (row) => row?.status === "queued" && row.failure_code === "transient_failure", "real event-triggered Storage failure");
    assert.equal(job.attempts, 1);
    await settledRequests();
  } finally {
    assert.equal((await cleanupService.storage.updateBucket("invoice-pdfs", { public: bucketRestore.public, allowedMimeTypes: bucketRestore.allowed_mime_types })).error, null);
    bucketRestore = null;
  }
  let snapshot = await rpc(owner.client, "get_invoice_billing_snapshot");
  const current = snapshot.statements.find((s) => s.id === self.id);
  const beforeRetryRequests = await ledgerCount();
  await rpc(owner.client, "retry_invoice_billing_job", {
    p_request_id: randomUUID(), p_statement_id: self.id, p_job_id: job.id,
    p_expected_updated_at: current.updated_at, p_expected_job_updated_at: job.updated_at,
  });
  const persisted = await waitForInvoice(self.id);
  assert.ok(await ledgerCount() > beforeRetryRequests, "Owner retry commits an event wake");
  for (const key of Object.keys(frozen)) assert.deepEqual(persisted[key], frozen[key]);
  assert.equal(persisted.pdf_path, `invoices/${invoiceId}.pdf`);
  await writeFile(`${output}/worker-invoice.pdf`, await download(owner, persisted.pdf_path));
  snapshot = await rpc(owner.client, "get_invoice_billing_snapshot");
  const recoveredJob = snapshot.jobs.find((j) => j.id === job.id);
  assert.equal(recoveredJob.status, "completed");
  assert.equal(recoveredJob.attempts, 2);
  await settledRequests();
  const selfPayment = await markPaid(invoiceId);
  // ONE actual Auth approval transaction creates three independent standing statements.
  // Cron is absent throughout this phase and no authorized worker is called directly.
  await rpc(owner.client, "set_self_billing_consent", {
    p_request_id: randomUUID(), p_enabled: true, p_expected_updated_at: null, p_non_vat_confirmed: true,
  });
  const reports = [];
  for (let i = 0; i < 3; i++) reports.push(await statementFor(`event-burst-${i}`, 1, 480, 0, false, false, true));
  if (process.env.INVOICE_DISPATCH_INTERRUPTION === "1") {
    assert.ok(process.send, "Interruption mode requires the controlled parent");
    process.channel.ref();
    const waitMessage = () => new Promise((resolve, reject) => {
      const cleanup = () => { process.off("message", message); process.off("SIGTERM", stop); process.off("SIGINT", stop); };
      const message = (value) => { cleanup(); resolve(value); };
      const stop = () => { cleanup(); reject(new InvoiceTestInterrupted("signal")); };
      process.once("message", message); process.once("SIGTERM", stop); process.once("SIGINT", stop);
    });
    const approveOne = async (report) => {
      const quote = await rpc(coo.client, "get_invoice_billing_quote", { p_timelog_ids: [report.id] });
      await rpc(coo.client, "resolve_timelog_approvals_atomic", {
        p_targets: [{ id: report.id, expected_updated_at: report.updated_at, approval_id: null, approval_updated_at: null }],
        p_resolution: "approved", p_note: "", p_billing_quote: quote.id,
      });
    };
    // Commit both Auth approvals before any worker can hold their shared owner
    // profile. Only the second marked job's timer is changed during contention.
    await query("update private.invoice_worker_dispatch_control set enabled=false where id=1");
    await settledRequests();
    await approveOne(reports[0]);
    await approveOne(reports[1]);
    const statements = (await rpc(owner.client, "get_invoice_billing_snapshot")).statements;
    const second = statements.find((s) => s.sources.some((x) => x.timelog_id === reports[1].id));
    await query(`update private.invoice_billing_jobs set available_at='infinity' where statement_id='${second.id}' and kind='issue' and status='queued'`);
    process.send({ stage: "interruption-ready", output, table: cronTracker.table, reports: reports.map((r) => r.id) });
    await waitMessage();
    await query(activation);
    process.send({ stage: "first-event-committed" });
    await waitMessage();
    await query(`update private.invoice_billing_jobs set available_at=clock_timestamp() where statement_id='${second.id}' and kind='issue' and status='queued'`);
    const requests = await requestRows();
    process.send({ stage: "second-event-committed", requestIds: requests.map((r) => r.id) });
    await new Promise((_resolve, reject) => {
      process.once("SIGTERM", () => reject(new InvoiceTestInterrupted("SIGTERM")));
      process.once("SIGINT", () => reject(new InvoiceTestInterrupted("SIGINT")));
    });
    await writeFile(`${output}/LATER_MAIN_ACTION_SHOULD_NOT_EXIST`, "unexpected continuation");
  }
  assert.equal((await query("select count(*)::integer count from cron.job where jobname='crewflow-invoice-pdfs'"))[0].count, 0);
  const burstStartRequests = await ledgerCount();
  const burstStartedAt = new Date().toISOString();
  const burstQuote = await rpc(coo.client, "get_invoice_billing_quote", { p_timelog_ids: reports.map((r) => r.id) });
  await rpc(coo.client, "resolve_timelog_approvals_atomic", {
    p_targets: reports.map((row) => ({ id: row.id, expected_updated_at: row.updated_at, approval_id: null, approval_updated_at: null })),
    p_resolution: "approved", p_note: "", p_billing_quote: burstQuote.id,
  });
  const standingStatements = (await rpc(owner.client, "get_invoice_billing_snapshot")).statements.filter((s) => s.sources.some((source) => reports.some((r) => r.id === source.timelog_id)));
  assert.equal(standingStatements.length, 3);
  const standingInvoices = [];
  for (const statement of standingStatements) {
    assert.equal(statement.sources.length, 1);
    assert.ok(statement.consent_grant_id);
    const record = await waitForInvoice(statement.id);
    assert.equal(record.total_amount, statement.total_amount);
    assert.deepEqual(record.supplier_snapshot, statement.supplier_snapshot);
    assert.deepEqual(record.customer_snapshot, statement.customer_snapshot);
    const bytes = await download(owner, record.pdf_path);
    assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), "%PDF-");
    await writeFile(`${output}/standing-${record.id}.pdf`, bytes);
    standingInvoices.push(record);
  }
  const burstCompletedAt = new Date().toISOString();
  const burstRequests = (await settledRequests()).slice(burstStartRequests);
  assert.ok(burstRequests.filter((row) => JSON.parse(row.content).rendered === 1).length >= 3, "More than one PDF drains through event continuation");
  assert.equal(new Set(standingInvoices.map((i) => i.id)).size, 3);
  assert.equal(new Set(standingInvoices.map((i) => i.invoice_number)).size, 3);
  assert.equal((await query("select count(*)::integer count from cron.job where jobname='crewflow-invoice-pdfs'"))[0].count, 0);
  // Future work cannot wake immediately. Activation sees only a future marked job;
  // the exact persisted hourly command must recover it when its timer becomes due.
  await query("update private.invoice_worker_dispatch_control set enabled=false where id=1");
  await settledRequests();
  const delayed = await statementFor("delayed-fallback", 1, 480, 0, false);
  await query(`update private.invoice_billing_jobs set available_at=clock_timestamp()+interval '5 seconds' where statement_id='${delayed.id}' and kind='issue' and status='queued'`);
  const beforeFuture = await ledgerCount();
  await query(activation);
  const cron = await cronTracker.schedule(schedule);
  await cronTracker.schedule(schedule);
  assert.equal(await ledgerCount(), beforeFuture, "Activation does not wake future work");
  await storedCommand();
  assert.equal(await ledgerCount(), beforeFuture, "Exact hourly command stays idle before due");
  await until(async () => (await query(`select available_at<=clock_timestamp() due from private.invoice_billing_jobs where statement_id='${delayed.id}' and kind='issue'`))[0].due, Boolean, "future fallback timer", 15000);
  await storedCommand();
  const delayedInvoice = await waitForInvoice(delayed.id);
  assert.ok(await ledgerCount() > beforeFuture, "Exact stored hourly command enqueues due work");
  await settledRequests();
  const beforeIdle = await ledgerCount();
  const idleControl = (await query("select last_request_id::text id from private.invoice_worker_dispatch_control where id=1"))[0].id;
  await storedCommand();
  assert.equal(await ledgerCount(), beforeIdle, "Idle exact hourly check sends no HTTP request");
  assert.equal((await query("select last_request_id::text id from private.invoice_worker_dispatch_control where id=1"))[0].id, idleControl);
  const net = await settledRequests();
  const scheduled = standingStatements[0], scheduledInvoice = standingInvoices[0];
  const enabledConsent = (await rpc(owner.client, "get_invoice_billing_snapshot")).consent;
  await rpc(owner.client, "set_self_billing_consent", { p_request_id: randomUUID(), p_enabled: false,
    p_expected_updated_at: enabledConsent.updated_at, p_non_vat_confirmed: false });
  const afterRevocation = await statementFor("after-revocation", 1, 480, 0, false);
  assert.equal(afterRevocation.status, "ready");
  assert.equal(afterRevocation.invoice_id, null);
  assert.equal(afterRevocation.consent_grant_id, null);
  const revokedState = await rpc(owner.client, "get_invoice_billing_snapshot");
  assert.equal(revokedState.consent.enabled, false);
  assert.equal(revokedState.jobs.filter((j) => j.statement_id === afterRevocation.id && j.kind === "issue").length, 0);
  const freshOwner = await login({ email: created.data.user.email, password: `${run}!aA1` });
  const refreshed = await rpc(freshOwner.client, "get_invoice_billing_snapshot");
  assert.equal(refreshed.statements.find((s) => s.id === own.id).invoice_id, ownPayment.invoiceId);
  assert.equal(refreshed.statements.find((s) => s.id === self.id).invoice_id, selfPayment.invoiceId);
  const freshPaid = await freshOwner.client.from("invoices").select("id,status,pdf_path,total_amount").in("id", [ownPayment.invoiceId, selfPayment.invoiceId]);
  assert.equal(freshPaid.error, null);
  assert.equal(freshPaid.data.length, 2);
  for (const payment of [ownPayment, selfPayment]) {
    const record = freshPaid.data.find((i) => i.id === payment.invoiceId);
    assert.deepEqual(record, { id: payment.invoiceId, status: "paid", pdf_path: payment.originalPath, total_amount: payment.totalAmount });
  }
  for (const s of [own, self, ...standingStatements, delayed]) {
    const links = await coo.client.from("invoice_timelogs").select("invoice_id,timelog_id").in("timelog_id", s.sources.map((source) => source.timelog_id));
    assert.equal(links.error, null);
    assert.equal(links.data.length, s.sources.length);
    assert.equal(new Set(links.data.map((l) => l.invoice_id)).size, 1);
  }
  const foreignInvoices = await other.client.from("invoices").select("id").in("id", [ownPayment.invoiceId, selfPayment.invoiceId, ...standingInvoices.map((i) => i.id), delayedInvoice.id]);
  assert.equal(foreignInvoices.error, null);
  assert.deepEqual(foreignInvoices.data, []);
  const scheduledAfter = await owner.client.from("invoices").select("id,invoice_number,total_amount,pdf_path").eq("id", scheduledInvoice.id).single();
  assert.equal(scheduledAfter.error, null);
  for (const key of Object.keys(scheduledAfter.data)) assert.equal(scheduledAfter.data[key], scheduledInvoice[key]);

  const historic = await coo.client.from("invoices").select(
    "total_amount,status",
  ).eq("id", "a87b8597-cd3e-4f71-afe4-9d899cfc2bd6").single();
  assert.deepEqual(historic.data, { total_amount: 2056, status: "paid" });
  const summary = {
    result: "passed",
    run,
    owner: userId,
    statementId: own.id,
    originalHash: hash(firstBytes),
    replacementHash: hash(replacementBytes),
    acceptedInvoice: accepted.statement.invoice_id,
    orphanRecovered: recovered.body.document.id,
    workerInvoiceId: invoiceId,
    workerInvoiceNumber: frozen.invoice_number,
    workerFailureAttempts: job.attempts,
    workerRecoveryAttempts: 2,
    scheduledInvoiceId: scheduledInvoice.id,
    eventStandingInvoices: standingInvoices.map((i) => ({ id: i.id, invoiceNumber: i.invoice_number, totalAmount: i.total_amount, pdfPath: i.pdf_path })),
    eventStanding: { approvalTransactions: 1, cronAbsent: true, directAuthorizedWorkerCalls: 0, burstStartedAt, burstCompletedAt, elapsedMs: Date.parse(burstCompletedAt) - Date.parse(burstStartedAt), requests: burstRequests },
    hourlyFallback: { proof: "exact stored command; no wall-clock hourly tick claimed", schedule: cron.schedule, command: cron.command, delayedStatementId: delayed.id, delayedInvoiceId: delayedInvoice.id, futureNoHttp: true, idleNoHttp: true, idempotent: true },
    individualEventFailureRetry: true,
    cron,
    net,
    historicalPaidCZK: 2056,
    reportPilot,
    ownPayment,
    selfPayment,
    revokedNextStatementId: afterRevocation.id,
    independentAuthSessionRead: true,
    foreignInvoicesHidden: true,
    exactlyOneInvoicePerCompleteSource: true,
  };
  await writeFile(`${output}/evidence.json`, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ...summary, output }, null, 2));
} catch (error) {
  if (error instanceof InvoiceTestInterrupted || lifecycle.interrupted) {
    process.exitCode = 130;
  } else {
    console.error(error);
    throw error;
  }
} finally {
  await lifecycle.cleanup();
  if (process.connected) process.disconnect();
}
