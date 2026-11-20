import {
  type InvoicePdfInput,
  isUuid,
  UploadError,
  validateInvoicePdf,
} from "../_shared/invoice-pdf-upload.ts";

export {
  assertSameUpload,
  MAX_PDF_BYTES,
  readBoundedMultipart,
  sha256,
  UploadError,
} from "../_shared/invoice-pdf-upload.ts";

export type UploadInput = InvoicePdfInput & {
  requestId: string;
  statementId: string;
  expectedUpdatedAt: string;
};
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
export const validateInvoiceDocument = (
  input: UploadInput,
): { ok: true; value: UploadInput } | { ok: false; error: string } => {
  if (!isUuid(input.requestId) || !isUuid(input.statementId)) {
    return { ok: false, error: "invoice_billing_id_invalid" };
  }
  try {
    versionKey(input.expectedUpdatedAt);
  } catch {
    return { ok: false, error: "invoice_billing_version_invalid" };
  }
  const error = validateInvoicePdf(input);
  if (error) return { ok: false, error };
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
