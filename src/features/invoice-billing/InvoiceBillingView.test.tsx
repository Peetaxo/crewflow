import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { parseBillingSnapshot, type BillingSnapshot } from './contract';
import { billingSnapshotFixture, id } from './test-fixtures';
import InvoiceBillingView from './InvoiceBillingView';
const io = vi.hoisted(() => ({ key: 'A', active: true, invoice: { id: 'invoice-1', billingStatementId: 'statement-1', billingKind: 'uploaded', supplierSnapshot: { name: 'Zmrazený dodavatel' }, customerSnapshot: { name: 'Zmrazený klient' }, job: 'JOB1', total: 100.25, hours: 1, hAmt: 100.25, kAmt: 0, mealAmt: 0, km: 0, status: 'sent', pdfPath: 'original.pdf' }, role: 'crew', paid: vi.fn(), refetch: vi.fn(), success: vi.fn(), error: vi.fn(), url: vi.fn(), open: vi.fn(), snapshot: null as BillingSnapshot | null }));
vi.mock('./useBillingActors', () => ({ useBillingActors: () => ({ data: [] }) }));
vi.mock('./useBilling', () => ({ useBilling: () => ({ scopeKey: io.key, ready: true, scope: { role: io.role, userId: id(2), profileId: id(1), source: 'supabase' }, query: { data: io.snapshot }, capture: () => { const key = io.key; return () => io.active && key === io.key; }, execute: vi.fn(), reload: vi.fn(), saving: false }) }));
vi.mock('../invoices/queries/useInvoicesQuery', () => ({ useInvoicesQuery: () => ({ data: [io.invoice], refetch: io.refetch }) }));
vi.mock('../../context/useAppContext', () => ({ useAppContext: () => ({ searchQuery: '', setCurrentTab: vi.fn(), setSettingsSection: vi.fn() }) }));
vi.mock('../invoices/services/invoices.service', () => ({ approveInvoice: (...args: unknown[]) => io.paid(...args), getInvoiceDependencies: () => ({ timelogs: [], contractors: [], events: [] }) }));
vi.mock('../invoices/services/invoice-pdf.service', () => ({ getInvoicePdfDownloadUrl: (...args: unknown[]) => io.url(...args), generateInvoicePdf: vi.fn() }));
vi.mock('../invoices/services/invoice-pdf-download', () => ({ openInvoicePdfUrl: (...args: unknown[]) => io.open(...args) }));
vi.mock('sonner', () => ({ toast: { success: (...args: unknown[]) => io.success(...args), error: (...args: unknown[]) => io.error(...args) } }));
beforeEach(() => { io.role = 'crew'; io.paid.mockReset(); io.refetch.mockReset(); io.success.mockReset(); io.error.mockReset(); io.key = 'A'; io.active = true; io.url.mockReset(); io.open.mockReset(); io.snapshot = parseBillingSnapshot(billingSnapshotFixture(), { source: 'supabase', role: 'crew', userId: id(2), profileId: id(1) }); });
it('separates pending statements from actual invoices and preserves original source labels', () => {
  render(<InvoiceBillingView />);
  expect(screen.getByRole('heading', { name: 'K fakturaci (1)' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Vystavené a přijaté faktury (1)' })).toBeInTheDocument();
  expect(screen.getByText('Přijatý originál PDF')).toBeInTheDocument();
  expect(screen.getByText('Zmrazený dodavatel')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /generovat PDF/i })).not.toBeInTheDocument();
});
it('does not open a late original download after owner identity changes', async () => {
  let finish!: (value: string) => void;
  io.url.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const view = render(<InvoiceBillingView />);
  fireEvent.click(screen.getByRole('button', { name: 'Stáhnout originál PDF' }));
  io.key = 'B'; view.rerender(<InvoiceBillingView />);
  await act(async () => finish('https://private/old-owner.pdf'));
  expect(io.open).not.toHaveBeenCalled();
});

it.each(['missing', 'uncertain'])('uses the current invoice for payment and never announces success for a %s server result', async (result) => {
  io.role = 'coo';
  if (result === 'missing') io.paid.mockResolvedValue(null); else io.paid.mockRejectedValue(new Error('Výsledek není potvrzený.'));  render(<InvoiceBillingView />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Zaznamenat přijatou úhradu' })); });
  await vi.waitFor(() => expect(io.paid).toHaveBeenCalledWith(io.invoice.id, io.invoice));
  expect(io.success).not.toHaveBeenCalled();
  expect(io.refetch).toHaveBeenCalled();
  expect(io.error).toHaveBeenCalled();
});

it('announces payment only after a confirmed result and authoritative refresh', async () => {
  io.role = 'coo'; io.paid.mockResolvedValue({ ...io.invoice, status: 'paid' });
  let finish!: () => void; io.refetch.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
  render(<InvoiceBillingView />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Zaznamenat přijatou úhradu' })); });
  expect(io.success).not.toHaveBeenCalled();
  await act(async () => finish()); expect(io.success).toHaveBeenCalledWith('Úhrada byla zaznamenána.');
});
