export const MAX_PDF_BYTES = 5 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_PDF_BYTES + 64 * 1024;

export class UploadError extends Error {
  constructor(public code: string, public status = 400) {
    super(code);
  }
}

export type InvoicePdfInput = {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  contentType: string;
  bytes: Uint8Array;
};

export const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const realDate = (value: string) =>
  /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export const validateInvoicePdf = (input: InvoicePdfInput): string | null => {
  if (input.contentType !== "application/pdf") {
    return "invoice_billing_pdf_type_invalid";
  }
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_PDF_BYTES) {
    return "invoice_billing_pdf_size_invalid";
  }
  if (new TextDecoder().decode(input.bytes.subarray(0, 5)) !== "%PDF-") {
    return "invoice_billing_pdf_header_invalid";
  }
  if (
    !input.invoiceNumber.trim() || !realDate(input.issueDate) ||
    !realDate(input.dueDate) || input.dueDate < input.issueDate
  ) return "invoice_billing_document_metadata_invalid";
  return null;
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
      if (size > MAX_MULTIPART_BYTES) {
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

export const readInvoicePdfForm = async (request: Request) => {
  if (Number(request.headers.get("content-length")) > MAX_MULTIPART_BYTES) {
    throw new UploadError("invoice_billing_pdf_size_invalid", 413);
  }
  let form: FormData;
  try {
    form = await readBoundedMultipart(request);
  } catch (error) {
    if (error instanceof UploadError) throw error;
    throw new UploadError("invoice_billing_multipart_invalid");
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    throw new UploadError("invoice_billing_pdf_missing");
  }
  if (file.size > MAX_PDF_BYTES) {
    throw new UploadError("invoice_billing_pdf_size_invalid", 413);
  }
  if (form.getAll("file").length !== 1) {
    throw new UploadError("invoice_billing_multipart_invalid");
  }
  const field = (name: string) => {
    const values = form.getAll(name);
    if (values.length !== 1 || typeof values[0] !== "string") {
      throw new UploadError("invoice_billing_multipart_invalid");
    }
    return values[0];
  };
  return { file, field };
};
