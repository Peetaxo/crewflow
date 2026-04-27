import { describe, expect, it } from 'vitest';
import {
  buildSelfBillingInvoiceNumber,
  getInvoiceDueDate,
  getInvoiceIssueDate,
  normalizeInvoiceNamePart,
} from './invoice-numbering';

describe('invoice numbering helpers', () => {
  it('normalizes Czech names for invoice numbers', () => {
    expect(normalizeInvoiceNamePart('Štěrbová')).toBe('STERBOVA');
    expect(normalizeInvoiceNamePart(' Novák ')).toBe('NOVAK');
  });

  it('builds self-billing invoice number with year surname initial and sequence', () => {
    expect(buildSelfBillingInvoiceNumber({
      year: 2026,
      firstName: 'Tomáš',
      lastName: 'Novák',
      sequence: 1,
    })).toBe('SF-2026-NOVAK-T-0001');
  });

  it('uses X placeholders for missing name parts', () => {
    expect(buildSelfBillingInvoiceNumber({
      year: 2026,
      firstName: '',
      lastName: '',
      sequence: 12,
    })).toBe('SF-2026-X-X-0012');
  });

  it('derives issue and due dates in YYYY-MM-DD', () => {
    expect(getInvoiceIssueDate(new Date('2026-04-27T10:00:00Z'))).toBe('2026-04-27');
    expect(getInvoiceDueDate('2026-04-27')).toBe('2026-05-11');
  });
});
