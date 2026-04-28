import { describe, expect, it } from 'vitest';
import { buildInvoicePdfLayout } from '../../../../supabase/functions/generate-invoice-pdf/invoice-pdf-layout';

describe('invoice PDF layout', () => {
  it('keeps invoice item rows compact and leaves room before payment details', () => {
    const layout = buildInvoicePdfLayout(3);

    expect(layout.items.fontSize).toBeLessThanOrEqual(7.5);
    expect(layout.items.rowHeight).toBeLessThanOrEqual(18);
    expect(layout.summary.y).toBeGreaterThan(
      layout.payment.y + layout.payment.height + layout.minimumSectionGap,
    );
  });

  it('keeps the invoice number inside the printable area and reserves a larger QR code', () => {
    const layout = buildInvoicePdfLayout(1);

    expect(layout.header.invoiceNumberX + layout.header.invoiceNumberWidth).toBeLessThanOrEqual(
      layout.page.width - layout.page.marginX,
    );
    expect(layout.payment.qrSize).toBeGreaterThanOrEqual(68);
  });
});
