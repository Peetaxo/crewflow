import assert from "node:assert/strict";
import { definitiveWorkerResponse } from "./invoice-worker-test-lifecycle.mjs";
const quiescenceError = (rows = []) =>
  Object.assign(new Error("cron_worker_quiescence_unconfirmed"), {
    outstandingRequests: rows.map((row) => ({
      id: row.id,
      queued: row.queued,
      status: row.status_code,
      timedOut: Boolean(row.timed_out),
      transportError: Boolean(row.error_msg),
    })),
  });
const pause = () => new Promise((resolve) => setTimeout(resolve, 100));
export const createInvoiceCronTracker = ({ query, run, record }) => {
  const table = `invoice_pdf_test_${run.replaceAll("-", "")}`;
  assert.match(table, /^invoice_pdf_test_[a-f0-9]{32}$/);
  let initialized = false;
  let fenced = false;
  let drained = false;
  const jobIds = new Set();
  const normalize = (sql) => sql.replace(/\s+/g, " ").trim();
  const expectedCommand = "select private.dispatch_invoice_billing_jobs();";
  const verifyFence = async () => {
    const rows = await query(
      "select not enabled dispatch_disabled,not exists(select 1 from cron.job where jobname='crewflow-invoice-pdfs') cron_absent from private.invoice_worker_dispatch_control where id=1",
    );
    assert.equal(rows[0]?.dispatch_disabled, true, "Fence event dispatch before drain");
    assert.equal(rows[0]?.cron_absent, true, "Stop Cron before drain");
  };
  const tracker = {
    table,
    async initialize() {
      await record({
        table,
        controlTable: `${table}_control`,
        recorderFunction: `${table}_capture`,
        recorderTrigger: `${table}_capture`,
        dispatchControl: "private.invoice_worker_dispatch_control",
        jobName: "crewflow-invoice-pdfs",
      });
      await query(
        `BEGIN;DO $init$ DECLARE active boolean; BEGIN
 select enabled into strict active from private.invoice_worker_dispatch_control where id=1 for update;
 if active then raise exception 'Disable event dispatch before installing test recorder';end if;
 if exists(select 1 from cron.job where jobname='crewflow-invoice-pdfs') then raise exception 'Stop Cron before installing test recorder';end if;
 create table private.${table}(request_id bigint primary key,transaction_id xid8 not null,created_at timestamptz not null default clock_timestamp());
 create table private.${table}_control(id integer primary key check(id=1),enabled boolean not null);
 insert into private.${table}_control values(1,true);
 revoke all on private.${table},private.${table}_control from public,anon,authenticated,service_role;
 END $init$;
 create function private.${table}_capture() returns trigger language plpgsql security definer set search_path='' as $capture$
 begin insert into private.${table}(request_id,transaction_id) values(new.last_request_id,pg_current_xact_id());return null;end $capture$;
 revoke all on function private.${table}_capture() from public,anon,authenticated,service_role;
 create trigger ${table}_capture after update of last_request_id on private.invoice_worker_dispatch_control
 for each row when (new.last_request_id is not null and old.last_request_id is distinct from new.last_request_id)
 execute function private.${table}_capture();COMMIT;`,
      );
      initialized = true;
    },
    async schedule(source) {
      assert.ok(initialized);
      const body = source.match(/\$schedule\$([\s\S]*?)\$schedule\$/)?.[1];
      assert.ok(body, "Expected reviewed schedule body");
      assert.equal(normalize(body), expectedCommand, "Run the reviewed helper literally");
      await query(source);
      const rows = await query("select jobid::text,command,schedule from cron.job where jobname='crewflow-invoice-pdfs'");
      assert.equal(rows.length, 1);
      assert.equal(rows[0].schedule, "0 * * * *");
      assert.equal(normalize(rows[0].command), expectedCommand);
      jobIds.add(rows[0].jobid);
      return rows[0];
    },
    async stop() {
      // This row lock also fences late event/Cron dispatch transactions before
      // their run log exists. Disable events before touching the test fence.
      await query(`DO $fence$ BEGIN update private.invoice_worker_dispatch_control set enabled=false where id=1;${initialized ? `update private.${table}_control set enabled=false where id=1;` : ""}END $fence$;`);
      const rows = await query(
        "select jobid::text,command from cron.job where jobname='crewflow-invoice-pdfs'",
      );
      for (const row of rows) {
        assert.ok(
          jobIds.has(row.jobid) && normalize(row.command) === expectedCommand,
          "Refuse to stop a different schedule",
        );
        jobIds.add(row.jobid);
        await query(`select cron.unschedule(${Number(row.jobid)})`);
      }
      const deadline = Date.now() + 60000;
      while (jobIds.size) {
        const rows = await query(
          `select count(*)::integer active from cron.job_run_details where jobid in(${
            [...jobIds].map(Number).join(",")
          }) and status not in('succeeded','failed')`,
        );
        if (rows[0].active === 0) break;
        if (Date.now() > deadline) {
          throw new Error(
            "cron_command_quiescence_unconfirmed",
          );
        }
        await pause();
      }
      await verifyFence();
      fenced = true;
    },
    async drain() {
      assert.ok(fenced, "Stop and fence Cron before collecting request IDs");
      await verifyFence();
      if (!initialized) {
        return {
          fenced: true,
          activeCronCommands: 0,
          requests: [],
          ledgerTable: table,
          eventDispatch: { disabled: true, fenced: true },
        };
      }
      const deadline = Date.now() + 60000;
      while (true) {
        const rows = await query(
          `select t.request_id::text id,(q.id is not null) queued,r.status_code,r.timed_out,r.error_msg,r.content from private.${table} t left join net.http_request_queue q on q.id=t.request_id left join net._http_response r on r.id=t.request_id order by t.request_id`,
        );
        const complete = [];
        let pending = false;
        for (const row of rows) {
          if (row.queued || row.status_code == null) {
            if (row.timed_out || row.error_msg) {
              throw quiescenceError(rows);
            }
            pending = true;
            continue;
          }
          let body;
          try {
            body = JSON.parse(row.content);
          } catch {
            throw quiescenceError(rows);
          }
          if (
            row.timed_out || row.error_msg ||
            !definitiveWorkerResponse(row.status_code, body)
          ) throw quiescenceError(rows);
          complete.push({
            id: row.id,
            status: row.status_code,
            definitive: true,
          });
        }
        if (!pending) {
          await verifyFence();
          drained = true;
          return {
            fenced: true,
            activeCronCommands: 0,
            requests: complete,
            ledgerTable: table,
            eventDispatch: { disabled: true, fenced: true },
          };
        }
        if (Date.now() > deadline) {
          throw quiescenceError(rows);
        }
        await pause();
      }
    },
    async drop() {
      if (initialized) {
        assert.ok(fenced && drained, "Drain every event/Cron request before dropping its recorder");
        await query(`DO $drop$ DECLARE active boolean; BEGIN
 select enabled into strict active from private.invoice_worker_dispatch_control where id=1 for update;
 if active then raise exception 'Disable event dispatch before dropping recorder';end if;
 drop trigger ${table}_capture on private.invoice_worker_dispatch_control;
 drop function private.${table}_capture();
 drop table private.${table},private.${table}_control;END $drop$;`);
        initialized = false;
      }
    },
  };
  return tracker;
};
