export type InvoicePdfLayout = {
  page: {
    width: number;
    height: number;
    marginX: number;
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
    items: {
      headerY: 378,
      startY: 350,
      rowHeight,
      fontSize: 7,
    },
    summary: {
      x: 350,
      y: Math.max(naturalSummaryY, minimumSummaryY),
      width: 197,
      height: summaryHeight,
    },
    payment: {
      y: paymentY,
      height: paymentHeight,
    },
    minimumSectionGap,
  };
};
