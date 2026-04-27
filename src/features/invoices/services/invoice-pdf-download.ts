type InvoicePdfWindowTarget = {
  open: Window['open'];
  location: Pick<Location, 'assign'>;
};

export const openInvoicePdfUrl = (
  url: string,
  target: InvoicePdfWindowTarget = window,
) => {
  const openedWindow = target.open(url, '_blank', 'noopener,noreferrer');
  if (!openedWindow) {
    target.location.assign(url);
  }
};
