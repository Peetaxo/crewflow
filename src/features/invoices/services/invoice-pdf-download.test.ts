import { describe, expect, it, vi } from 'vitest';
import { openInvoicePdfUrl } from './invoice-pdf-download';

describe('invoice PDF download', () => {
  it('falls back to current tab when opening the PDF in a new tab is blocked', () => {
    const open = vi.fn(() => null);
    const assign = vi.fn();

    openInvoicePdfUrl('https://signed.example/invoice.pdf', {
      open,
      location: { assign },
    });

    expect(open).toHaveBeenCalledWith('https://signed.example/invoice.pdf', '_blank', 'noopener,noreferrer');
    expect(assign).toHaveBeenCalledWith('https://signed.example/invoice.pdf');
  });

  it('keeps the user on the current page when the new tab opens', () => {
    const open = vi.fn(() => ({} as WindowProxy));
    const assign = vi.fn();

    openInvoicePdfUrl('https://signed.example/invoice.pdf', {
      open,
      location: { assign },
    });

    expect(assign).not.toHaveBeenCalled();
  });
});
