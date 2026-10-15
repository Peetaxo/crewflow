import { describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInvoiceCronTracker } from "../../../../supabase/tests/invoice-cron-test-tracker.mjs";
import { restoreJobTimers } from "../../../../supabase/tests/invoice-job-test-state.mjs";
vi.mock("node:child_process", () => {
  const execFileSync = vi.fn();
  return { execFileSync, default: { execFileSync } };
});

const run = "11111111-2222-4333-8444-555555555555";
const schedule = `select cron.schedule('crewflow-invoice-pdfs','0 * * * *',$schedule$ select private.dispatch_invoice_billing_jobs(); $schedule$);`;
const command = "select private.dispatch_invoice_billing_jobs();";

describe("invoice event dispatch test safety", () => {
  it("records all successful dispatches at the private control row, without changing the saved fallback command", async () => {
    const statements: string[] = [];
    const tracker = createInvoiceCronTracker({
      run,
      record: async () => {},
      query: async (sql: string) => {
        statements.push(sql);
        return [{ jobid: "42", command, schedule: "0 * * * *" }];
      },
    });
    await tracker.initialize();
    expect(statements[0]).toContain("after update of last_request_id on private.invoice_worker_dispatch_control");
    expect(statements[0]).toContain("old.last_request_id is distinct from new.last_request_id");
    expect(statements[0]).not.toMatch(/trigger[^;]+on net\./i);
    await tracker.schedule(schedule);
    expect(statements).toContain(schedule);
    expect(statements.some((sql) => sql.includes("insert into") && sql.includes("net.http_post"))).toBe(false);
  });

  it("fences events before stopping Cron and returns the event fence in its drain receipt", async () => {
    const statements: string[] = [];
    const tracker = createInvoiceCronTracker({
      run,
      record: async () => {},
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes("dispatch_disabled")) return [{ dispatch_disabled: true, cron_absent: true }];
        if (sql.includes("from cron.job where")) return [];
        if (sql.includes("left join net.http_request_queue")) return [{ id: "9", queued: false, status_code: 200, content: '{"processed":1,"rendered":1}' }];
        return [];
      },
    });
    await tracker.initialize();
    const start = statements.length;
    await tracker.stop();
    expect(statements[start]).toContain("update private.invoice_worker_dispatch_control set enabled=false");
    const receipt = await tracker.drain();
    expect(receipt.eventDispatch).toEqual({ disabled: true, fenced: true });
    expect(receipt.requests).toEqual([{ id: "9", status: 200, definitive: true }]);
  });

  it("keeps an ambiguous actual dispatch response out of successful drain evidence", async () => {
    const tracker = createInvoiceCronTracker({
      run,
      record: async () => {},
      query: async (sql: string) => {
        if (sql.includes("dispatch_disabled")) return [{ dispatch_disabled: true, cron_absent: true }];
        if (sql.includes("from cron.job where")) return [];
        if (sql.includes("left join net.http_request_queue")) return [{ id: "10", queued: false, status_code: 503, content: '{"error":"invoice_billing_worker_retry_required"}' }];
        return [];
      },
    });
    await tracker.initialize();
    await tracker.stop();
    await expect(tracker.drain()).rejects.toThrow("quiescence_unconfirmed");
  });

  it("rejects a restore receipt without a fenced, disabled event dispatcher before opening the snapshot", async () => {
    await expect(restoreJobTimers("/missing/snapshot.json", {
      snapshotFile: "/missing/snapshot.json",
      quiescenceConfirmed: true,
      stopped: true,
      directWorkers: [],
      cron: { fenced: true, activeCronCommands: 0, requests: [] },
    })).rejects.toThrow("event dispatch");
  });

  it("locks all captured jobs before the dispatcher and checks its live fence inside the same restoration transaction", async () => {
    const dir = await mkdtemp(join(tmpdir(), "invoice-restore-"));
    const file = join(dir, "before.json");
    const jobs = [{ id: run, status: "queued", attempts: 1, available_at: "2026-10-15T10:00:00+00:00", locked_until: null }];
    await writeFile(file, JSON.stringify({ api: "http://127.0.0.1:55321", jobs }));
    vi.mocked(execFileSync).mockImplementation((_command, _args, options) => {
      const sql = String(options?.input);
      return sql.includes("select jsonb_agg") ? JSON.stringify([{ jobs }]) : "";
    });
    try {
      expect(await restoreJobTimers(file, {
        snapshotFile: file, quiescenceConfirmed: true, stopped: true, directWorkers: [],
        cron: { fenced: true, activeCronCommands: 0, requests: [] }, eventDispatch: { disabled: true, fenced: true },
      })).toBe(1);
      const sql = await readFile(join(dir, "restore-job-timers.private.sql"), "utf8");
      const jobsLock = sql.indexOf("order by j.id for update");
      const controlLock = sql.indexOf("from private.invoice_worker_dispatch_control where id=1 for update");
      const liveGuard = sql.indexOf("if active then raise exception");
      const mutation = sql.indexOf("update private.invoice_billing_jobs set available_at=");
      expect(jobsLock).toBeGreaterThan(0);
      expect(controlLock).toBeGreaterThan(jobsLock);
      expect(liveGuard).toBeGreaterThan(controlLock);
      expect(mutation).toBeGreaterThan(liveGuard);
      expect(sql).toContain("current_row-array['available_at','locked_until']");
      expect(sql).toContain("fixture job changed; abort timer mutation");
    } finally {
      await rm(dir, { recursive: true, force: true });
      vi.mocked(execFileSync).mockReset();
    }
  });
});
