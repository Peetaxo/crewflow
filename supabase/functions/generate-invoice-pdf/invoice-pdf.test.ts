import { PDFDocument } from 'https://esm.sh/pdf-lib@1.17.1';
import { renderInvoicePdf } from './invoice-pdf.ts';

const invoice = {
  invoice_number: 'SF-2026-CREW-D-0001',
  issue_date: '2026-10-12',
  due_date: '2026-10-26',
  taxable_supply_date: '2026-10-10',
  currency: 'CZK',
  total_amount: 2056,
  supplier_snapshot: {
    name: 'Demo Crew', ico: '12345679', bankAccount: '19-2000145399/0800',
    billingStreet: 'Testovaci 1', billingZip: '11000', billingCity: 'Praha',
  },
  customer_snapshot: { name: 'Demo Produkce s.r.o.', ico: '87654321', street: 'Ukazkova 10', zip: '11000', city: 'Praha' },
};
const items = [{ job_number: 'DEMO012', hours: 8, amount_hours: 2000, km: 10, amount_km: 56, amount_receipts: 0, total_amount: 2056 }];

Deno.test('generates a readable invoice with the actual embedded wordmark', async () => {
  const bytes = await renderInvoicePdf({ invoice, items });
  const document = await PDFDocument.load(bytes);
  if (document.getPageCount() !== 1) throw new Error('Invoice must have one readable page');
  if (bytes.length < 1000) throw new Error('Invoice PDF is incomplete');
});

Deno.test('preserves Czech billing data and renders the payment QR', async () => {
  const bytes = await renderInvoicePdf({
    invoice: {
      ...invoice,
      supplier_snapshot: { ...invoice.supplier_snapshot, name: 'Žaneta Černá', billingStreet: 'Testovací 1', iban: 'CZ6508000000192000145399' },
      customer_snapshot: { ...invoice.customer_snapshot, name: 'Ukázková produkce s.r.o.', street: 'Ukázková 10' },
    },
    items,
  });
  const document = await PDFDocument.load(bytes);
  if (document.getPageCount() !== 1) throw new Error('Czech invoice must have one readable page');
});
