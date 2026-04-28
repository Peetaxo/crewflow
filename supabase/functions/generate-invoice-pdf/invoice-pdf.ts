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
const white = rgb(1, 1, 1);

const noduWordmarkPngBase64 = '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';

const money = (value: unknown): string => `${Number(value ?? 0).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kc`;
const text = (value: unknown): string => String(value ?? '');
const numberValue = (value: unknown): number => Number(value ?? 0);

const dataUrlToBytes = (dataUrl: string): Uint8Array => {
  const base64 = dataUrl.split(',')[1] ?? '';
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
};

const base64ToBytes = (base64: string): Uint8Array => (
  Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
);

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

const drawRightAlignedText = (
  page: ReturnType<PDFDocument['addPage']>,
  value: string,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  x: number,
  y: number,
  size: number,
  width: number,
  color = noduText,
) => {
  const textWidth = font.widthOfTextAtSize(value, size);
  drawText(page, value, font, x + width - textWidth, y, size, color);
};

const roundedRectPath = (x: number, y: number, width: number, height: number, radius: number): string => {
  const right = x + width;
  const top = y + height;
  return [
    `M ${x + radius} ${y}`,
    `L ${right - radius} ${y}`,
    `Q ${right} ${y} ${right} ${y + radius}`,
    `L ${right} ${top - radius}`,
    `Q ${right} ${top} ${right - radius} ${top}`,
    `L ${x + radius} ${top}`,
    `Q ${x} ${top} ${x} ${top - radius}`,
    `L ${x} ${y + radius}`,
    `Q ${x} ${y} ${x + radius} ${y}`,
    'Z',
  ].join(' ');
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
  const logoImage = await pdfDoc.embedPng(base64ToBytes(noduWordmarkPngBase64));
  const invoiceNumber = text(invoice.invoice_number);
  const totalAmount = numberValue(invoice.total_amount);
  const variableSymbol = invoiceNumber.replace(/\D/g, '').slice(0, 10);

  page.drawRectangle({ x: 0, y: 0, width: layout.page.width, height: layout.page.height, color: white });
  drawLabel(page, 'Faktura vystavena odberatelem', bold, 48, 790);
  drawText(page, 'Danovy doklad', bold, 48, 760, 28);
  page.drawImage(logoImage, {
    x: layout.header.logoX,
    y: layout.header.logoY,
    width: layout.header.logoWidth,
    height: layout.header.logoWidth * (110 / 320),
  });
  drawRightAlignedText(page, invoiceNumber, bold, layout.header.invoiceNumberX, 748, 10, layout.header.invoiceNumberWidth);
  drawRule(page, 728);

  drawLabel(page, 'Dodavatel', bold, 48, 686);
  drawText(page, fitText(text(supplier.name), 34), bold, 48, 671, 10);
  drawText(page, fitText(`${text(supplier.billingStreet)}, ${text(supplier.billingZip)} ${text(supplier.billingCity)}`, 44), font, 48, 658, 9, noduSoft);
  drawText(page, `IC: ${text(supplier.ico)}`, font, 48, 645, 9, noduSoft);
  drawText(page, 'Neni platcem DPH', font, 48, 632, 9, noduSoft);

  drawLabel(page, 'Odberatel', bold, 300, 686);
  drawText(page, fitText(text(customer.name), 34), bold, 300, 671, 10);
  drawText(page, fitText(`${text(customer.street)}, ${text(customer.zip)} ${text(customer.city)}`, 44), font, 300, 658, 9, noduSoft);
  drawText(page, `IC: ${text(customer.ico)}`, font, 300, 645, 9, noduSoft);
  drawText(page, `DIC: ${text(customer.dic || 'neni')}`, font, 300, 632, 9, noduSoft);

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
    page.drawImage(qrImage, {
      x: layout.payment.qrX,
      y: layout.payment.y + 4,
      width: layout.payment.qrSize,
      height: layout.payment.qrSize,
    });
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
  page.drawSvgPath(roundedRectPath(layout.summary.x, layout.summary.y, layout.summary.width, layout.summary.height, 10), {
    color: summaryFill,
    borderColor: summaryBorder,
    borderWidth: 0.7,
  });
  drawLabel(page, 'Souhrn', bold, layout.summary.x + 14, layout.summary.y + 53);
  drawText(page, 'Prace', font, layout.summary.x + 14, layout.summary.y + 39, 7.5);
  drawRightAlignedText(page, money(workAmount), bold, layout.summary.x + 96, layout.summary.y + 39, 7.5, 88);
  drawText(page, 'Naklady', font, layout.summary.x + 14, layout.summary.y + 27, 7.5);
  drawRightAlignedText(page, money(expenseAmount), bold, layout.summary.x + 96, layout.summary.y + 27, 7.5, 88);
  page.drawLine({
    start: { x: layout.summary.x + 14, y: layout.summary.y + 19 },
    end: { x: layout.summary.x + layout.summary.width - 14, y: layout.summary.y + 19 },
    thickness: 0.6,
    color: line,
  });
  drawText(page, 'Celkem', bold, layout.summary.x + 14, layout.summary.y + 7, 9);
  drawRightAlignedText(page, money(totalAmount), bold, layout.summary.x + 91, layout.summary.y + 7, 9, 93);

  drawRule(page, layout.payment.y + layout.payment.height);
  drawLabel(page, 'Platebni udaje', bold, 48, layout.payment.y + 48);
  drawText(page, `IBAN ${text(supplier.iban || 'neni vyplnen')}`, font, 48, layout.payment.y + 34, 7.5, noduSoft);
  drawText(page, `VS ${variableSymbol || 'neni'}`, font, 48, layout.payment.y + 22, 7.5, noduSoft);
  drawText(page, 'Automaticky vystaveno v NODU', font, 48, layout.payment.y + 4, 6.8, noduSoft);
  drawRule(page, 34);
  drawText(page, 'Strana 1/1', font, 508, 20, 6.5, noduSoft);

  return pdfDoc.save();
};
