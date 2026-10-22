import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Invoice } from '../../types';
import { BillingInvoiceCard } from './BillingInvoiceCard';
import { BillingStatementCard } from './BillingStatementCard';
import { parseBillingSnapshot } from './contract';
import { billingSnapshotFixture, id } from './test-fixtures';

const scope = { source: 'supabase' as const, userId: id(2), profileId: id(1), role: 'crew' as const };
const invoice: Invoice = { id: id(55), eid: 1, job: 'J1', status: 'sent', sentAt: null, hours: 1, hAmt: 250, km: 0, kAmt: 0, total: 250, issueDate: '2026-10-19', dueDate: '2026-10-29' };
const invoiceProps = { role: 'crew', busy: false, jobs: [], onDownload: vi.fn(), onLegacyPdf: vi.fn(), onPaid: vi.fn(), onRetry: vi.fn() };
const statementProps = { scope, busy: false, documents: [], jobs: [], onDownload: vi.fn(), onCommand: vi.fn(), onBillingSettings: vi.fn() };
afterEach(() => vi.unstubAllEnvs());

it.each(['America/Los_Angeles', 'Pacific/Kiritimati'])('shows date-only invoice dates in Czech without a day shift in %s', (timezone) => {
  vi.stubEnv('TZ', timezone);
  render(<BillingInvoiceCard {...invoiceProps} invoice={invoice} />);
  expect(screen.getByText('Vystavení: 19. 10. 2026')).toBeVisible();
  expect(screen.getByText('29. 10. 2026')).toBeVisible();
  expect(invoice.issueDate).toBe('2026-10-19');
  expect(invoice.dueDate).toBe('2026-10-29');
});

it.each([
  ['2026-10-19', '2026-10-19', '19. 10. 2026'],
  ['2026-10-19', '2026-10-21', '19.–21. 10. 2026'],
  ['2026-10-30', '2026-11-02', '30. 10.–2. 11. 2026'],
  ['2026-12-31', '2027-01-02', '31. 12. 2026–2. 1. 2027'],
])('keeps the statement range readable from %s to %s', (dateFrom, dateTo, expected) => {
  const statement = parseBillingSnapshot(billingSnapshotFixture(), scope).statements[0];
  Object.assign(statement.financialSnapshot.reports[0], { dateFrom, dateTo });
  render(<BillingStatementCard {...statementProps} statement={statement} />);
  expect(within(screen.getByText('Období').parentElement!).getByText(expected)).toBeVisible();
  fireEvent.click(screen.getByText('Přesný finanční náhled'));
  const preview = screen.getByText('Přesný finanční náhled').closest('details')!;
  expect(within(preview).getByText(expected)).toBeVisible();
  expect(within(within(preview).getByRole('table')).getByText('1. 10. 2026')).toBeVisible();
  expect(within(preview).getByText('15. 10. 2026')).toBeVisible();
  expect(within(preview).getByText('29. 10. 2026')).toBeVisible();
  expect(statement.financialSnapshot.reports[0].dateFrom).toBe(dateFrom);
});

it.each([undefined, '', 'unknown', '2026-02-30', '2026-10-19T00:00:00Z'])('uses a clear fallback for missing or invalid historical invoice date %s', (value) => {
  render(<BillingInvoiceCard {...invoiceProps} invoice={{ ...invoice, issueDate: value, dueDate: value }} />);
  expect(screen.getByText('Vystavení: Neznámé datum')).toBeVisible();
  expect(screen.getByText('Neznámé datum', { exact: true })).toBeVisible();
});
