export class PdfSourceError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export const assertManualPdfAllowed = (
  invoice: { billing_kind?: unknown; billing_statement_id?: unknown },
) => {
  if (invoice.billing_kind === "uploaded") {
    throw new PdfSourceError("invoice_billing_uploaded_original_immutable");
  }
  if (invoice.billing_statement_id != null) {
    throw new PdfSourceError("invoice_billing_durable_job_required");
  }
};
// Pagination must use both stable sort keys, including tied created_at values.
export const loadAllInvoiceItems = async <T>(
  loadPage: (from: number, to: number) => Promise<T[]>,
): Promise<T[]> => {
  const items: T[] = [];
  const pageSize = 500;
  for (let offset = 0;; offset += pageSize) {
    const page = await loadPage(offset, offset + pageSize - 1);
    items.push(...page);
    if (page.length < pageSize) return items;
  }
};
