// Local-only durable crash recovery for temporary worker-test timer delays.
import assert from "node:assert/strict";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
export async function localQuery(sql, file) {
  const select = sql.replace(/^\s*(?:--[^\n]*(?:\n|$)\s*)*/, "").trim();
  const statement = /^select\b/i.test(select)
    ? `select coalesce(json_agg(row_to_json(result)),'[]'::json) from (${select.replace(/;\s*$/, "")}) result;`
    : sql;
  await writeFile(file, statement, { mode: 0o600 });
  await chmod(file, 0o600);
  // Credentials expand only inside the exact disposable local container. The
  // session option avoids the known local supautils revoked-EXECUTE crash hook.
  const raw = execFileSync("docker", [
    "exec", "-i", "-e", "PGOPTIONS=-c session_preload_libraries=",
    "supabase_db_crewflow-demo-20261012", "sh", "-c",
    'PGPASSWORD="$POSTGRES_PASSWORD" psql -XqAt -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -P pager=off',
  ], { input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
  return raw.trim() ? JSON.parse(raw) : [];
}
const rowsQuery =
  "select coalesce(jsonb_agg(to_jsonb(j) order by j.id),'[]') jobs from private.invoice_billing_jobs j where status in('queued','running')";
export async function snapshotJobTimers(directory) {
  const file = resolve(directory, "before-job-timers.private.json");
  const result = await localQuery(
    rowsQuery,
    resolve(directory, "snapshot-job-timers.private.sql"),
  );
  const jobs = result[0].jobs;
  await writeFile(
    file,
    JSON.stringify(
      {
        api: "http://127.0.0.1:55321",
        createdAt: new Date().toISOString(),
        jobs,
      },
      null,
      2,
    ),
    { mode: 0o600, flag: "wx" },
  );
  // Persist the independently runnable command before any delay happens.
  await writeFile(
    resolve(directory, "RESTORE.txt"),
    `node ${
      new URL(import.meta.url).pathname
    } restore ${file} /private/tmp/crewflow-demo-20261012 ${
      resolve(directory, "worker-drain.private.json")
    }\nDo not restore without a successful drain receipt for BOTH event and Cron dispatch. If missing/blocked, leave timers delayed, disable/fence event dispatch and Cron, then drain all queued/in-flight workers; see the worker README. The restore holds captured job locks, then the production control lock through its live disabled/Cron-absent checks and exact mutation.\n`,
    { mode: 0o600 },
  );
  return file;
}
async function mutateTimers(file, restore) {
  const snapshot = JSON.parse(await readFile(file, "utf8"));
  assert.equal(snapshot.api, "http://127.0.0.1:55321");
  const jobs = snapshot.jobs;
  for (const row of jobs) {
    assert.match(row.id, /^[\da-f-]{36}$/);
    assert.ok(["queued", "running"].includes(row.status));
    assert.ok(Number.isInteger(row.attempts));
  }
  const original = JSON.stringify(jobs).replaceAll("'", "''");
  const sql =
    `DO $timers$ DECLARE original jsonb:='${original}'::jsonb; item jsonb; current_row jsonb; changed integer:=0; active boolean; BEGIN
 perform j.id from private.invoice_billing_jobs j where j.id in(select (value->>'id')::uuid from jsonb_array_elements(original)) order by j.id for update;
 select enabled into strict active from private.invoice_worker_dispatch_control where id=1 for update;
 if active then raise exception 'Disable event dispatch before timer mutation';end if;
 if exists(select 1 from cron.job where jobname='crewflow-invoice-pdfs') then raise exception 'Stop Cron before timer mutation';end if;
 for item in select value from jsonb_array_elements(original) loop
  select to_jsonb(j) into current_row from private.invoice_billing_jobs j where id=(item->>'id')::uuid for update;
  if current_row is null or ${
      restore
        ? "(current_row-array['available_at','locked_until']) is distinct from (item-array['available_at','locked_until'])"
        : "current_row is distinct from item"
    } then raise exception 'fixture job changed; abort timer mutation';end if;
  update private.invoice_billing_jobs set available_at=${
      restore
        ? "(item->>'available_at')::timestamptz"
        : "'infinity'::timestamptz"
    },locked_until=${
      restore
        ? "(item->>'locked_until')::timestamptz"
        : "case when status='running' then 'infinity'::timestamptz else locked_until end"
    } where id=(item->>'id')::uuid;
  changed:=changed+1;
 end loop;
 if changed<>jsonb_array_length(original) then raise exception 'wrong fixture count';end if;
 END $timers$;`;
  await localQuery(
    sql,
    resolve(
      file,
      restore
        ? "../restore-job-timers.private.sql"
        : "../delay-job-timers.private.sql",
    ),
  );
  if (restore) {
    const ids = jobs.map((j) => `'${j.id}'::uuid`).join(",");
    const actual = jobs.length
      ? (await localQuery(
        `select jsonb_agg(to_jsonb(j) order by j.id) jobs from private.invoice_billing_jobs j where id in(${ids})`,
        resolve(file, "../verify-restored-job-timers.private.sql"),
      ))[0].jobs
      : [];
    assert.deepEqual(actual, jobs);
  }
  return jobs.length;
}
export const delayJobTimers = (file) => mutateTimers(file, false);
export const restoreJobTimers = async (file, proof) => {
  assert.equal(
    proof?.snapshotFile,
    file,
    "A drain receipt for this exact snapshot is required",
  );
  assert.equal(
    proof?.quiescenceConfirmed,
    true,
    "Stop and drain workers before restoring timers",
  );
  assert.equal(proof?.stopped, true);
  assert.ok(proof.directWorkers.every((worker) => worker.definitive));
  assert.equal(proof.cron?.fenced, true);
  assert.equal(proof.cron?.activeCronCommands, 0);
  assert.ok(proof.cron.requests.every((request) => request.definitive));
  assert.equal(proof.eventDispatch?.disabled, true, "Disable event dispatch before restoration");
  assert.equal(proof.eventDispatch?.fenced, true, "Fence event dispatch before restoration");
  return mutateTimers(file, true);
};
if (
  process.argv[1] &&
  resolve(process.argv[1]) === new URL(import.meta.url).pathname
) {
  assert.equal(process.argv[2], "restore");
  const credentials = JSON.parse(
    await readFile(`${process.argv[4]}/local-credentials.json`, "utf8"),
  );
  assert.equal(credentials.API_URL, "http://127.0.0.1:55321");
  console.log(
    `Restored ${await restoreJobTimers(
      resolve(process.argv[3]),
      JSON.parse(await readFile(process.argv[5], "utf8")),
    )} exact captured local job rows.`,
  );
}
