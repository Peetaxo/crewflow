import { PDFDocument, rgb } from 'https://esm.sh/pdf-lib@1.17.1';
import fontkit from 'https://esm.sh/@pdf-lib/fontkit@1.1.1';
import QRCode from 'https://esm.sh/qrcode@1.5.4';
import { buildInvoicePdfLayout, buildInvoicePdfPages, formatInvoiceDuration, invoiceCostSubtotal, wrapInvoiceText } from './invoice-pdf-layout.ts';
import { buildQrPaymentPayload, getVariableSymbol } from './payment-qr.ts';

export type InvoiceItem = {
  job_number: string;
  hours: number;
  amount_hours: number;
  km: number;
  amount_km: number;
  amount_receipts: number;
  amount_meals?: number;
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


const money = (value: unknown): string => `${Number(value ?? 0).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč`;
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
  let page = pdfDoc.addPage([layout.page.width, layout.page.height]);
  pdfDoc.registerFontkit(fontkit);
  const [regularBytes, boldBytes, logoBytes] = await Promise.all([
    Deno.readFile(new URL('./assets/NotoSans-Regular.ttf', import.meta.url)),
    Deno.readFile(new URL('./assets/NotoSans-Bold.ttf', import.meta.url)),
    Deno.readFile(new URL('./assets/nodu-wordmark.png', import.meta.url)),
  ]);
  const font = await pdfDoc.embedFont(regularBytes, { subset: true });
  const bold = await pdfDoc.embedFont(boldBytes, { subset: true });
  const logoImage = await pdfDoc.embedPng(logoBytes);
  const invoiceNumber = text(invoice.invoice_number);
  const totalAmount = numberValue(invoice.total_amount);
  const variableSymbol = getVariableSymbol(invoiceNumber);

  page.drawRectangle({ x: 0, y: 0, width: layout.page.width, height: layout.page.height, color: white });
  drawLabel(page, 'Faktura vystavená odběratelem', bold, 48, 790);
  drawText(page, 'Faktura', bold, 48, 760, 28);
  page.drawImage(logoImage, {
    x: layout.header.logoX,
    y: layout.header.logoY,
    width: layout.header.logoWidth,
    height: layout.header.logoWidth * (110 / 320),
  });
  drawRightAlignedText(page, invoiceNumber, bold, layout.header.invoiceNumberX, 748, 10, layout.header.invoiceNumberWidth);
  drawRule(page, 728);

  type LegalLine = { value: string; bold: boolean; size: number };
  const legalLines = (snapshot: Snapshot, isSupplier: boolean): LegalLine[] => {
    const values = [
      { value: text(snapshot.name), bold: true, size: 10 },
      { value: [isSupplier ? snapshot.billingStreet : snapshot.street, `${text(isSupplier ? snapshot.billingZip : snapshot.zip)} ${text(isSupplier ? snapshot.billingCity : snapshot.city)}`, isSupplier ? snapshot.billingCountry : snapshot.country].filter(Boolean).join(', '), bold: false, size: 9 },
      { value: `IČ: ${text(snapshot.ico)}`, bold: false, size: 9 },
      { value: isSupplier ? 'Není plátcem DPH' : `DIČ: ${text(snapshot.dic || 'není')}`, bold: false, size: 9 },
    ];
    return values.flatMap(entry => wrapInvoiceText(entry.value, 235, value => (entry.bold ? bold : font).widthOfTextAtSize(value, entry.size)).map(value => ({ ...entry, value })));
  };
  const supplierLines = legalLines(supplier, true);
  const customerLines = legalLines(customer, false);
  const legalCount = Math.max(supplierLines.length, customerLines.length);
  let legalBottom = 632;
  // Extremely long legal identities continue on further pages, retaining every character.
  for (let offset = 0; offset < legalCount; offset += 25) {
    if (offset > 0) page = pdfDoc.addPage([layout.page.width, layout.page.height]);
    const top = offset === 0 ? 686 : 770;
    drawLabel(page, offset ? 'Dodavatel - pokračování' : 'Dodavatel', bold, 48, top);
    drawLabel(page, offset ? 'Odběratel - pokračování' : 'Odběratel', bold, 300, top);
    for (const [column, entries] of [[48, supplierLines], [300, customerLines]] as const) {
      entries.slice(offset, offset + 25).forEach((entry, index) => drawText(page, entry.value, entry.bold ? bold : font, column, top - 15 - index * 13, entry.size, entry.bold ? noduText : noduSoft));
    }
    legalBottom = top - 15 - (Math.min(25, legalCount - offset) - 1) * 13;
  }
  const datesRule = Math.min(612, legalBottom - 20);
  drawRule(page, datesRule);
  for (const [label, value, x] of [['Vystavení', invoice.issue_date, 48], ['Datum plnění', invoice.taxable_supply_date, 175], ['Splatnost', invoice.due_date, 312], ['Měna', invoice.currency || 'CZK', 445]] as const) {
    drawLabel(page, label, bold, x, datesRule - 26);
    drawText(page, text(value), bold, x, datesRule - 38, 8.5);
  }
  drawRule(page, datesRule - 60);
  const firstStart = Math.min(350, datesRule - 116);
  const itemPages = buildInvoicePdfPages(items.length, firstStart);
  itemPages.forEach((itemPage, pageIndex) => {
    if (pageIndex > 0) {
      page = pdfDoc.addPage([layout.page.width, layout.page.height]);
      drawText(page, `Faktura ${invoiceNumber} - pokračování`, bold, 48, 790, 10);
    }
    const headerY = itemPage.startY + 28;
    drawRule(page, headerY + 18);
    drawLabel(page, 'Položka', bold, 48, headerY);
    drawLabel(page, 'Rozsah', bold, 300, headerY);
    drawLabel(page, 'Celkem', bold, 505, headerY);
    items.slice(itemPage.offset, itemPage.offset + itemPage.count).forEach((item, index) => {
      const rowY = itemPage.startY - index * layout.items.rowHeight;
      page.drawRectangle({ x: 42, y: rowY - 7, width: 511, height: 15, color: index % 2 === 0 ? softRow : white });
      drawText(page, fitText(text(item.job_number), 48), index === 0 ? bold : font, 48, rowY - 1, layout.items.fontSize);
      drawText(page, formatInvoiceDuration(numberValue(item.hours)), font, 300, rowY - 1, layout.items.fontSize);
      drawRightAlignedText(page, money(item.total_amount), bold, 455, rowY - 1, layout.items.fontSize, 92);
    });
    if (itemPage.summary) layout.summary.y = Math.max(170, Math.min(430, itemPage.startY - Math.max(0, itemPage.count - 1) * 18 - 90));
  });

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
    drawText(page, 'QR platba není dostupná', bold, 420, layout.payment.y + 42, 7, noduSoft);
    drawText(page, 'Dodavateli chybí IBAN.', font, 420, layout.payment.y + 30, 7, noduSoft);
  }

  const workAmount = items.reduce((sum, item) => sum + numberValue(item.amount_hours), 0);
  const expenseAmount = invoiceCostSubtotal(items);
  page.drawSvgPath(roundedRectPath(layout.summary.x, layout.summary.y, layout.summary.width, layout.summary.height, 10), {
    color: summaryFill,
    borderColor: summaryBorder,
    borderWidth: 0.7,
  });
  drawLabel(page, 'Souhrn', bold, layout.summary.x + 14, layout.summary.y + 53);
  drawText(page, 'Práce', font, layout.summary.x + 14, layout.summary.y + 39, 7.5);
  drawRightAlignedText(page, money(workAmount), bold, layout.summary.x + 96, layout.summary.y + 39, 7.5, 88);
  drawText(page, 'Náklady', font, layout.summary.x + 14, layout.summary.y + 27, 7.5);
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
  drawLabel(page, 'Platební údaje', bold, 48, layout.payment.y + 54);
  drawText(page, `Účet ${text(supplier.bankAccount)}`, font, 48, layout.payment.y + 40, 7.5, noduSoft);
  drawText(page, `IBAN ${text(supplier.iban || 'není vyplněn')}`, font, 48, layout.payment.y + 26, 7.5, noduSoft);
  drawText(page, `VS ${variableSymbol || 'není'}`, font, 48, layout.payment.y + 12, 7.5, noduSoft);
  drawText(page, 'Automaticky vystaveno v NODU', font, 48, layout.payment.y, 6.8, noduSoft);
  const allPages = pdfDoc.getPages();
  allPages.forEach((footerPage, index) => {
    drawRule(footerPage, 34);
    drawText(footerPage, `Strana ${index + 1}/${allPages.length}`, font, 508, 20, 6.5, noduSoft);
  });

  return pdfDoc.save();
};
