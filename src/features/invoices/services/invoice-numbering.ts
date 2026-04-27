const INVOICE_SEQUENCE_LENGTH = 4;

export const normalizeInvoiceNamePart = (value: string): string => {
  const normalized = value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase();

  return normalized || 'X';
};

export const buildSelfBillingInvoiceNumber = ({
  year,
  firstName,
  lastName,
  sequence,
}: {
  year: number;
  firstName: string;
  lastName: string;
  sequence: number;
}): string => {
  const surname = normalizeInvoiceNamePart(lastName);
  const firstInitial = normalizeInvoiceNamePart(firstName).slice(0, 1) || 'X';
  const paddedSequence = String(sequence).padStart(INVOICE_SEQUENCE_LENGTH, '0');

  return `SF-${year}-${surname}-${firstInitial}-${paddedSequence}`;
};

export const getInvoiceIssueDate = (now = new Date()): string => (
  now.toISOString().slice(0, 10)
);

export const getInvoiceDueDate = (issueDate: string): string => {
  const date = new Date(`${issueDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 14);
  return date.toISOString().slice(0, 10);
};
