export type InvoicePdfLayout = {
  page: {
    width: number;
    height: number;
    marginX: number;
  };
  header: {
    logoX: number;
    logoY: number;
    logoWidth: number;
    invoiceNumberX: number;
    invoiceNumberWidth: number;
  };
  items: {
    headerY: number;
    startY: number;
    rowHeight: number;
    fontSize: number;
  };
  summary: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  payment: {
    y: number;
    height: number;
    qrX: number;
    qrSize: number;
  };
  minimumSectionGap: number;
};

export const buildInvoicePdfLayout = (itemCount: number): InvoicePdfLayout => {
  const rowHeight = 18;
  const summaryHeight = 70;
  const paymentY = 72;
  const paymentHeight = 76;
  const minimumSectionGap = 22;
  const naturalSummaryY = 372 - Math.max(itemCount, 1) * rowHeight - 94;
  const minimumSummaryY = paymentY + paymentHeight + minimumSectionGap;

  return {
    page: {
      width: 595,
      height: 842,
      marginX: 48,
    },
    header: {
      logoX: 408,
      logoY: 774,
      logoWidth: 76,
      invoiceNumberX: 408,
      invoiceNumberWidth: 132,
    },
    items: {
      headerY: 378,
      startY: 350,
      rowHeight,
      fontSize: 7,
    },
    summary: {
      x: 342,
      y: Math.max(naturalSummaryY, minimumSummaryY),
      width: 205,
      height: summaryHeight,
    },
    payment: {
      y: paymentY,
      height: paymentHeight,
      qrX: 476,
      qrSize: 70,
    },
    minimumSectionGap,
  };
};
export type InvoicePdfPage = { offset: number; count: number; startY: number; summary: boolean };
export const buildInvoicePdfPages = (itemCount: number, firstStartY = 350): InvoicePdfPage[] => {
  const pages: InvoicePdfPage[] = [];
  let offset = 0;
  let remaining = itemCount;
  let startY = firstStartY;
  do {
    const lastCapacity = Math.max(0, Math.floor((startY - 270) / 18) + 1);
    const capacity = Math.max(0, Math.floor((startY - 64) / 18) + 1);
    if (remaining <= lastCapacity) { pages.push({ offset, count: remaining, startY, summary: true }); break; }
    const count = Math.min(capacity, Math.max(0, remaining - 1));
    pages.push({ offset, count, startY, summary: false });
    remaining -= count; offset += count; startY = 730;
  } while (remaining >= 0);
  return pages;
};
export const formatInvoiceDuration = (hours: number): string => {
  const minutes = Math.round(Number(hours || 0) * 60);
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};
export const invoiceCostSubtotal = (items: { amount_km?: unknown; amount_meals?: unknown; amount_receipts?: unknown }[]): number => items.reduce((sum, item) => sum + Number(item.amount_km ?? 0) + Number(item.amount_meals ?? 0) + Number(item.amount_receipts ?? 0), 0);
export const wrapInvoiceText = (value: string, width: number, measure: (s: string) => number): string[] => {
  const lines: string[] = [];
  for (const paragraph of value.split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && measure(`${line} ${word}`) <= width) { line += ` ${word}`; continue; }
      if (line) { lines.push(line); line = ''; }
      for (const char of word) {
        if (line && measure(line + char) > width) { lines.push(line); line = ''; }
        line += char;
      }
    }
    lines.push(line);
  }
  return lines;
};
