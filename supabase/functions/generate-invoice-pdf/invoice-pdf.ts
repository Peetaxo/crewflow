import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';
import QRCode from 'https://esm.sh/qrcode@1.5.4';
import { buildInvoicePdfLayout } from './invoice-pdf-layout.ts';
import { buildQrPaymentPayload } from './payment-qr.ts';

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

const noduText = rgb(0.184, 0.149, 0.122);
const noduSoft = rgb(0.439, 0.369, 0.314);
const noduAccent = rgb(1, 0.502, 0.051);
const line = rgb(0.87, 0.84, 0.8);
const softRow = rgb(0.98, 0.97, 0.95);
const summaryFill = rgb(1, 0.973, 0.945);
const summaryBorder = rgb(1, 0.78, 0.63);

const money = (value: unknown): string => `${Number(value ?? 0).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kc`;
const text = (value: unknown): string => String(value ?? '');
const numberValue = (value: unknown): number => Number(value ?? 0);

const dataUrlToBytes = (dataUrl: string): Uint8Array => {
  const base64 = dataUrl.split(',')[1] ?? '';
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
};

const drawText = (
  page: ReturnType<PDFDocument['addPage']>,
  value: string,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  x: number,
  y: number,
  size: number,
  color = noduText,
) => {
  page.drawText(value, {
    x,
    y,
    size,
    font,
    color,
  });
};

const drawLabel = (
  page: ReturnType<PDFDocument['addPage']>,
  value: string,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  x: number,
  y: number,
) => {
  drawText(page, value.toUpperCase(), font, x, y, 6, noduSoft);
};

const drawRule = (
  page: ReturnType<PDFDocument['addPage']>,
  y: number,
  x1 = 48,
  x2 = 547,
) => {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.7, color: line });
};

const drawNoduWordmark = (
  page: ReturnType<PDFDocument['addPage']>,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  x: number,
  y: number,
) => {
  drawText(page, 'nodu', font, x, y, 19, noduText);
  drawText(page, '.', font, x + 47, y, 19, noduAccent);
};

const fitText = (
  value: string,
  maxLength: number,
): string => (value.length > maxLength ? `${value.slice(0, Math.max(maxLength - 1, 0))}.` : value);

export const renderInvoicePdf = async ({
  invoice,
  items,
}: {
  invoice: Record<string, unknown>;
  items: InvoiceItem[];
}): Promise<Uint8Array> => {
  const supplier = invoice.supplier_snapshot as Snapshot;
  const customer = invoice.customer_snapshot as Snapshot;

  const layout = buildInvoicePdfLayout(items.length);
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([layout.page.width, layout.page.height]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const invoiceNumber = text(invoice.invoice_number);
  const totalAmount = numberValue(invoice.total_amount);
  const variableSymbol = invoiceNumber.replace(/\D/g, '').slice(0, 10);

  drawLabel(page, 'Faktura vystavena odberatelem', bold, 48, 790);
  drawText(page, 'Danovy doklad', bold, 48, 760, 28);
  drawNoduWordmark(page, font, 444, 775);
  drawText(page, invoiceNumber, bold, 444, 748, 11);
  drawRule(page, 728);

  drawLabel(page, 'Dodavatel', bold, 48, 686);
  drawText(page, fitText(text(supplier.name), 34), bold, 48, 672, 9);
  drawText(page, fitText(`${text(supplier.billingStreet)}, ${text(supplier.billingZip)} ${text(supplier.billingCity)}`, 44), font, 48, 660, 8, noduSoft);
  drawText(page, `IC: ${text(supplier.ico)}`, font, 48, 648, 8, noduSoft);
  drawText(page, 'Neni platcem DPH', font, 48, 636, 8, noduSoft);

  drawLabel(page, 'Odberatel', bold, 300, 686);
  drawText(page, fitText(text(customer.name), 34), bold, 300, 672, 9);
  drawText(page, fitText(`${text(customer.street)}, ${text(customer.zip)} ${text(customer.city)}`, 44), font, 300, 660, 8, noduSoft);
  drawText(page, `IC: ${text(customer.ico)}`, font, 300, 648, 8, noduSoft);
  drawText(page, `DIC: ${text(customer.dic || 'neni')}`, font, 300, 636, 8, noduSoft);

  drawRule(page, 612);
  drawLabel(page, 'Vystaveni', bold, 48, 586);
  drawText(page, text(invoice.issue_date), bold, 48, 574, 8.5);
  drawLabel(page, 'Splatnost', bold, 230, 586);
  drawText(page, text(invoice.due_date), bold, 230, 574, 8.5);
  drawLabel(page, 'Mena', bold, 410, 586);
  drawText(page, text(invoice.currency || 'CZK'), bold, 410, 574, 8.5);
  drawRule(page, 552);

  drawRule(page, layout.items.headerY + 18);
  drawLabel(page, 'Polozka', bold, 48, layout.items.headerY);
  drawLabel(page, 'Rozsah', bold, 300, layout.items.headerY);
  drawLabel(page, 'Celkem', bold, 505, layout.items.headerY);

  if (supplier.iban) {
    const qrPayload = buildQrPaymentPayload({
      iban: text(supplier.iban),
      amount: totalAmount,
      currency: text(invoice.currency || 'CZK'),
      invoiceNumber,
      recipientName: text(supplier.name),
    });
    const qrDataUrl = await QRCode.toDataURL(qrPayload, { errorCorrectionLevel: 'M', margin: 1, width: 112 });
    const qrImage = await pdfDoc.embedPng(dataUrlToBytes(qrDataUrl));
    page.drawImage(qrImage, { x: 495, y: layout.payment.y + 8, width: 52, height: 52 });
  } else {
    drawText(page, 'QR platba neni dostupna', bold, 420, layout.payment.y + 42, 7, noduSoft);
    drawText(page, 'Dodavateli chybi IBAN.', font, 420, layout.payment.y + 30, 7, noduSoft);
  }

  let rowY = layout.items.startY;
  items.forEach((item) => {
    page.drawRectangle({ x: 42, y: rowY - 7, width: 511, height: 15, color: rowY === layout.items.startY ? softRow : rgb(1, 1, 1) });
    drawText(page, fitText(text(item.job_number), 48), rowY === layout.items.startY ? bold : font, 48, rowY - 1, layout.items.fontSize);
    drawText(page, `${numberValue(item.hours).toLocaleString('cs-CZ')} h`, font, 300, rowY - 1, layout.items.fontSize);
    drawText(page, money(item.total_amount), bold, 493, rowY - 1, layout.items.fontSize);
    rowY -= layout.items.rowHeight;
  });

  const workAmount = items.reduce((sum, item) => sum + numberValue(item.amount_hours), 0);
  const expenseAmount = items.reduce((sum, item) => sum + numberValue(item.amount_km) + numberValue(item.amount_receipts), 0);
  page.drawRectangle({
    x: layout.summary.x,
    y: layout.summary.y,
    width: layout.summary.width,
    height: layout.summary.height,
    color: summaryFill,
    borderColor: summaryBorder,
    borderWidth: 0.7,
  });
  drawLabel(page, 'Souhrn', bold, layout.summary.x + 14, layout.summary.y + 53);
  drawText(page, 'Prace', font, layout.summary.x + 14, layout.summary.y + 39, 7.5);
  drawText(page, money(workAmount), bold, layout.summary.x + 105, layout.summary.y + 39, 7.5);
  drawText(page, 'Naklady', font, layout.summary.x + 14, layout.summary.y + 27, 7.5);
  drawText(page, money(expenseAmount), bold, layout.summary.x + 105, layout.summary.y + 27, 7.5);
  page.drawLine({
    start: { x: layout.summary.x + 14, y: layout.summary.y + 19 },
    end: { x: layout.summary.x + layout.summary.width - 14, y: layout.summary.y + 19 },
    thickness: 0.6,
    color: line,
  });
  drawText(page, 'Celkem', bold, layout.summary.x + 14, layout.summary.y + 7, 9);
  drawText(page, money(totalAmount), bold, layout.summary.x + 100, layout.summary.y + 7, 9);

  drawRule(page, layout.payment.y + layout.payment.height);
  drawLabel(page, 'Platebni udaje', bold, 48, layout.payment.y + 48);
  drawText(page, `IBAN ${text(supplier.iban || 'neni vyplnen')}`, font, 48, layout.payment.y + 34, 7.5, noduSoft);
  drawText(page, `VS ${variableSymbol || 'neni'}`, font, 48, layout.payment.y + 22, 7.5, noduSoft);
  drawText(page, 'Automaticky vystaveno v NODU', font, 48, layout.payment.y + 4, 6.8, noduSoft);
  drawRule(page, 34);
  drawText(page, 'Strana 1/1', font, 508, 20, 6.5, noduSoft);

  return pdfDoc.save();
};
