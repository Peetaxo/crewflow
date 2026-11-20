import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";
import { isUuid, UploadError } from "../_shared/invoice-pdf-upload.ts";
import {
  handleShiftInvoiceUpload,
  type ShiftInvoiceUploadStore,
} from "./handler.ts";

const requireReceipt = (data: unknown): { attachment_id: string } => {
  if (
    typeof data !== "object" || data === null || !("attachment_id" in data) ||
    typeof data.attachment_id !== "string" || !isUuid(data.attachment_id)
  ) throw new UploadError("invoice_billing_upload_retry_required", 503);
  return { attachment_id: data.attachment_id };
};

Deno.serve((request) =>
  handleShiftInvoiceUpload(request, async (authorization, token) => {
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anon || !key) {
      throw new UploadError("invoice_billing_not_configured", 500);
    }
    const options = {
      auth: { persistSession: false, autoRefreshToken: false },
    };
    const caller = createClient(url, anon, {
      ...options,
      global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error } = await caller.auth.getUser(token);
    if (error || !user) return null;

    const service = createClient(url, key, options);
    const bucket = service.storage.from("invoice-pdfs");
    const store: ShiftInvoiceUploadStore = {
      async findUpload(userId, requestId) {
        const { data, error } = await service.rpc("get_shift_invoice_upload", {
          p_user_id: userId,
          p_request_id: requestId,
        });
        if (error) throw error;
        return data === null ? null : requireReceipt(data);
      },
      async preflight(timelogIds) {
        const { data, error } = await caller.rpc("get_shift_invoice_attachment", {
          p_timelog_ids: timelogIds,
        });
        if (error) throw error;
        if (!data) {
          throw new UploadError("invoice_billing_upload_retry_required", 503);
        }
        return data;
      },
      async upload(path, bytes, fingerprint) {
        const { error } = await bucket.upload(path, bytes, {
          contentType: "application/pdf",
          upsert: false,
          metadata: { uploadFingerprint: fingerprint },
        });
        // On a conflict or ambiguous failure, the handler verifies the stored object.
        return !error;
      },
      async readObject(path) {
        const [info, download] = await Promise.all([
          bucket.info(path),
          bucket.download(path),
        ]);
        if (info.error || download.error) return null;
        return {
          bytes: new Uint8Array(await download.data.arrayBuffer()),
          fingerprint: String(info.data.metadata?.uploadFingerprint ?? ""),
        };
      },
      async register(payload) {
        const { data, error } = await service.rpc(
          "register_shift_invoice_upload",
          payload,
        );
        if (error) throw error;
        return requireReceipt(data);
      },
    };
    return { userId: user.id, store };
  })
);
