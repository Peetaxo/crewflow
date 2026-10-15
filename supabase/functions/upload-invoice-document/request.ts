export const MAX_PDF_BYTES = 5 * 1024 * 1024;
export class UploadError extends Error {
  constructor(public code: string, public status = 400) {
    super(code);
  }
}
export type UploadInput = {
  requestId: string;
  statementId: string;
  expectedUpdatedAt: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  contentType: string;
  bytes: Uint8Array;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// PostgREST versions are UTC. Keep all six fractional digits; Date would lose microseconds.
export const versionKey = (value: string): string => {
  const match =
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(?:Z|\+00:00)$/.exec(
      value,
    );
  if (!match || !Number.isFinite(Date.parse(value))) {
    throw new UploadError("invoice_billing_version_invalid");
  }
  return `${match[1]}.${(match[2] ?? "").padEnd(6, "0")}Z`;
};
const realDate = (value: string) =>
  /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
export const validateInvoiceDocument = (
  input: UploadInput,
): { ok: true; value: UploadInput } | { ok: false; error: string } => {
  if (!uuid.test(input.requestId) || !uuid.test(input.statementId)) {
    return { ok: false, error: "invoice_billing_id_invalid" };
  }
  try {
    versionKey(input.expectedUpdatedAt);
  } catch {
    return { ok: false, error: "invoice_billing_version_invalid" };
  }
  if (input.contentType !== "application/pdf") {
    return { ok: false, error: "invoice_billing_pdf_type_invalid" };
  }
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_PDF_BYTES) {
    return { ok: false, error: "invoice_billing_pdf_size_invalid" };
  }
  if (new TextDecoder().decode(input.bytes.subarray(0, 5)) !== "%PDF-") {
    return { ok: false, error: "invoice_billing_pdf_header_invalid" };
  }
  if (
    !input.invoiceNumber.trim() || !realDate(input.issueDate) ||
    !realDate(input.dueDate) || input.dueDate < input.issueDate
  ) return { ok: false, error: "invoice_billing_document_metadata_invalid" };
  return {
    ok: true,
    value: {
      ...input,
      requestId: input.requestId.toLowerCase(),
      statementId: input.statementId.toLowerCase(),
      invoiceNumber: input.invoiceNumber.trim(),
    },
  };
};
export type Statement = {
  id?: string;
  contractor_user_id: string;
  updated_at: string;
  status: string;
  total_amount?: number;
  superseded_by_statement_id?: string | null;
};
export const assertUploadAllowed = (
  statement: Statement,
  userId: string,
  ownerCrew: boolean,
  expected: string,
) => {
  if (!ownerCrew || statement.contractor_user_id !== userId) {
    throw new UploadError("invoice_billing_unauthorized", 403);
  }
  if (versionKey(statement.updated_at) !== versionKey(expected)) {
    throw new UploadError("invoice_billing_conflict", 409);
  }
  if (
    statement.superseded_by_statement_id ||
    !["ready", "document_returned"].includes(statement.status)
  ) throw new UploadError("invoice_billing_not_ready", 409);
};
export const assertSameUpload = (expected: unknown, actual: unknown) => {
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new UploadError("invoice_billing_request_reuse", 409);
  }
};
export const sha256 = async (bytes: Uint8Array): Promise<string> =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes as BufferSource),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
// Also bound chunked bodies before multipart parsing can allocate an unbounded file.
export const readBoundedMultipart = async (
  request: Request,
): Promise<FormData> => {
  if (!request.body) throw new UploadError("invoice_billing_multipart_invalid");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_PDF_BYTES + 64 * 1024) {
        await reader.cancel();
        throw new UploadError("invoice_billing_pdf_size_invalid", 413);
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Response(body, {
    headers: { "Content-Type": request.headers.get("Content-Type") ?? "" },
  }).formData();
};
