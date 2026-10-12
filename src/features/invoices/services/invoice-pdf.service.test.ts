import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
const createSignedUrl = vi.fn();

vi.mock('../../../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    functions: { invoke },
    storage: {
      from: () => ({ createSignedUrl }),
    },
  },
}));

describe('invoice PDF service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('invokes generate-invoice-pdf edge function', async () => {
    invoke.mockResolvedValue({ data: { pdfPath: 'invoices/1/test.pdf' }, error: null });

    const { generateInvoicePdf } = await import('./invoice-pdf.service');
    await expect(generateInvoicePdf('invoice-1')).resolves.toEqual({ pdfPath: 'invoices/1/test.pdf' });

    expect(invoke).toHaveBeenCalledWith('generate-invoice-pdf', {
      body: { invoiceId: 'invoice-1' },
    });
  });

  it('creates signed download URL for private invoice PDF', async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example/pdf' }, error: null });

    const { getInvoicePdfDownloadUrl } = await import('./invoice-pdf.service');
    await expect(getInvoicePdfDownloadUrl('invoices/1/test.pdf')).resolves.toBe('https://signed.example/pdf');

    expect(createSignedUrl).toHaveBeenCalledWith('invoices/1/test.pdf', 300, {
      download: true,
    });
  });

  it('shows the actionable message returned by the PDF generator', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { message: 'Edge Function returned a non-2xx status code', context: new Response(JSON.stringify({ error: 'Faktura není dostupná.' }), { status: 404 }) },
    });
    const { generateInvoicePdf } = await import('./invoice-pdf.service');
    await expect(generateInvoicePdf('invoice-1')).rejects.toThrow('Faktura není dostupná.');
  });

  it('keeps the transport error if the response is not JSON', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'Network connection failed', context: new Response('Gateway unavailable', { status: 502 }) } });
    const { generateInvoicePdf } = await import('./invoice-pdf.service');
    await expect(generateInvoicePdf('invoice-1')).rejects.toThrow('Network connection failed');
  });
});
