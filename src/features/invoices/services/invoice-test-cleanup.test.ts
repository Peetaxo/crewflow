import { describe, expect, it } from "vitest";
import { createInvoiceTestLifecycle } from "../../../../supabase/tests/invoice-worker-test-lifecycle.mjs";
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => resolve = r);
  return { promise, resolve };
};
const workerResponse = () =>
  new Response(JSON.stringify({ processed: 0, rendered: 0 }), { status: 200 });
describe("invoice integration stop and drain barrier", () => {
  it("stops subsequent actions and restores only after direct and queued Cron workers complete", async () => {
    const direct = deferred<Response>();
    const cron = deferred<void>();
    const events: string[] = [];
    const lifecycle = createInvoiceTestLifecycle({
      fetch: async () => direct.promise,
      stopSchedule: async () => {
        events.push("unschedule");
      },
      drainCron: async () => {
        events.push("drain-cron");
        await cron.promise;
      },
      restore: async () => {
        events.push("restore");
        return 20;
      },
      record: async () => {},
    });
    const request = lifecycle.fetch(
      "http://127.0.0.1:55321/functions/v1/process-invoice-pdfs",
      { method: "POST" },
    ).catch((error: Error) => error);
    lifecycle.stop("SIGTERM");
    const cleanup = lifecycle.cleanup();
    await Promise.resolve();
    expect(events).not.toContain("restore");
    await expect(
      lifecycle.fetch("http://localhost/another-mutation", { method: "POST" }),
    ).rejects.toThrow("interrupted");
    direct.resolve(workerResponse());
    await request;
    await new Promise((r) => setTimeout(r, 0));
    expect(events).toEqual(["unschedule", "drain-cron"]);
    cron.resolve();
    expect(await cleanup).toMatchObject({ restored: 20, drained: true });
    expect(events).toEqual(["unschedule", "drain-cron", "restore"]);
    expect(lifecycle.cleanup()).toBe(cleanup);
  });
  it("keeps fixture timers delayed after an ambiguous worker timeout", async () => {
    let restored = false;
    const lifecycle = createInvoiceTestLifecycle({
      fetch: async () => {
        throw new TypeError("network timeout");
      },
      stopSchedule: async () => {},
      drainCron: async () => {},
      restore: async () => {
        restored = true;
      },
      record: async () => {},
    });
    await expect(
      lifecycle.fetch("http://localhost/functions/v1/process-invoice-pdfs", {
        method: "POST",
      }),
    ).rejects.toThrow("network timeout");
    await expect(lifecycle.cleanup()).rejects.toThrow("quiescence");
    expect(restored).toBe(false);
  });
});
