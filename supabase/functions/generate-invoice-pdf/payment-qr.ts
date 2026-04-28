type QrPaymentInput = {
  iban: string;
  amount: number;
  currency: string;
  invoiceNumber: string;
  recipientName: string;
};

const sanitizeQrValue = (value: string): string => value.replace(/\*/g, ' ').trim();

export const normalizeIban = (iban: string): string => iban.replace(/\s/g, '').toUpperCase();

export const getVariableSymbol = (invoiceNumber: string): string => {
  const year = invoiceNumber.match(/SF-(\d{4})/)?.[1] ?? '';
  const sequence = invoiceNumber.match(/-(\d{1,10})$/)?.[1] ?? '';
  return `${year}${sequence}`.slice(0, 10);
};

export const buildQrPaymentPayload = ({
  iban,
  amount,
  currency,
  invoiceNumber,
  recipientName,
}: QrPaymentInput): string => {
  const normalizedIban = normalizeIban(iban);
  const variableSymbol = getVariableSymbol(invoiceNumber);

  if (!normalizedIban || !/^CZ\d{22}$/.test(normalizedIban)) {
    throw new Error('Dodavateli chybi platny IBAN pro QR platbu.');
  }

  return [
    'SPD',
    '1.0',
    `ACC:${normalizedIban}`,
    `AM:${amount.toFixed(2)}`,
    `CC:${currency || 'CZK'}`,
    `MSG:${sanitizeQrValue(invoiceNumber)}`,
    variableSymbol ? `X-VS:${variableSymbol}` : null,
    `RN:${sanitizeQrValue(recipientName)}`,
  ].filter(Boolean).join('*');
};
