// Controlled local proof of one actual event worker in flight and another queued.
import assert from "node:assert/strict";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { localQuery } from "./invoice-job-test-state.mjs";
process.umask(0o077);
const dir = resolve(process.argv[2]), env = resolve(process.argv[3]);
assert.equal(JSON.parse(await readFile(`${dir}/local-credentials.json`, "utf8")).API_URL, "http://127.0.0.1:55321");
const output = `/private/tmp/crewflow-invoice-workflow-20261015-dispatch/interruption-${randomUUID()}`;
await mkdir(output, { recursive: true });
let queryNumber = 0;
const query = (sql) => localQuery(sql, `${output}/query-${++queryNumber}.private.sql`);
const initial = (await query("select enabled,(select count(*) from cron.job where jobname='crewflow-invoice-pdfs')::integer cron_jobs,(select count(*) from net.http_request_queue)::integer queued from private.invoice_worker_dispatch_control where id=1"))[0];
assert.deepEqual(initial, { enabled: false, cron_jobs: 0, queued: 0 });
const net = await query("select pid::integer pid from pg_stat_activity where backend_type like 'pg_net%worker'");
assert.equal(net.length, 1);
const netPid = net[0].pid;
const child = spawn(process.execPath, [new URL("./invoice-documents.integration.mjs", import.meta.url).pathname, dir, env], {
  env: { ...process.env, INVOICE_DISPATCH_INTERRUPTION: "1" }, stdio: ["ignore", "pipe", "pipe", "ipc"],
});
const messages = [];
let childLog = "", exitCode = null, lock, paused = false, locked = false;
child.stdout.on("data", (bytes) => childLog += bytes);
child.stderr.on("data", (bytes) => childLog += bytes);
child.on("message", (message) => messages.push(message));
child.once("exit", (code) => exitCode = code);
const pause = () => new Promise((resolve) => setTimeout(resolve, 50));
async function until(predicate, label, timeout = 20000) {
  const end = Date.now() + timeout;
  while (!await predicate()) {
    assert.equal(exitCode, null, `${label}: child exited ${exitCode}; inspect private child.log`);
    assert.ok(Date.now() < end, `Timeout: ${label}; no quiescence inferred`);
    await pause();
  }
}
const app = `invoice_event_lock_${randomUUID().replaceAll("-", "")}`;
await writeFile(`${output}/CONTROL-RECOVERY.txt`, `Local only. Signal child PID ${child.pid} SIGTERM. If this exact pg_net PID remains paused, resume only it with docker exec supabase_db_crewflow-demo-20261012 kill -CONT ${netPid}. Release only the lock connection with application_name ${app}. Read the child's saved snapshot and manifest. Never restore timers before its definitive drain receipt.\n`);
try {
  await until(() => messages.some((m) => m.stage === "interruption-ready"), "child event setup", 90000);
  const ready = messages.find((m) => m.stage === "interruption-ready");
  lock = spawn("docker", ["exec", "-i", "-e", "PGOPTIONS=-c session_preload_libraries=", "-e", `PGAPPNAME=${app}`, "supabase_db_crewflow-demo-20261012", "sh", "-c", 'PGPASSWORD="$POSTGRES_PASSWORD" psql -XqAt -U supabase_admin -d postgres -v ON_ERROR_STOP=1'], { stdio: ["pipe", "pipe", "pipe"] });
  lock.stdout.on("data", (bytes) => { if (bytes.toString().includes("LOCKED")) locked = true; });
  lock.stderr.on("data", (bytes) => childLog += bytes);
  // This permits approval and issue-job insertion, but blocks actual issuance.
  lock.stdin.write("begin;lock table public.invoices in share mode;select 'LOCKED';\n");
  await until(() => locked, "exact local invoice lock");
  child.send({ stage: "approve-first" });
  await until(() => messages.some((m) => m.stage === "first-event-committed"), "first conditional activation wake");
  const activeProcess = () => query("select count(*)::integer count from pg_stat_activity where pid<>pg_backend_pid() and wait_event_type='Lock' and query ilike '%process_invoice_billing_job%'");
  await until(async () => (await activeProcess())[0].count >= 1, "first real event worker in flight", 5000);
  const firstRequestId = (await query(`select request_id::text id from private.${ready.table} order by request_id desc limit 1`))[0].id;
  execFileSync("docker", ["exec", "supabase_db_crewflow-demo-20261012", "kill", "-STOP", String(netPid)]);
  paused = true;
  child.send({ stage: "approve-second" });
  await until(() => messages.some((m) => m.stage === "second-event-committed"), "second marked queue-timer event", 5000);
  const queued = await query(`select t.request_id::text id from private.${ready.table} t join net.http_request_queue q on q.id=t.request_id order by t.request_id`);
  // pg_net may retain the already in-flight batch's queue row until its response.
  // The new ID committed while pg_net is paused proves the second is unsent.
  assert.ok(queued.length >= 1);
  const requestId = queued.at(-1).id;
  assert.ok(BigInt(requestId) > BigInt(firstRequestId), "The paused pg_net worker cannot have sent the new trigger request");
  const countBefore = (await query(`select count(*)::integer count from private.${ready.table}`))[0].count;
  child.kill("SIGTERM");
  await until(() => messages.some((m) => m.stage === "stopped"), "event fence before drain", 5000);
  await assert.rejects(access(`${ready.output}/cleanup.json`));
  // A late queue event after the stop fence cannot enqueue an untracked request.
  await query(`update private.invoice_billing_jobs set available_at=available_at-interval '1 microsecond' where statement_id in(select s.id from public.invoice_billing_statements s join public.invoice_billing_sources x on x.statement_id=s.id where x.timelog_id='${ready.reports[1]}') and status='queued'`);
  assert.equal((await query(`select count(*)::integer count from private.${ready.table}`))[0].count, countBefore);
  assert.equal((await query("select enabled from private.invoice_worker_dispatch_control where id=1"))[0].enabled, false);
  execFileSync("docker", ["exec", "supabase_db_crewflow-demo-20261012", "kill", "-CONT", String(netPid)]);
  paused = false;
  // pg_net is allowed to deliver serially. The first worker remains blocked;
  // the second ID must still drain definitively after that lock is released.
  assert.ok((await activeProcess())[0].count >= 1);
  await assert.rejects(access(`${ready.output}/cleanup.json`));
  lock.stdin.end("rollback;\n");
  await new Promise((resolve) => lock.once("exit", resolve));
  lock = null;
  await until(() => exitCode !== null, "definitive drain and exact restoration", 20000);
  assert.equal(exitCode, 130, "SIGTERM stops later main actions");
  const cleanup = JSON.parse(await readFile(`${ready.output}/cleanup.json`, "utf8"));
  const preservation = JSON.parse(await readFile(`${ready.output}/preservation.json`, "utf8"));
  assert.equal(cleanup.drained, true);
  assert.deepEqual(cleanup.eventDispatch, { disabled: true, fenced: true });
  assert.ok(cleanup.cron.requests.some((r) => r.id === requestId && r.definitive));
  assert.equal(preservation.original, preservation.preserved);
  await assert.rejects(access(`${ready.output}/LATER_MAIN_ACTION_SHOULD_NOT_EXIST`));
  const result = { result: "passed", signal: "SIGTERM", childOutput: ready.output, queuedEventRequestId: requestId,
    oneWorkerInFlightAndAnotherQueued: true, noRestoreBeforeDefinitiveResponses: true, lateQueueEventFenced: true,
    noLaterMainAction: true, restored: cleanup.restored, recordedRequests: cleanup.cron.requests.length, preservation };
  await writeFile(`${output}/evidence.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, output }, null, 2));
} finally {
  if (paused) execFileSync("docker", ["exec", "supabase_db_crewflow-demo-20261012", "kill", "-CONT", String(netPid)]);
  if (lock) { lock.stdin.end("rollback;\n"); await new Promise((resolve) => lock.once("exit", resolve)); }
  if (exitCode === null) { child.kill("SIGTERM"); await new Promise((resolve) => child.once("exit", resolve)); }
  await writeFile(`${output}/child.log`, childLog);
}
