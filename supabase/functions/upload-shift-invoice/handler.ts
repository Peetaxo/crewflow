import {
  assertSameUpload,
  isUuid,
  readInvoicePdfForm,
  sha256,
  UploadError,
  validateInvoicePdf,
} from "../_shared/invoice-pdf-upload.ts";

type Receipt = { attachment_id: string };
type Preflight = { eligible: boolean; customer_id: string | null };
type StoredPdf = { bytes: Uint8Array; fingerprint: string };

export type Registration = {
  p_user_id: string;
  p_timelog_ids: string[];
  p_customer_id: string;
  p_request_id: string;
  p_storage_path: string;
  p_sha256: string;
  p_byte_size: number;
  p_invoice_number: string;
  p_issue_date: string;
  p_due_date: string;
  p_total_amount: number;
};

export interface ShiftInvoiceUploadStore {
  findUpload(userId: string, requestId: string): Promise<Receipt | null>;
  preflight(timelogIds: string[]): Promise<Preflight>;
  upload(path: string, bytes: Uint8Array, fingerprint: string): Promise<boolean>;
  readObject(path: string): Promise<StoredPdf | null>;
  register(payload: Registration): Promise<Receipt>;
}

type Authorize = (
  authorization: string,
  token: string,
) => Promise<{ userId: string; store: ShiftInvoiceUploadStore } | null>;

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

const parseTimelogIds = (value: string): string[] => {
  let values: unknown;
  try {
    values = JSON.parse(value);
  } catch {
    throw new UploadError("invoice_billing_id_invalid");
  }
  if (
    !Array.isArray(values) || values.length === 0 ||
    !values.every((id) => typeof id === "string" && isUuid(id))
  ) throw new UploadError("invoice_billing_id_invalid");
  const normalized = values.map((id: string) => id.toLowerCase()).sort();
  if (new Set(normalized).size !== normalized.length) {
    throw new UploadError("invoice_billing_id_invalid");
  }
  return normalized;
};

const parseUpload = async (request: Request, userId: string) => {
  const { file, field } = await readInvoicePdfForm(request);
  const requestId = field("requestId").toLowerCase();
  const customerId = field("customerId").toLowerCase();
  if (!isUuid(requestId) || !isUuid(customerId)) {
    throw new UploadError("invoice_billing_id_invalid");
  }
  const timelogIds = parseTimelogIds(field("timelogIds"));
  const invoiceNumber = field("invoiceNumber").trim();
  const issueDate = field("issueDate");
  const dueDate = field("dueDate");
  const amount = field("totalAmount").trim();
  if (
    [...invoiceNumber].length > 120 || invoiceNumber.includes("\0") ||
    !/^0*\d{1,10}(?:\.\d{1,2})?$/.test(amount)
  ) throw new UploadError("invoice_billing_document_metadata_invalid");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const invalid = validateInvoicePdf({
    invoiceNumber,
    issueDate,
    dueDate,
    contentType: file.type,
    bytes,
  });
  if (invalid) throw new UploadError(invalid);
  const payload: Registration = {
    p_user_id: userId,
    p_timelog_ids: timelogIds,
    p_customer_id: customerId,
    p_request_id: requestId,
    // The request reserves the statement ID so older clients can read the promoted PDF.
    p_storage_path: `billing-statements/${requestId}/documents/${requestId}.pdf`,
    p_sha256: await sha256(bytes),
    p_byte_size: bytes.byteLength,
    p_invoice_number: invoiceNumber,
    p_issue_date: issueDate,
    p_due_date: dueDate,
    p_total_amount: Number(amount),
  };
  return { bytes, payload };
};

const saveUpload = async (
  bytes: Uint8Array,
  payload: Registration,
  store: ShiftInvoiceUploadStore,
): Promise<Receipt> => {
  const {
    p_user_id: userId,
    p_request_id: requestId,
    p_customer_id: customerId,
    p_timelog_ids: timelogIds,
    p_storage_path: path,
    p_sha256: hash,
  } = payload;
  const fingerprint = await sha256(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  if (!await store.findUpload(userId, requestId)) {
    const preflight = await store.preflight(timelogIds);
    if (preflight.eligible && preflight.customer_id === customerId) {
      if (await store.upload(path, bytes, fingerprint)) {
        return store.register(payload);
      }
    } else if (!await store.findUpload(userId, requestId)) {
      // A concurrent retry may have registered before the hours advanced.
      throw new UploadError("shift_invoice_attachment_not_eligible", 409);
    }
  }
  // A storage write can succeed after its response is lost. Recover the exact
  // request without replacing the object or adopting different metadata.
  const object = await store.readObject(path);
  if (!object) {
    throw new UploadError("invoice_billing_upload_retry_required", 503);
  }
  assertSameUpload([hash, bytes.byteLength, fingerprint], [
    await sha256(object.bytes),
    object.bytes.byteLength,
    object.fingerprint,
  ]);
  return store.register(payload);
};

export const handleShiftInvoiceUpload = async (
  request: Request,
  authorize: Authorize,
): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }
  const authorization = request.headers.get("Authorization");
  const token = authorization?.match(/^Bearer (\S+)$/i)?.[1];
  if (!authorization || !token) {
    return json({ error: "invoice_billing_unauthorized" }, 401);
  }
  try {
    const session = await authorize(authorization, token);
    if (!session || !isUuid(session.userId)) {
      return json({ error: "invoice_billing_unauthorized" }, 401);
    }
    const upload = await parseUpload(request, session.userId.toLowerCase());
    const receipt = await saveUpload(upload.bytes, upload.payload, session.store);
    return json({ attachment_id: receipt.attachment_id });
  } catch (error) {
    if (error instanceof UploadError) {
      return json({ error: error.code }, error.status);
    }
    const dbError = error as { code?: string; message?: string } | null;
    switch (dbError?.message) {
      case "shift_invoice_attachment_not_eligible":
        return json({ error: dbError.message }, 409);
      case "invoice_billing_request_reuse":
        return json({ error: dbError.message }, 409);
      case "invoice_billing_document_invalid":
        return json({ error: "invoice_billing_document_metadata_invalid" }, 400);
    }
    if (dbError?.code === "42501") {
      return json({ error: "invoice_billing_unauthorized" }, 403);
    }
    return json({ error: "invoice_billing_upload_retry_required" }, 503);
  }
};
