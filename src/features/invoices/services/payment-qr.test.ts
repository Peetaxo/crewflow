import { describe, expect, it } from 'vitest';
import { buildQrPaymentPayload, getVariableSymbol, normalizeIban } from '../../../../supabase/functions/generate-invoice-pdf/payment-qr';

describe('payment QR helpers', () => {
  it('normalizes stored IBAN for QR payment payload', () => {
    expect(normalizeIban('CZ57 5500 0000 0010 2484 5897')).toBe('CZ5755000000001024845897');
  });

  it('builds QR Platba payload for self-billing invoice', () => {
    expect(buildQrPaymentPayload({
      iban: 'CZ57 5500 0000 0010 2484 5897',
      amount: 3060,
      currency: 'CZK',
      invoiceNumber: 'SF-2026-HEITZER-P-0001',
      recipientName: 'Petr Heitzer',
    })).toBe('SPD*1.0*ACC:CZ5755000000001024845897*AM:3060.00*CC:CZK*MSG:SF-2026-HEITZER-P-0001*X-VS:20260001*RN:Petr Heitzer');
  });

  it('uses year and sequence as variable symbol', () => {
    expect(getVariableSymbol('SF-2026-HEITZER-P-0001')).toBe('20260001');
  });
});
