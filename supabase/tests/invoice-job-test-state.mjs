// Local-only durable crash recovery for temporary worker-test timer delays.
import assert from "node:assert/strict";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
const demo = "/Users/peetax/Projekty/.crewflow-demo-20261012";
export async function localQuery(sql, file) {
  await writeFile(file, sql, { mode: 0o600 });
  await chmod(file, 0o600);
  const raw = execFileSync("/opt/homebrew/bin/supabase", [
    "db",
    "query",
    "--local",
    "--workdir",
    demo,
    "--file",
    file,
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return raw.trim().startsWith("{") ? JSON.parse(raw).rows : [];
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
    }\nDo not restore without a successful drain receipt. If missing/blocked, leave timers delayed and stop/drain queued and in-flight workers first; see the worker README.\n`,
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
    `DO $timers$ DECLARE original jsonb:='${original}'::jsonb; item jsonb; current_row jsonb; changed integer:=0; BEGIN
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
  const active = await localQuery(
    "select count(*)::integer active from cron.job where jobname='crewflow-invoice-pdfs'",
    resolve(file, "../verify-cron-stopped.private.sql"),
  );
  assert.equal(active[0].active, 0, "Stop the schedule before restoration");
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
