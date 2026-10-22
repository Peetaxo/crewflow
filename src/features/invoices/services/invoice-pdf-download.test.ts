import { describe, expect, it, vi } from 'vitest';
import { openInvoicePdfUrl } from './invoice-pdf-download';

describe('invoice PDF download', () => {
  it('starts one download even when a successful noopener popup returns null', () => {
    const downloads: string[] = [];
    // With noopener, null is also the expected result of a successful open.
    const target = {
      open: vi.fn((url: string) => { downloads.push(url); return null; }),
      location: { assign: vi.fn((url: string) => { downloads.push(url); }) },
    };

    openInvoicePdfUrl('https://signed.example/invoice.pdf?download=', target);

    expect(downloads).toEqual(['https://signed.example/invoice.pdf?download=']);
    expect(target.open).not.toHaveBeenCalled();
    expect(target.location.assign).toHaveBeenCalledExactlyOnceWith('https://signed.example/invoice.pdf?download=');
  });

  it('does not depend on popups being allowed for an attachment download', () => {
    const target = { open: vi.fn(() => null), location: { assign: vi.fn() } };

    openInvoicePdfUrl('https://signed.example/invoice.pdf?download=', target);

    expect(target.open).not.toHaveBeenCalled();
    expect(target.location.assign).toHaveBeenCalledExactlyOnceWith('https://signed.example/invoice.pdf?download=');
  });
});
