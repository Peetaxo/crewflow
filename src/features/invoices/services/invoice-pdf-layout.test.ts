import { describe, expect, it } from 'vitest';
import { buildInvoicePdfLayout } from '../../../../supabase/functions/generate-invoice-pdf/invoice-pdf-layout';

describe('invoice PDF layout', () => {
  it('keeps invoice item rows compact and leaves room before payment details', () => {
    const layout = buildInvoicePdfLayout(3);

    expect(layout.items.fontSize).toBeLessThanOrEqual(7);
    expect(layout.items.rowHeight).toBeLessThanOrEqual(18);
    expect(layout.summary.y).toBeGreaterThan(
      layout.payment.y + layout.payment.height + layout.minimumSectionGap,
    );
  });
});
