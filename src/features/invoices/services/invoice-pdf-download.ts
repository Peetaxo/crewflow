type InvoicePdfWindowTarget = {
  location: Pick<Location, 'assign'>;
};

export const openInvoicePdfUrl = (
  url: string,
  target: InvoicePdfWindowTarget = window,
) => {
  // Signed URLs use Content-Disposition: attachment. One navigation downloads
  // the file without a popup; noopener's null return cannot trigger a second one.
  target.location.assign(url);
};
