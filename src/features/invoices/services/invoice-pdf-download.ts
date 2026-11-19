import { canSaveNativeDocument, saveNativeDocument } from '../../../lib/native-document';

type InvoicePdfWindowTarget = {
  location: Pick<Location, 'assign'>;
};

export const openInvoicePdfUrl = async (
  url: string,
  target: InvoicePdfWindowTarget = window,
  isCurrent = () => true,
) => {
  if (!isCurrent()) return;
  if (!canSaveNativeDocument()) {
    // Browser navigation honors the signed attachment without requiring a popup.
    target.location.assign(url);
    return;
  }

  const response = await fetch(url);
  if (!isCurrent()) return;
  if (!response.ok) throw new Error('PDF se nepodařilo stáhnout.');

  const pathName = new URL(url).pathname.split('/').at(-1) ?? '';
  const filename = /^[a-z0-9._-]+\.pdf$/i.test(pathName) ? pathName : 'faktura.pdf';
  const file = new File([await response.arrayBuffer()], filename, { type: 'application/pdf' });
  await saveNativeDocument(file, isCurrent);
};
