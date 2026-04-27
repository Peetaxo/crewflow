import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';

type InvoiceItem = {
  job_number: string;
  hours: number;
  amount_hours: number;
  km: number;
  amount_km: number;
  amount_receipts: number;
  total_amount: number;
};

type Snapshot = Record<string, unknown>;

const money = (value: unknown): string => `${Number(value ?? 0).toLocaleString('cs-CZ')} Kc`;
const text = (value: unknown): string => String(value ?? '');

export const renderInvoicePdf = async ({
  invoice,
  items,
}: {
  invoice: Record<string, unknown>;
  items: InvoiceItem[];
}): Promise<Uint8Array> => {
  const supplier = invoice.supplier_snapshot as Snapshot;
  const customer = invoice.customer_snapshot as Snapshot;

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  let y = 790;

  const draw = (value: string, x = 48, size = 10, useBold = false) => {
    page.drawText(value, { x, y, size, font: useBold ? bold : font, color: rgb(0.07, 0.09, 0.15) });
    y -= size + 8;
  };

  draw('Faktura', 48, 24, true);
  draw('Vystaveno odberatelem', 48, 11, true);
  draw(`Cislo faktury: ${text(invoice.invoice_number)}`, 48, 11);
  draw(
    `Datum vystaveni: ${text(invoice.issue_date)} | Datum plneni: ${text(invoice.taxable_supply_date)} | Splatnost: ${text(invoice.due_date)}`,
    48,
    9,
  );
  y -= 12;

  draw('Dodavatel', 48, 13, true);
  draw(text(supplier.name));
  draw(`${text(supplier.billingStreet)}, ${text(supplier.billingZip)} ${text(supplier.billingCity)}, ${text(supplier.billingCountry)}`);
  draw(`ICO: ${text(supplier.ico)} | DIC: ${text(supplier.dic || 'neni')}`);
  draw(`Bankovni ucet: ${text(supplier.bankAccount)}`);
  draw('Dodavatel neni platcem DPH.');
  y -= 10;

  draw('Odberatel', 48, 13, true);
  draw(text(customer.name));
  draw(`${text(customer.street)}, ${text(customer.zip)} ${text(customer.city)}, ${text(customer.country)}`);
  draw(`ICO: ${text(customer.ico)} | DIC: ${text(customer.dic || 'neni')}`);
  y -= 12;

  draw('Polozky', 48, 13, true);
  draw('Job | Hodiny | Hodiny Kc | Km | Cestovne | Uctenky | Celkem', 48, 8, true);
  items.forEach((item) => {
    draw(
      `${item.job_number} | ${item.hours} | ${money(item.amount_hours)} | ${item.km} | ${money(item.amount_km)} | ${money(item.amount_receipts)} | ${money(item.total_amount)}`,
      48,
      8,
    );
  });

  y -= 16;
  draw(`Celkem k uhrade: ${money(invoice.total_amount)}`, 48, 16, true);

  return pdfDoc.save();
};
