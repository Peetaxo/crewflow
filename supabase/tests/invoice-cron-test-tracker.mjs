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
  const jobIds = new Set();
  const tracker = {
    table,
    async initialize() {
      await record({
        table,
        controlTable: `${table}_control`,
        jobName: "crewflow-invoice-pdfs",
      });
      await query(
        `DO $init$ BEGIN create table private.${table}(request_id bigint primary key,created_at timestamptz not null default clock_timestamp());create table private.${table}_control(id integer primary key check(id=1),enabled boolean not null);insert into private.${table}_control values(1,true);END $init$;`,
      );
      initialized = true;
    },
    async schedule(source) {
      assert.ok(initialized);
      const body = source.match(/\$schedule\$([\s\S]*?)\$schedule\$/)?.[1];
      assert.ok(body, "Expected reviewed schedule body");
      const capture = body.replace(
        "select net.http_post(",
        `insert into private.${table}(request_id) select net.http_post(`,
      );
      assert.notEqual(capture, body);
      // The same row lock fences an already-dispatched command even before its run log exists.
      const command =
        `DO $invoke$ DECLARE active boolean; BEGIN select enabled into strict active from private.${table}_control where id=1 for update;if active then ${capture} end if;END $invoke$;`;
      const sql = source.replace(body, command);
      await query(sql);
    },
    async stop() {
      const rows = await query(
        "select jobid::text,command from cron.job where jobname='crewflow-invoice-pdfs'",
      );
      for (const row of rows) {
        assert.ok(
          row.command.includes(table),
          "Refuse to stop a different run schedule",
        );
        jobIds.add(row.jobid);
        await query(`select cron.unschedule(${Number(row.jobid)})`);
      }
      if (initialized) {
        await query(
          `update private.${table}_control set enabled=false where id=1`,
        );
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
      fenced = true;
    },
    async drain() {
      assert.ok(fenced, "Stop and fence Cron before collecting request IDs");
      if (!initialized) {
        return {
          fenced: true,
          activeCronCommands: 0,
          requests: [],
          ledgerTable: table,
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
          return {
            fenced: true,
            activeCronCommands: 0,
            requests: complete,
            ledgerTable: table,
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
        await query(`drop table private.${table},private.${table}_control`);
      }
    },
  };
  return tracker;
};
