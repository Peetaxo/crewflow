import { degrees, PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';
import QRCode from 'https://esm.sh/qrcode@1.5.4';
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

const cyan = rgb(0.02, 0.72, 0.82);
const dark = rgb(0.07, 0.09, 0.15);
const muted = rgb(0.42, 0.45, 0.52);
const lightLine = rgb(0.88, 0.9, 0.92);
const softGray = rgb(0.95, 0.96, 0.97);

const money = (value: unknown): string => `${Number(value ?? 0).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kc`;
const text = (value: unknown): string => String(value ?? '');
const numberValue = (value: unknown): number => Number(value ?? 0);

const dataUrlToBytes = (dataUrl: string): Uint8Array => {
  const base64 = dataUrl.split(',')[1] ?? '';
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
};

const drawRotatedLabel = (
  page: ReturnType<PDFDocument['addPage']>,
  value: string,
  y: number,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  color = cyan,
  x = 32,
) => {
  page.drawText(value, {
    x,
    y,
    size: 9,
    font,
    color,
    rotate: degrees(90),
  });
};

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
  const invoiceNumber = text(invoice.invoice_number);
  const totalAmount = numberValue(invoice.total_amount);

  drawRotatedLabel(page, 'IDENTIFIKACNI UDAJE', 700, bold);
  page.drawText('Dodavatel', { x: 48, y: 790, size: 10, font: bold, color: dark });
  page.drawText(text(supplier.name), { x: 48, y: 774, size: 10, font: bold, color: dark });
  page.drawText(`${text(supplier.billingStreet)}, ${text(supplier.billingZip)} ${text(supplier.billingCity)}`, { x: 48, y: 758, size: 9, font, color: dark });
  page.drawText(text(supplier.billingCountry), { x: 48, y: 744, size: 9, font, color: dark });
  page.drawText(`IC: ${text(supplier.ico)}`, { x: 48, y: 730, size: 9, font, color: dark });
  page.drawText('Dodavatel neni platcem DPH', { x: 48, y: 716, size: 9, font, color: dark });

  page.drawLine({ start: { x: 310, y: 790 }, end: { x: 310, y: 610 }, thickness: 1, color: lightLine });
  page.drawText('Faktura', { x: 345, y: 790, size: 18, font: bold, color: dark });
  page.drawRectangle({ x: 345, y: 756, width: 178, height: 26, borderColor: lightLine, borderWidth: 1 });
  page.drawText(invoiceNumber, { x: 356, y: 765, size: 11, font: bold, color: dark });
  page.drawText('Vystaveno odberatelem', { x: 345, y: 724, size: 10, font: bold, color: dark });

  page.drawText('Odberatel', { x: 345, y: 690, size: 10, font: bold, color: dark });
  page.drawText(text(customer.name), { x: 345, y: 674, size: 10, font: bold, color: dark });
  page.drawText(`${text(customer.street)}, ${text(customer.zip)} ${text(customer.city)}`, { x: 345, y: 658, size: 9, font, color: dark });
  page.drawText(text(customer.country), { x: 345, y: 644, size: 9, font, color: dark });
  page.drawText(`IC: ${text(customer.ico)}    DIC: ${text(customer.dic || 'neni')}`, { x: 345, y: 630, size: 9, font, color: dark });

  page.drawText(`Datum vystaveni:`, { x: 48, y: 600, size: 9, font, color: dark });
  page.drawText(text(invoice.issue_date), { x: 132, y: 600, size: 9, font: bold, color: dark });
  page.drawText(`Datum splatnosti:`, { x: 190, y: 600, size: 9, font, color: dark });
  page.drawText(text(invoice.due_date), { x: 284, y: 600, size: 9, font: bold, color: dark });

  page.drawRectangle({ x: 0, y: 485, width: 476, height: 78, color: cyan });
  page.drawText('PLATEBNI UDAJE', { x: 48, y: 548, size: 8, font: bold, color: rgb(1, 1, 1) });
  page.drawText('Bankovni ucet', { x: 48, y: 530, size: 8, font, color: rgb(1, 1, 1) });
  page.drawText(text(supplier.bankAccount), { x: 48, y: 520, size: 10, font: bold, color: rgb(1, 1, 1) });
  page.drawText(`IBAN: ${text(supplier.iban || 'neni vyplnen')}`, { x: 48, y: 502, size: 8, font, color: rgb(1, 1, 1) });
  page.drawText('Variabilni symbol', { x: 220, y: 540, size: 8, font, color: rgb(1, 1, 1) });
  page.drawText(invoiceNumber.replace(/\D/g, '').slice(0, 10), { x: 220, y: 520, size: 10, font: bold, color: rgb(1, 1, 1) });
  page.drawText('K uhrade', { x: 382, y: 520, size: 9, font, color: rgb(1, 1, 1) });
  page.drawText(money(totalAmount), { x: 365, y: 498, size: 14, font: bold, color: rgb(1, 1, 1) });

  if (supplier.iban) {
    const qrPayload = buildQrPaymentPayload({
      iban: text(supplier.iban),
      amount: totalAmount,
      currency: text(invoice.currency || 'CZK'),
      invoiceNumber,
      recipientName: text(supplier.name),
    });
    const qrDataUrl = await QRCode.toDataURL(qrPayload, { errorCorrectionLevel: 'M', margin: 1, width: 108 });
    const qrImage = await pdfDoc.embedPng(dataUrlToBytes(qrDataUrl));
    page.drawImage(qrImage, { x: 490, y: 478, width: 72, height: 72 });
    page.drawText('QR Platba', { x: 505, y: 465, size: 8, font: bold, color: dark });
  } else {
    page.drawText('QR platba neni dostupna', { x: 480, y: 520, size: 8, font: bold, color: muted });
    page.drawText('Dodavateli chybi IBAN.', { x: 480, y: 506, size: 8, font, color: muted });
  }

  drawRotatedLabel(page, 'FAKTURUJEME VAM', 372, bold);
  page.drawText('Fakturujeme Vam za dodane sluzby:', { x: 48, y: 455, size: 9, font, color: dark });
  page.drawText('Oznaceni dodavky', { x: 48, y: 425, size: 8, font: bold, color: dark });
  page.drawText('Hodiny', { x: 300, y: 425, size: 8, font: bold, color: dark });
  page.drawText('Cestovne', { x: 360, y: 425, size: 8, font: bold, color: dark });
  page.drawText('Uctenky', { x: 425, y: 425, size: 8, font: bold, color: dark });
  page.drawText('Celkem', { x: 508, y: 425, size: 8, font: bold, color: dark });
  page.drawLine({ start: { x: 48, y: 416 }, end: { x: 550, y: 416 }, thickness: 1, color: lightLine });

  let rowY = 400;
  items.forEach((item) => {
    page.drawRectangle({ x: 48, y: rowY - 6, width: 502, height: 17, color: softGray });
    page.drawText(text(item.job_number), { x: 50, y: rowY, size: 8, font, color: dark });
    page.drawText(String(numberValue(item.hours).toLocaleString('cs-CZ')), { x: 310, y: rowY, size: 8, font, color: dark });
    page.drawText(money(item.amount_km), { x: 355, y: rowY, size: 8, font, color: dark });
    page.drawText(money(item.amount_receipts), { x: 420, y: rowY, size: 8, font, color: dark });
    page.drawText(money(item.total_amount), { x: 493, y: rowY, size: 8, font: bold, color: dark });
    rowY -= 22;
  });

  drawRotatedLabel(page, 'REKAPITULACE', 220, bold);
  page.drawRectangle({ x: 300, y: 190, width: 250, height: 28, color: cyan });
  page.drawText('Celkem k uhrade:', { x: 365, y: 200, size: 11, font: bold, color: rgb(1, 1, 1) });
  page.drawText(money(totalAmount), { x: 470, y: 200, size: 11, font: bold, color: rgb(1, 1, 1) });
  page.drawLine({ start: { x: 48, y: 34 }, end: { x: 550, y: 34 }, thickness: 1, color: lightLine });
  page.drawText(`Vystaveno automaticky v NODU`, { x: 48, y: 20, size: 7, font, color: muted });
  page.drawText('Strana 1/1', { x: 505, y: 20, size: 7, font, color: muted });

  return pdfDoc.save();
};
