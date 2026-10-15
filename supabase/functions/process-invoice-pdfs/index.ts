import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";
import {
  type InvoiceItem,
  renderInvoicePdf,
} from "../generate-invoice-pdf/invoice-pdf.ts";
import { isWorkerAuthorized, runInvoicePdfJobs } from "./worker.ts";
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
Deno.serve(async (request) => {
  const secret = Deno.env.get("INVOICE_PDF_WORKER_SECRET") ?? "";
  if (!isWorkerAuthorized(request.headers.get("Authorization"), secret)) {
    return json({ error: "unauthorized" }, 401);
  }
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "worker_not_configured" }, 500);
  const service = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const result = await service.rpc(name, args);
    if (result.error) throw result.error;
    return result.data;
  };
  try {
    const result = await runInvoicePdfJobs({
      claim: async () =>
        (await rpc("claim_invoice_billing_jobs", { p_limit: 1 })).jobs[0] ??
          null,
      process: async (job) =>
        rpc("process_invoice_billing_job", {
          p_job_id: job.id,
          p_lease_token: job.lease_token,
        }),
      render: async (job) =>
        renderInvoicePdf({
          invoice: job.invoice,
          items: job.items as InvoiceItem[],
        }),
      upload: async (path, bytes) => {
        const result = await service.storage.from("invoice-pdfs").upload(
          path,
          bytes,
          { contentType: "application/pdf", upsert: true },
        );
        if (result.error) throw result.error;
      },
      complete: async (job, path, error) =>
        rpc("complete_invoice_billing_job", {
          p_job_id: job.id,
          p_lease_token: job.lease_token,
          p_pdf_path: path,
          p_error: error,
        }),
    });
    return json(result);
  } catch {
    return json({ error: "invoice_billing_worker_retry_required" }, 503);
  }
});
