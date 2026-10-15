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

import { buildInvoicePdfPages, formatInvoiceDuration, invoiceCostSubtotal, wrapInvoiceText } from '../../../../supabase/functions/generate-invoice-pdf/invoice-pdf-layout';
describe('multi-source invoice pagination', () => {
 it.each([1, 5, 12, 13, 24, 31, 75, 1003])('places every one of %i rows above reserved sections', count => {const pages=buildInvoicePdfPages(count);expect(pages.reduce((n,p)=>n+p.count,0)).toBe(count);pages.forEach(p=>{const bottom=p.startY-Math.max(0,p.count-1)*18-8;expect(bottom).toBeGreaterThan(p.summary ? 262:54);});expect(pages.filter(p=>p.summary)).toHaveLength(1);});
 it('shows exact hours and minutes for approved duration',()=>expect(formatInvoiceDuration(8.333333333)).toBe('8 h 20 min'));
 it('includes meals in costs',()=>expect(invoiceCostSubtotal([{amount_km:56,amount_meals:350,amount_receipts:0}])).toBe(406));
 it('wraps a complete legal name without truncation',()=>{const name='Velmi dlouhý český obchodní název společnosti se sídlem v Praze'; const lines=wrapInvoiceText(name,20,s=>s.length);expect(lines.join(' ')).toBe(name);expect(lines.every(s=>s.length<=20)).toBe(true);});
});
