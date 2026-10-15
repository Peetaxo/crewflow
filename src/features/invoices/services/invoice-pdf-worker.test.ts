import { describe, expect, it } from "vitest";
import {
  isWorkerAuthorized,
  runInvoicePdfJobs,
} from "../../../../supabase/functions/process-invoice-pdfs/worker";
import { loadAllInvoiceItems } from "../../../../supabase/functions/generate-invoice-pdf/request";
describe("bounded durable PDF worker", () => {
  it("rejects absent, browser and wrong credentials", () => {
    expect(isWorkerAuthorized(null, "secret")).toBe(false);
    expect(isWorkerAuthorized("Bearer anon", "secret")).toBe(false);
    expect(isWorkerAuthorized("Bearer secret", "")).toBe(false);
    expect(isWorkerAuthorized("Bearer secret", "secret")).toBe(true);
  });
  it("claims one at a time and stops immediately after one PDF", async () => {
    let claims = 0;
    let renders = 0;
    const complete: unknown[] = [];
    const result = await runInvoicePdfJobs({
      claim: async () => ({ id: String(++claims), lease_token: "lease" }),
      process: async (job) =>
        job.id === "1" ? { status: "completed" } : {
          status: "render",
          invoice: { id: "same" },
          items: [],
          pdf_path: "invoices/same.pdf",
        },
      render: async () => {
        renders++;
        return new Uint8Array([1]);
      },
      upload: async () => {},
      complete: async (...args) => {
        complete.push(args);
        return { status: "completed" };
      },
    });
    expect(claims).toBe(2);
    expect(renders).toBe(1);
    expect(complete[0]).toEqual([
      { id: "2", lease_token: "lease" },
      "invoices/same.pdf",
      null,
    ]);
    expect(result.rendered).toBe(1);
  });
  it("persists a render failure against the same leased invoice", async () => {
    const calls: unknown[] = [];
    const result = await runInvoicePdfJobs({
      claim: async () => ({ id: "same-job", lease_token: "same-lease" }),
      process: async () => ({
        status: "render",
        invoice: { id: "same-invoice" },
        items: [],
        pdf_path: "invoices/same-invoice.pdf",
      }),
      render: async () => {
        throw new Error("private detail");
      },
      upload: async () => {},
      complete: async (...args) => {
        calls.push(args);
        return { status: "queued" };
      },
    });
    expect(calls).toEqual([[
      { id: "same-job", lease_token: "same-lease" },
      null,
      "pdf_render_or_upload_failed",
    ]]);
    expect(result.rendered).toBe(0);
  });
  it("bounds issue-only invocations to four leases", async () => {
    let claims = 0;
    await runInvoicePdfJobs({
      claim: async () => ({ id: String(++claims), lease_token: "lease" }),
      process: async () => ({ status: "completed" }),
      render: async () => new Uint8Array(),
      upload: async () => {},
      complete: async () => ({ status: "completed" }),
    });
    expect(claims).toBe(4);
  });
  it("loads every legacy item beyond the server row cap", async () => {
    const all = Array.from({ length: 1003 }, (_, id) => ({ id }));
    expect(
      await loadAllInvoiceItems(async (from, to) => all.slice(from, to + 1)),
    ).toEqual(all);
  });
});
