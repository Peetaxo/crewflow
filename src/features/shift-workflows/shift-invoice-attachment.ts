import { z } from 'zod';
import { supabase } from '../../lib/supabase';
import { billingDate } from '../invoice-billing/contract';
import { openInvoicePdfUrl } from '../invoices/services/invoice-pdf-download';
import { getInvoicePdfDownloadUrl } from '../invoices/services/invoice-pdf.service';
import { canonicalUuid, ShiftWorkflowError } from './shift-workflows.contract';

export const MAX_SHIFT_INVOICE_PDF_BYTES = 5 * 1024 * 1024;

const attachment = z.object({ id: canonicalUuid, invoice_number: z.string().min(1), issue_date: billingDate,
  due_date: billingDate, total_amount: z.number().finite().nonnegative(), storage_path: z.string().min(1) });
const availability = z.object({ eligible: z.boolean(), customer_id: canonicalUuid.nullable(),
  customer_name: z.string().nullable(), attachment: attachment.nullable() });
export type ShiftInvoiceAvailability = Required<Omit<z.infer<typeof availability>, 'attachment'>> & {
  attachment: Required<z.infer<typeof attachment>> | null;
};
export interface ShiftInvoiceFields {
  invoiceNumber: string; issueDate: string; dueDate: string; totalAmount: string;
}
export type ShiftInvoiceChange = { kind: 'remove' } | (ShiftInvoiceFields & {
  kind: 'replace'; requestId: string; customerId: string; file: File;
});
type ShiftInvoiceReplacement = Extract<ShiftInvoiceChange, { kind: 'replace' }>;

type Result = { data: unknown; error: unknown };
type ShiftInvoiceReadClient = { rpc: (name: 'get_shift_invoice_attachment', args: { p_timelog_ids: string[] }) => PromiseLike<Result> };
export type ShiftInvoiceUploadClient = { invoke: (name: 'upload-shift-invoice', options: { body: FormData }) => PromiseLike<Result> };

export async function readShiftInvoiceAttachment(timelogIds: string[], assertCurrent: () => void): Promise<ShiftInvoiceAvailability> {
  assertCurrent();
  const client = supabase as unknown as ShiftInvoiceReadClient | null;
  if (!client || !timelogIds.length || timelogIds.some((id) => !canonicalUuid.safeParse(id).success)) throw unavailable();
  const { data, error } = await client.rpc('get_shift_invoice_attachment', { p_timelog_ids: timelogIds });
  assertCurrent();
  if (error) throw unavailable();
  const parsed = availability.safeParse(data);
  if (!parsed.success) throw unavailable();
  return parsed.data as ShiftInvoiceAvailability;
}

export async function downloadShiftInvoiceAttachment(storagePath: string, isCurrent: () => boolean) {
  if (!isCurrent()) return;
  const url = await getInvoicePdfDownloadUrl(storagePath);
  await openInvoicePdfUrl(url, window, isCurrent);
}

const invalid = (message: string) => new ShiftWorkflowError('invalid', message);
const unavailable = () => invalid('Přílohu se nepodařilo načíst. Hodiny můžete odeslat i bez přílohy.');

export function shiftInvoicePdfError(file: File | null) {
  if (!file) return 'Vyberte originál faktury v PDF.';
  if (!(file instanceof File) || file.type !== 'application/pdf' || file.size === 0 || file.size > MAX_SHIFT_INVOICE_PDF_BYTES) {
    return 'Vyberte platný soubor PDF do 5 MiB.';
  }
  return null;
}

export function validateShiftInvoiceReplacement(input: Omit<ShiftInvoiceReplacement, 'file'> & { file: File | null }): ShiftInvoiceReplacement {
  const fileError = shiftInvoicePdfError(input.file);
  if (fileError) throw invalid(fileError);
  const invoiceNumber = input.invoiceNumber.trim();
  if (!invoiceNumber || [...invoiceNumber].length > 120) throw invalid('Zadejte číslo faktury do 120 znaků.');
  if (!billingDate.safeParse(input.issueDate).success || !billingDate.safeParse(input.dueDate).success
    || input.issueDate.startsWith('0000') || input.dueDate < input.issueDate) {
    throw invalid('Zadejte platné datum vystavení a splatnost nejdříve v den vystavení.');
  }
  const totalAmount = input.totalAmount.trim().replace(',', '.');
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(totalAmount)) throw invalid('Zadejte celkovou částku v Kč nejvýše na dvě desetinná místa.');
  if (!canonicalUuid.safeParse(input.customerId).success || !canonicalUuid.safeParse(input.requestId).success) throw unavailable();
  return { ...input, file: input.file!, invoiceNumber, totalAmount: Number(totalAmount).toFixed(2) };
}

async function uploadError(error: unknown) {
  const context = (error as { context?: Response } | null)?.context;
  let payload: { error?: string } | null = null;
  try { if (context instanceof Response) payload = await context.clone().json(); }
  catch { /* An unexpected response format still leaves the hours available. */ }
  const code = payload?.error;
  if (context?.status === 413 || ['invoice_billing_pdf_missing', 'invoice_billing_pdf_type_invalid',
    'invoice_billing_pdf_size_invalid', 'invoice_billing_pdf_header_invalid'].includes(code ?? '')) return invalid('Vyberte platný soubor PDF do 5 MiB.');
  if (code === 'invoice_billing_document_metadata_invalid') return invalid('Zkontrolujte číslo faktury, data a celkovou částku.');
  if (code === 'shift_invoice_attachment_not_eligible') return invalid('Přílohu teď nelze přidat. Obnovte evidenci nebo pokračujte bez nové přílohy.');
  return invalid('PDF se nepodařilo nahrát. Zkuste odeslat výkaz znovu, případně zrušte výběr PDF.');
}

export async function stageShiftInvoiceAttachment(client: ShiftInvoiceUploadClient | undefined, input: ShiftInvoiceReplacement,
  timelogIds: string[], assertCurrent: () => void) {
  assertCurrent();
  if (!client) throw unavailable();
  const { requestId, customerId, invoiceNumber, issueDate, dueDate, totalAmount, file } = validateShiftInvoiceReplacement(input);
  const body = new FormData();
  for (const [key, value] of Object.entries({ requestId, timelogIds: JSON.stringify(timelogIds), customerId, invoiceNumber, issueDate, dueDate, totalAmount, file })) {
    body.append(key, value);
  }
  let response: Result;
  try { response = await client.invoke('upload-shift-invoice', { body }); }
  catch (cause) { assertCurrent(); throw await uploadError(cause); }
  assertCurrent();
  if (response.error) throw await uploadError(response.error);
  // The stage receipt must belong to this exact request before the hours write can bind it.
  if ((response.data as { attachment_id?: string } | null)?.attachment_id !== requestId) throw await uploadError(null);
  return requestId;
}
