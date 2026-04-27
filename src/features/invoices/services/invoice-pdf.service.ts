import { isSupabaseConfigured, supabase } from '../../../lib/supabase';

const INVOICE_PDF_BUCKET = 'invoice-pdfs';
const SIGNED_URL_TTL_SECONDS = 60 * 5;

export type GenerateInvoicePdfResult = {
  pdfPath: string;
};

export const generateInvoicePdf = async (invoiceId: string): Promise<GenerateInvoicePdfResult> => {
  if (!supabase || !isSupabaseConfigured) {
    throw new Error('Supabase neni nakonfigurovany.');
  }

  const result = await supabase.functions.invoke<GenerateInvoicePdfResult>('generate-invoice-pdf', {
    body: { invoiceId },
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  if (!result.data?.pdfPath) {
    throw new Error('PDF se nepodarilo vygenerovat.');
  }

  return result.data;
};

export const getInvoicePdfDownloadUrl = async (pdfPath: string): Promise<string> => {
  if (!supabase || !isSupabaseConfigured) {
    throw new Error('Supabase neni nakonfigurovany.');
  }

  const result = await supabase.storage
    .from(INVOICE_PDF_BUCKET)
    .createSignedUrl(pdfPath, SIGNED_URL_TTL_SECONDS);

  if (result.error || !result.data?.signedUrl) {
    throw new Error(result.error?.message ?? 'PDF se nepodarilo pripravit ke stazeni.');
  }

  return result.data.signedUrl;
};
