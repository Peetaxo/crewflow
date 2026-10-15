import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";
import { MAX_PDF_BYTES, readBoundedMultipart, UploadError } from "./request.ts";
import { saveInvoiceDocument, type UploadStore } from "./upload.ts";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }
  const authorization = request.headers.get("Authorization");
  const token = authorization?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return json({ error: "invoice_billing_unauthorized" }, 401);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anon || !key) {
      return json({ error: "invoice_billing_not_configured" }, 500);
    }
    const options = {
      auth: { persistSession: false, autoRefreshToken: false },
    };
    const caller = createClient(url, anon, {
      ...options,
      global: { headers: { Authorization: authorization! } },
    });
    const auth = await caller.auth.getUser(token);
    if (auth.error || !auth.data.user) {
      return json({ error: "invoice_billing_unauthorized" }, 401);
    }
    // Bound multipart parsing too; byte length below remains authoritative.
    const length = Number(request.headers.get("content-length"));
    if (length > MAX_PDF_BYTES + 64 * 1024) {
      return json({ error: "invoice_billing_pdf_size_invalid" }, 413);
    }
    let form: FormData;
    try {
      form = await readBoundedMultipart(request);
    } catch (error) {
      if (error instanceof UploadError) throw error;
      return json({ error: "invoice_billing_multipart_invalid" }, 400);
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      return json({ error: "invoice_billing_pdf_missing" }, 400);
    }
    if (file.size > MAX_PDF_BYTES) {
      return json({ error: "invoice_billing_pdf_size_invalid" }, 413);
    }
    const field = (name: string) => {
      const values = form.getAll(name);
      if (values.length !== 1 || typeof values[0] !== "string") {
        throw new UploadError("invoice_billing_multipart_invalid");
      }
      return values[0];
    };
    if (form.getAll("file").length !== 1) {
      throw new UploadError("invoice_billing_multipart_invalid");
    }
    const service = createClient(url, key, options);
    const bucket = service.storage.from("invoice-pdfs");
    const store: UploadStore = {
      async loadOwnedStatement(id, userId) {
        const [statement, profile, role] = await Promise.all([
          caller.from("invoice_billing_statements").select("*").eq("id", id)
            .maybeSingle(),
          caller.from("profiles").select("id,user_id").eq("user_id", userId)
            .maybeSingle(),
          caller.rpc("has_role", { _user_id: userId, _role: "crew" }),
        ]);
        if (statement.error || profile.error || role.error) {
          throw statement.error ?? profile.error ?? role.error;
        }
        if (
          !statement.data || !profile.data || role.data !== true ||
          statement.data.contractor_id !== profile.data.id ||
          statement.data.contractor_user_id !== userId
        ) throw new UploadError("invoice_billing_unauthorized", 403);
        return statement.data;
      },
      async findDocument(id) {
        const result = await caller.from("invoice_billing_documents").select(
          "*",
        ).eq("request_id", id).maybeSingle();
        if (result.error) throw result.error;
        return result.data;
      },
      async upload(path, bytes, fingerprint) {
        const result = await bucket.upload(path, bytes, {
          contentType: "application/pdf",
          upsert: false,
          metadata: { uploadFingerprint: fingerprint },
        });
        // A lost response may still have committed: inspect immutable object before deciding to retry.
        return !result.error;
      },
      async readObject(path) {
        const [info, download] = await Promise.all([
          bucket.info(path),
          bucket.download(path),
        ]);
        if (info.error || download.error) {
          throw new UploadError("invoice_billing_upload_retry_required", 503);
        }
        return {
          bytes: new Uint8Array(await download.data.arrayBuffer()),
          fingerprint: String(info.data.metadata?.uploadFingerprint ?? ""),
        };
      },
      async register(payload) {
        const result = await service.rpc(
          "register_invoice_billing_document",
          payload,
        );
        if (result.error) throw result.error;
        return result.data;
      },
    };
    return json(
      await saveInvoiceDocument(
        {
          requestId: field("requestId"),
          statementId: field("statementId"),
          expectedUpdatedAt: field("expectedUpdatedAt"),
          invoiceNumber: field("invoiceNumber"),
          issueDate: field("issueDate"),
          dueDate: field("dueDate"),
          contentType: file.type,
          bytes: new Uint8Array(await file.arrayBuffer()),
        },
        auth.data.user.id,
        store,
      ),
    );
  } catch (error) {
    if (error instanceof UploadError) {
      return json({ error: error.code }, error.status);
    }
    const code = typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
    const status = code === "PT409" || code === "23505"
      ? 409
      : code === "42501"
      ? 403
      : code === "22023"
      ? 400
      : 503;
    return json({
      error: status === 503
        ? "invoice_billing_upload_retry_required"
        : (error as { message?: string }).message ??
          "invoice_billing_document_invalid",
    }, status);
  }
});
