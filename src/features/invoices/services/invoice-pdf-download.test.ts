import { afterEach, describe, expect, it, vi } from 'vitest';
import { openInvoicePdfUrl } from './invoice-pdf-download';

const { isPluginAvailable, save } = vi.hoisted(() => ({
  isPluginAvailable: vi.fn(),
  save: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isPluginAvailable },
  registerPlugin: () => ({ save }),
}));

const pdfUrl = 'https://signed.example/invoice.pdf?download=';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe('invoice PDF download', () => {
  it('starts one download even when a successful noopener popup returns null', async () => {
    const downloads: string[] = [];
    // With noopener, null is also the expected result of a successful open.
    const target = {
      open: vi.fn((url: string) => { downloads.push(url); return null; }),
      location: { assign: vi.fn((url: string) => { downloads.push(url); }) },
    };

    await openInvoicePdfUrl(pdfUrl, target);

    expect(downloads).toEqual(['https://signed.example/invoice.pdf?download=']);
    expect(target.open).not.toHaveBeenCalled();
    expect(target.location.assign).toHaveBeenCalledExactlyOnceWith('https://signed.example/invoice.pdf?download=');
  });

  it('does not depend on popups being allowed for an attachment download', async () => {
    const target = { open: vi.fn(() => null), location: { assign: vi.fn() } };

    await openInvoicePdfUrl(pdfUrl, target);

    expect(target.open).not.toHaveBeenCalled();
    expect(target.location.assign).toHaveBeenCalledExactlyOnceWith('https://signed.example/invoice.pdf?download=');
  });

  it('downloads the signed PDF into the native document picker without opening a browser', async () => {
    isPluginAvailable.mockReturnValue(true);
    const request = vi.fn().mockResolvedValue(new Response('%PDF-'));
    vi.stubGlobal('fetch', request);
    const target = { location: { assign: vi.fn() } };

    await openInvoicePdfUrl(pdfUrl, target);

    expect(request).toHaveBeenCalledExactlyOnceWith(pdfUrl);
    expect(save).toHaveBeenCalledExactlyOnceWith({ filename: 'invoice.pdf', base64: 'JVBERi0=' });
    expect(target.location.assign).not.toHaveBeenCalled();
  });

  it('does not present the PDF when the active billing scope changes during the download', async () => {
    isPluginAvailable.mockReturnValue(true);
    let current = true;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      current = false;
      return Promise.resolve(new Response('%PDF-'));
    }));
    const target = { location: { assign: vi.fn() } };

    await openInvoicePdfUrl(pdfUrl, target, () => current);

    expect(save).not.toHaveBeenCalled();
    expect(target.location.assign).not.toHaveBeenCalled();
  });

  it('reports a failed native download without opening an error document', async () => {
    isPluginAvailable.mockReturnValue(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
    const target = { location: { assign: vi.fn() } };

    await expect(openInvoicePdfUrl(pdfUrl, target)).rejects.toThrow('PDF se nepodařilo stáhnout.');

    expect(save).not.toHaveBeenCalled();
    expect(target.location.assign).not.toHaveBeenCalled();
  });
});
