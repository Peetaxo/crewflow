// Controlled localhost proof: one real queued pg_net request and one in-flight Edge claim.
import assert from "node:assert/strict";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync, spawn } from "node:child_process";
import { resolve } from "node:path";
import {
  delayJobTimers,
  localQuery,
  restoreJobTimers,
  snapshotJobTimers,
} from "./invoice-job-test-state.mjs";
import {
  createInvoiceTestLifecycle,
  InvoiceTestInterrupted,
} from "./invoice-worker-test-lifecycle.mjs";
import { createInvoiceCronTracker } from "./invoice-cron-test-tracker.mjs";
const childMode = process.argv[2] === "--child";
const dir = resolve(process.argv[childMode ? 4 : 2] ?? "");
const env = resolve(process.argv[childMode ? 5 : 3] ?? "");
const credentials = JSON.parse(
  await readFile(`${dir}/local-credentials.json`, "utf8"),
);
assert.equal(credentials.API_URL, "http://127.0.0.1:55321");
const secret = (await readFile(env, "utf8")).match(
  /^INVOICE_PDF_WORKER_SECRET=(.+)$/m,
)?.[1];
assert.ok(secret);
const output = childMode
  ? resolve(process.argv[3])
  : `${dir}/results/invoice-billing/interruption-${crypto.randomUUID()}`;
await mkdir(output, { recursive: true });
let queryNumber = 0;
const rawQuery = (sql) =>
  localQuery(sql, `${output}/query-${++queryNumber}.private.sql`);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
if (childMode) {
  const before = await snapshotJobTimers(output);
  const run = crypto.randomUUID();
  let tracker;
  const lifecycle = createInvoiceTestLifecycle({
    fetch: globalThis.fetch.bind(globalThis),
    stopSchedule: () => tracker.stop(),
    drainCron: () => tracker.drain(),
    record: async (evidence) => {
      const proof = { ...evidence, snapshotFile: before };
      await writeFile(
        `${output}/${
          evidence.stage === "drained"
            ? "worker-drain.private.json"
            : evidence.stage === "blocked"
            ? "cleanup-blocked.private.json"
            : evidence.stage === "restored"
            ? "cleanup.json"
            : "worker-stop.private.json"
        }`,
        JSON.stringify(proof, null, 2),
        { mode: 0o600 },
      );
      process.send?.({ stage: evidence.stage });
    },
    restore: async (proof) => {
      await tracker.drop();
      const restored = await restoreJobTimers(before, {
        ...proof,
        snapshotFile: before,
      });
      return restored;
    },
  });
  const query = async (sql) => {
    lifecycle.check();
    const rows = await rawQuery(sql);
    lifecycle.check();
    return rows;
  };
  tracker = createInvoiceCronTracker({
    query: rawQuery,
    run,
    record: async (manifest) =>
      writeFile(
        `${output}/cron-manifest.private.json`,
        JSON.stringify({ ...manifest, snapshotFile: before }),
        { mode: 0o600 },
      ),
  });
  process.on("SIGTERM", () => lifecycle.stop("SIGTERM"));
  process.on("SIGINT", () => lifecycle.stop("SIGINT"));
  try {
    await delayJobTimers(before);
    await tracker.initialize();
    await tracker.schedule(
      await readFile(
        new URL(
          "../functions/process-invoice-pdfs/schedule.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    process.send?.({ stage: "ready", table: tracker.table });
    await new Promise((resolve) => process.once("message", resolve));
    lifecycle.check();
    const direct = lifecycle.fetch(
      `${credentials.API_URL}/functions/v1/process-invoice-pdfs`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      },
    );
    direct.catch(() => {});
    // Execute the exact saved Cron command; request ID is durably captured in its private ledger.
    await query(
      `DO $queue$ DECLARE command text; BEGIN select j.command into strict command from cron.job j where j.jobname='crewflow-invoice-pdfs' and j.command like '%${tracker.table}%';execute command;END $queue$;`,
    );
    const rows = await query(
      `select request_id::text id from private.${tracker.table} order by request_id desc limit 1`,
    );
    process.send?.({ stage: "queued", requestId: rows[0].id });
    await direct;
    await writeFile(
      `${output}/LATER_MAIN_ACTION_SHOULD_NOT_EXIST`,
      "unexpected continuation",
    );
  } catch (error) {
    if (error instanceof InvoiceTestInterrupted || lifecycle.interrupted) {
      process.exitCode = 130;
    } else throw error;
  } finally {
    await lifecycle.cleanup();
    process.disconnect?.();
  }
} else {
  const schedule = await rawQuery(
    "select count(*)::integer count from cron.job where jobname='crewflow-invoice-pdfs'",
  );
  assert.equal(schedule[0].count, 0);
  const queue = await rawQuery(
    "select count(*)::integer count from net.http_request_queue",
  );
  assert.equal(queue[0].count, 0);
  const netRows = await rawQuery(
    "select pid::integer pid from pg_stat_activity where backend_type like 'pg_net%worker'",
  );
  assert.equal(netRows.length, 1);
  const netPid = netRows[0].pid;
  const child = spawn(process.execPath, [
    new URL(import.meta.url).pathname,
    "--child",
    output,
    dir,
    env,
  ], { stdio: ["ignore", "pipe", "pipe", "ipc"] });
  let childError = "";
  child.stderr.on("data", (bytes) => childError += bytes);
  const messages = [];
  child.on("message", (message) => messages.push(message));
  let exitCode = null;
  child.once("exit", (code) => exitCode = code);
  const until = async (predicate, label, timeout = 15000) => {
    const end = Date.now() + timeout;
    while (!await predicate()) {
      if (exitCode !== null) {
        throw new Error(`${label}: child exited ${exitCode}: ${childError}`);
      }
      if (Date.now() > end) throw new Error(`Timeout: ${label}`);
      await delay(50);
    }
  };
  let paused = false;
  let lock;
  let locked = false;
  const app = `invoice_cleanup_lock_${crypto.randomUUID().replaceAll("-", "")}`;
  await writeFile(
    `${output}/CONTROL-RECOVERY.txt`,
    `Local only. If interrupted: signal child PID ${child.pid} SIGTERM; resume pg_net with docker exec supabase_db_crewflow-demo-20261012 kill -CONT ${netPid}; terminate only the local backend with application_name ${app} if it remains. Keep fixture timers delayed until worker-drain.private.json confirms every HTTP result. Do not infer drain from timeout.\n`,
    { mode: 0o600 },
  );
  try {
    await until(
      () => messages.some((m) => m.stage === "ready"),
      "child snapshot/delay",
    );
    lock = spawn("docker", [
      "exec",
      "-i",
      "-e",
      "PGOPTIONS=-c session_preload_libraries=",
      "-e",
      `PGAPPNAME=${app}`,
      "supabase_db_crewflow-demo-20261012",
      "sh",
      "-c",
      'PGPASSWORD="$POSTGRES_PASSWORD" psql -XAt -v ON_ERROR_STOP=1 -U supabase_admin -d postgres',
    ], { stdio: ["pipe", "pipe", "pipe"] });
    let lockError = "";
    lock.stderr.on("data", (b) => lockError += b);
    lock.stdout.on("data", (b) => {
      if (b.toString().includes("LOCKED")) locked = true;
    });
    lock.stdin.write(
      "begin; lock table private.invoice_billing_jobs in access exclusive mode; select 'LOCKED';\n",
    );
    await until(() => locked, `table lock ${lockError}`);
    execFileSync("docker", [
      "exec",
      "supabase_db_crewflow-demo-20261012",
      "kill",
      "-STOP",
      String(netPid),
    ]);
    paused = true;
    child.send({ stage: "invoke" });
    await until(
      () => messages.some((m) => m.stage === "queued"),
      "real queued request",
    );
    const requestId = messages.find((m) => m.stage === "queued").requestId;
    await until(
      async () => {
        const rows = await rawQuery(
          "select count(*)::integer count from pg_stat_activity where pid<>pg_backend_pid() and wait_event_type='Lock' and query ilike '%claim_invoice_billing_jobs%'",
        );
        return rows[0].count >= 1;
      },
      "first actual Edge claim in flight",
      7000,
    );
    const pending = await rawQuery(
      `select exists(select 1 from net.http_request_queue where id=${
        Number(requestId)
      }) queued,(select count(*)::integer from pg_stat_activity where pid<>pg_backend_pid() and wait_event_type='Lock' and query ilike '%claim_invoice_billing_jobs%') in_flight`,
    );
    assert.equal(pending[0].queued, true);
    assert.ok(pending[0].in_flight >= 1);
    const scheduleCommand = (await rawQuery(
      "select command from cron.job where jobname='crewflow-invoice-pdfs'",
    ))[0].command;
    const ledgerTable = messages.find((message) =>
      message.stage === "ready"
    ).table;
    const ledgerBefore = (await rawQuery(
      `select count(*)::integer count from private.${ledgerTable}`,
    ))[0].count;
    child.kill("SIGTERM");
    await until(
      () => messages.some((m) => m.stage === "stopped"),
      "schedule stopped fence",
    );
    // Simulate a Cron command already dispatched before unschedule but delayed before execution.
    await rawQuery(scheduleCommand);
    const ledgerAfter = (await rawQuery(
      `select count(*)::integer count from private.${ledgerTable}`,
    ))[0].count;
    assert.equal(
      ledgerAfter,
      ledgerBefore,
      "A late dispatched Cron command must be fenced before ledger drain",
    );
    await assert.rejects(access(`${output}/cleanup.json`));
    const stillQueued = await rawQuery(
      `select count(*)::integer count from net.http_request_queue where id=${
        Number(requestId)
      }`,
    );
    assert.equal(stillQueued[0].count, 1);
    execFileSync("docker", [
      "exec",
      "supabase_db_crewflow-demo-20261012",
      "kill",
      "-CONT",
      String(netPid),
    ]);
    paused = false;
    await until(
      async () => {
        const r = await rawQuery(
          "select count(*)::integer count from pg_stat_activity where pid<>pg_backend_pid() and wait_event_type='Lock' and query ilike '%claim_invoice_billing_jobs%'",
        );
        return r[0].count >= 2;
      },
      "both actual Edge claims in flight",
      7000,
    );
    await assert.rejects(access(`${output}/cleanup.json`));
    lock.stdin.end("rollback;\n");
    await new Promise((resolve) => lock.once("exit", resolve));
    lock = null;
    await until(() => exitCode !== null, "child drained cleanup", 20000);
    assert.equal(exitCode, 130, childError);
    const proof = JSON.parse(await readFile(`${output}/cleanup.json`, "utf8"));
    assert.equal(proof.drained, true);
    assert.ok(proof.restored >= 20);
    assert.equal(proof.directWorkers.length, 1);
    assert.equal(proof.directWorkers[0].definitive, true);
    assert.ok(
      proof.cron.requests.some((r) => r.id === requestId && r.definitive),
    );
    await assert.rejects(
      access(`${output}/LATER_MAIN_ACTION_SHOULD_NOT_EXIST`),
    );
    const result = {
      result: "passed",
      signal: "SIGTERM",
      realQueuedRequestId: requestId,
      observedInFlightBeforeSignal: pending[0].in_flight,
      bothRequestsBlockedBeforeRelease: true,
      lateDispatchedCronCommandFenced: true,
      noRestorationBeforeDefinitiveResponses: true,
      noLaterMainAction: true,
      restored: proof.restored,
      directWorkers: proof.directWorkers,
      cron: proof.cron,
    };
    await writeFile(`${output}/evidence.json`, JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ ...result, output }, null, 2));
  } finally {
    if (paused) {
      execFileSync("docker", [
        "exec",
        "supabase_db_crewflow-demo-20261012",
        "kill",
        "-CONT",
        String(netPid),
      ]);
    }
    if (lock) {
      lock.stdin.end("rollback;\n");
      await new Promise((resolve) => lock.once("exit", resolve));
    }
    if (exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    }
  }
}
