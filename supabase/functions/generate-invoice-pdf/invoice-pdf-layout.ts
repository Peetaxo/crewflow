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
