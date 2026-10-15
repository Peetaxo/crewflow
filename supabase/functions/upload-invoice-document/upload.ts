import {
  assertSameUpload,
  assertUploadAllowed,
  sha256,
  Statement,
  UploadError,
  UploadInput,
  validateInvoiceDocument,
  versionKey,
} from "./request.ts";
type SavedDocument = {
  request_id: string;
  statement_id: string;
  uploader_user_id: string;
  statement_updated_at: string;
  sha256: string;
  byte_size: number;
  external_invoice_number: string;
  issue_date: string;
  due_date: string;
  total_amount: number;
};
export type Registration = {
  p_request_id: string;
  p_uploader_user_id: string;
  p_statement_id: string;
  p_expected_updated_at: string;
  p_storage_path: string;
  p_sha256: string;
  p_byte_size: number;
  p_invoice_number: string;
  p_issue_date: string;
  p_due_date: string;
  p_total_amount: number;
};
export interface UploadStore {
  loadOwnedStatement(id: string, userId: string): Promise<Statement>;
  findDocument(requestId: string): Promise<SavedDocument | null>;
  upload(
    path: string,
    bytes: Uint8Array,
    fingerprint: string,
  ): Promise<boolean>;
  readObject(
    path: string,
  ): Promise<{ bytes: Uint8Array; fingerprint: string } | null>;
  register(payload: Registration): Promise<unknown>;
}
export const saveInvoiceDocument = async (
  raw: UploadInput,
  userId: string,
  store: UploadStore,
): Promise<unknown> => {
  const validation = validateInvoiceDocument(raw);
  if (validation.ok === false) throw new UploadError(validation.error);
  const input = validation.value;
  // This read uses caller permissions and current owner/profile/role checks, before any privileged file operation.
  const statement = await store.loadOwnedStatement(input.statementId, userId);
  if (statement.contractor_user_id !== userId) {
    throw new UploadError("invoice_billing_unauthorized", 403);
  }
  const saved = await store.findDocument(input.requestId);
  const hash = await sha256(input.bytes);
  const payload: Registration = {
    p_request_id: input.requestId,
    p_uploader_user_id: userId,
    p_statement_id: input.statementId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_storage_path:
      `billing-statements/${input.statementId}/documents/${input.requestId}.pdf`,
    p_sha256: hash,
    p_byte_size: input.bytes.byteLength,
    p_invoice_number: input.invoiceNumber,
    p_issue_date: input.issueDate,
    p_due_date: input.dueDate,
    // A saved receipt retains its original financial version; clients never supply an amount.
    p_total_amount: saved
      ? Number(saved.total_amount)
      : Number(statement.total_amount),
  };
  if (saved) {
    assertSameUpload(
      [
        input.requestId,
        input.statementId,
        userId,
        versionKey(input.expectedUpdatedAt),
        hash,
        input.bytes.byteLength,
        input.invoiceNumber,
        input.issueDate,
        input.dueDate,
      ],
      [
        saved.request_id,
        saved.statement_id,
        saved.uploader_user_id,
        versionKey(saved.statement_updated_at),
        saved.sha256,
        saved.byte_size,
        saved.external_invoice_number,
        saved.issue_date,
        saved.due_date,
      ],
    );
  } else {
    assertUploadAllowed(statement, userId, true, input.expectedUpdatedAt);
  }
  const fingerprint = await sha256(
    new TextEncoder().encode(
      JSON.stringify({
        ...payload,
        p_expected_updated_at: versionKey(payload.p_expected_updated_at),
      }),
    ),
  );
  if (
    !saved &&
    await store.upload(payload.p_storage_path, input.bytes, fingerprint)
  ) return store.register(payload);
  // An ambiguous upload or registration may leave an orphan. Only this exact immutable request can recover it.
  const object = await store.readObject(payload.p_storage_path);
  if (!object) {
    throw new UploadError("invoice_billing_upload_retry_required", 503);
  }
  assertSameUpload([hash, input.bytes.byteLength, fingerprint], [
    await sha256(object.bytes),
    object.bytes.byteLength,
    object.fingerprint,
  ]);
  return store.register(payload);
};
