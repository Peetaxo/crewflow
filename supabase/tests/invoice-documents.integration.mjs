import assert from "node:assert/strict";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  delayJobTimers,
  restoreJobTimers,
  snapshotJobTimers,
} from "./invoice-job-test-state.mjs";
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
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(
  credentials.API_URL,
  credentials.SERVICE_ROLE_KEY,
  options,
);
const anon = createClient(credentials.API_URL, credentials.ANON_KEY, options);
const run = randomUUID();
const output = `${dir}/results/invoice-billing/task2-${run}`;
await import("node:fs/promises").then((fs) =>
  fs.mkdir(output, { recursive: true })
);
async function query(sql, privateFile = false) {
  const file = `${output}/query.sql`;
  await writeFile(file, sql, { mode: 0o600 });
  await chmod(file, 0o600);
  const raw = execFileSync("/opt/homebrew/bin/supabase", [
    "db",
    "query",
    "--local",
    "--workdir",
    "/Users/peetax/Projekty/.crewflow-demo-20261012",
    "--file",
    file,
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (privateFile) {
    await writeFile(file, "-- private setup redacted after execution\n", {
      mode: 0o600,
    });
  }
  return raw.trim().startsWith("{") ? JSON.parse(raw).rows : [];
}
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
const beforeJobTimers = await snapshotJobTimers(output);
let scheduleCreated = false;
let bucketRestore = null;
let cleanupPromise;
const cleanup = () =>
  cleanupPromise ??= (async () => {
    if (scheduleCreated) {
      await query("select cron.unschedule('crewflow-invoice-pdfs')");
      scheduleCreated = false;
    }
    if (bucketRestore) {
      assert.equal(
        (await service.storage.updateBucket("invoice-pdfs", {
          public: bucketRestore.public,
          allowedMimeTypes: bucketRestore.allowed_mime_types,
        })).error,
        null,
      );
      bucketRestore = null;
    }
    const restored = await restoreJobTimers(beforeJobTimers);
    await writeFile(
      `${output}/cleanup.json`,
      JSON.stringify({ restored, verifiedExactCapturedRows: true }),
    );
  })();
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    void cleanup().then(() => process.exit(130));
  });
}
try {
  await delayJobTimers(beforeJobTimers);
  await query(
    `DO $$ BEGIN update public.profiles set hourly_rate=250,ico='12345678',bank_account='123/0800',billing_street='Testovací ulice 1',billing_zip='10000',billing_city='Praha',billing_country='CZ' where id='${profile}' and user_id='${userId}'; insert into public.user_roles(user_id,role) values('${userId}','crew') on conflict do nothing; END $$;`,
  );
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  async function statementFor(
    label,
    days = 3,
    minutes = 480,
    km = 50,
    meals = true,
  ) {
    const event = randomUUID(), report = randomUUID();
    const end = minutes === 500 ? "16:20" : "16:00";
    await query(
      `DO $$ BEGIN insert into public.events(id,name,project_id,job_number,date_from,date_to,meal_allowance_enabled) values('${event}','DISPOSABLE ${label} ${run}','${fixtures.projectId}','PDF-${label}','2026-10-10','2026-10-12',${meals}); insert into public.timelogs(id,event_id,contractor_id,status,km) values('${report}','${event}','${profile}','pending_coo',${km}); insert into public.timelog_days(timelog_id,date,time_from,time_to,day_type,meals) select '${report}','2026-10-10'::date+n,'08:00','${end}','provoz',array['obed'] from generate_series(0,${
        days - 1
      })n; END $$;`,
    );
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
  const own = await statementFor("own");
  assert.equal(own.total_amount, 7030);
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
  // Real service job failure, authorized retry, and same-invoice recovery.
  const self = await statementFor("self", 1, 500, 0, false);
  assert.equal(self.total_amount, 2083.33);
  const issued = await rpc(owner.client, "confirm_invoice_billing", {
    p_request_id: randomUUID(),
    p_statement_id: self.id,
    p_expected_updated_at: self.updated_at,
    p_non_vat_confirmed: true,
  });
  const invoiceId = issued.statement.invoice_id;
  const frozen = (await owner.client.from("invoices").select(
    "id,invoice_number,total_amount,supplier_snapshot,customer_snapshot",
  ).eq("id", invoiceId).single()).data;
  const manual = await fetch(
    `${credentials.API_URL}/functions/v1/generate-invoice-pdf`,
    {
      method: "POST",
      headers: {
        apikey: credentials.ANON_KEY,
        Authorization: `Bearer ${owner.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ invoiceId }),
    },
  );
  assert.equal(manual.status, 409);
  assert.equal((await worker(null)).status, 401);
  assert.equal((await worker(`Bearer ${credentials.ANON_KEY}`)).status, 401);
  assert.equal((await worker("Bearer wrong")).status, 401);
  const bucketBefore = await service.storage.getBucket("invoice-pdfs");
  assert.equal(bucketBefore.error, null);
  assert.equal(bucketBefore.data.public, false);
  await writeFile(
    `${output}/before-bucket.private.json`,
    JSON.stringify(bucketBefore.data),
    { mode: 0o600 },
  );
  bucketRestore = bucketBefore.data;
  assert.equal(
    (await service.storage.updateBucket("invoice-pdfs", {
      public: false,
      allowedMimeTypes: ["image/png"],
    })).error,
    null,
  );
  try {
    const failed = await worker();
    assert.equal(failed.status, 200, JSON.stringify(failed.body));
    assert.equal(failed.body.rendered, 0);
  } finally {
    assert.equal(
      (await service.storage.updateBucket("invoice-pdfs", {
        public: bucketRestore.public,
        allowedMimeTypes: bucketRestore.allowed_mime_types,
      })).error,
      null,
    );
    bucketRestore = null;
  }
  let snapshot = await rpc(owner.client, "get_invoice_billing_snapshot");
  const job = snapshot.jobs.find((j) => j.invoice_id === invoiceId);
  assert.equal(job.status, "queued");
  assert.equal(job.failure_code, "transient_failure");
  assert.equal(job.attempts, 1);
  const current = snapshot.statements.find((s) => s.id === self.id);
  await rpc(owner.client, "retry_invoice_billing_job", {
    p_request_id: randomUUID(),
    p_statement_id: self.id,
    p_job_id: job.id,
    p_expected_updated_at: current.updated_at,
    p_expected_job_updated_at: job.updated_at,
  });
  const generated = await worker();
  assert.equal(generated.status, 200, JSON.stringify(generated.body));
  assert.equal(generated.body.rendered, 1);
  const persisted =
    (await owner.client.from("invoices").select("*").eq("id", invoiceId)
      .single()).data;
  for (const key of Object.keys(frozen)) {
    assert.deepEqual(persisted[key], frozen[key]);
  }
  assert.equal(persisted.pdf_path, `invoices/${invoiceId}.pdf`);
  await writeFile(
    `${output}/worker-invoice.pdf`,
    await download(owner, persisted.pdf_path),
  );
  snapshot = await rpc(owner.client, "get_invoice_billing_snapshot");
  assert.equal(snapshot.jobs.find((j) => j.id === job.id).status, "completed");
  // Standing consent queues a future issuance. Its only worker invocation will be pg_cron -> pg_net.
  await rpc(owner.client, "set_self_billing_consent", {
    p_request_id: randomUUID(),
    p_enabled: true,
    p_expected_updated_at: null,
    p_non_vat_confirmed: true,
  });
  const scheduled = await statementFor("scheduled", 1, 480, 0, false);
  const schedule = await readFile(
    new URL("../functions/process-invoice-pdfs/schedule.sql", import.meta.url),
    "utf8",
  );
  await query(
    `DO $setup$ BEGIN perform vault.update_secret(id,'http://supabase_kong_crewflow-demo-20261012:8000/functions/v1/process-invoice-pdfs') from vault.secrets where name='invoice_pdf_worker_url'; if not found then perform vault.create_secret('http://supabase_kong_crewflow-demo-20261012:8000/functions/v1/process-invoice-pdfs','invoice_pdf_worker_url'); end if; perform vault.update_secret(id,'${workerSecret}') from vault.secrets where name='invoice_pdf_worker_secret'; if not found then perform vault.create_secret('${workerSecret}','invoice_pdf_worker_secret'); end if; END $setup$;`,
    true,
  );
  await query(schedule);
  scheduleCreated = true;
  const scheduledAt = new Date().toISOString();
  await writeFile(
    `${output}/schedule-pending.json`,
    JSON.stringify({ statementId: scheduled.id, scheduledAt, run }, null, 2),
  );
  console.log(`WAITING_FOR_CRON ${output}`);
  let scheduledInvoice = null;
  for (let n = 0; n < 75; n++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const state = await rpc(owner.client, "get_invoice_billing_snapshot");
    const s = state.statements.find((row) => row.id === scheduled.id);
    if (s.invoice_id) {
      const record = await owner.client.from("invoices").select("*").eq(
        "id",
        s.invoice_id,
      ).single();
      if (record.data?.pdf_path) {
        scheduledInvoice = record.data;
        break;
      }
    }
  }
  assert.ok(
    scheduledInvoice,
    "Database schedule must issue and render with no app present",
  );
  const cron = await query(
    "select j.jobname,d.status,d.return_message,d.start_time from cron.job j join cron.job_run_details d on d.jobid=j.jobid where j.jobname='crewflow-invoice-pdfs' order by d.start_time desc limit 1",
  );
  assert.equal(cron[0]?.status, "succeeded");
  const net = await query(
    "select status_code,content from net._http_response where created > now()-interval '3 minutes' order by created desc limit 1",
  );
  assert.equal(net[0]?.status_code, 200);
  assert.equal(JSON.parse(net[0].content).rendered, 1);

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
    cron,
    net,
    historicalPaidCZK: 2056,
  };
  await writeFile(`${output}/evidence.json`, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  console.error(error);
  throw error;
} finally {
  await cleanup();
}
