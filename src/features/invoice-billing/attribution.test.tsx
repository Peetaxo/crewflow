import React from 'react';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { Invoice } from '../../types';
import { BillingInvoiceCard } from './BillingInvoiceCard';
import { BillingStatementCard } from './BillingStatementCard';
import { parseBillingSnapshot } from './contract';
import { billingDocumentFixture, billingSnapshotFixture, id } from './test-fixtures';
const actors = [{ profileId: id(19), userId: id(9), name: 'Petra Schvalovatelka' }];
const invoice: Invoice = { id: id(55), eid: 1, hours: 1, hAmt: 250, km: 0, kAmt: 0, total: 250, job: 'J1', status: 'paid', sentAt: null, paidByProfileId: id(19), paidByUserId: id(9), paymentRecordedAt: '2026-10-15T10:00:00Z' };
const invoiceProps = { role: 'coo', busy: false, jobs: [], onDownload: vi.fn(), onLegacyPdf: vi.fn(), onPaid: vi.fn(), onRetry: vi.fn() };
it('shows the persisted payment actor by stable IDs, its original time, and a human invoice fallback', () => {
 render(<BillingInvoiceCard {...invoiceProps} invoice={invoice} actors={actors} />);
 expect(screen.getByRole('heading', { name: 'Faktura bez čísla · J1' })).toBeInTheDocument();
 expect(screen.getByText(/Úhradu zaznamenal\/a: Petra Schvalovatelka/)).toBeInTheDocument();
 expect(screen.getByText(new RegExp(new Date(invoice.paymentRecordedAt!).toLocaleString('cs-CZ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument();
 expect(screen.queryByText(id(55), { exact: false })).not.toBeInTheDocument();
});
it('distinguishes an unavailable actor name from an unrecorded historical actor and never matches a reused numeric ID', () => {
 const view = render(<BillingInvoiceCard {...invoiceProps} invoice={invoice} actors={[{ profileId: id(99), userId: id(98), name: 'Jiný účet' }]} />);
 expect(screen.getByText(/Úhradu zaznamenal\/a: Jméno není dostupné/)).toBeInTheDocument();
 view.rerender(<BillingInvoiceCard {...invoiceProps} invoice={{ ...invoice, paidByProfileId: null, paidByUserId: null }} actors={actors} />);
 expect(screen.getByText(/Úhradu zaznamenal\/a: Autor není zaznamenán/)).toBeInTheDocument();
});
it('shows persisted final approval and document decision attribution from existing authorized actors', () => {
 const raw = billingSnapshotFixture(); raw.statements[0].status = 'document_returned'; raw.statements[0].active_document_id = id(90);
 const doc = billingDocumentFixture(); doc.decision = { id: id(92), document_id: doc.id, statement_id: doc.statement_id, actor_id: id(9), decision: 'return', note: 'Opravte číslo', created_at: '2026-10-15T11:00:00Z' };
 const scope = { source: 'supabase' as const, role: 'crew' as const, userId: id(2), profileId: id(1) }; const data = parseBillingSnapshot({ ...raw, documents: [doc] }, scope);
 render(<BillingStatementCard statement={data.statements[0]} documents={data.documents} jobs={[]} scope={scope} busy={false} actors={actors} onCommand={vi.fn()} onDownload={vi.fn()} onBillingSettings={vi.fn()} />);
 expect(screen.getByText(/Finální schválení: Petra Schvalovatelka/)).toBeInTheDocument();
 expect(screen.getByText(/Kontrolu originálu provedl\/a: Petra Schvalovatelka/)).toBeInTheDocument();
 expect(screen.getByText('Opravte číslo')).toBeInTheDocument();
});
it.each([
 ['supplier_data_incomplete', 'Údaje dodavatele nejsou úplné. Dodavatel je doplní v nastavení profilu.'],
 ['customer_data_incomplete', 'Údaje koncového odběratele nejsou úplné. COO doplní údaje klienta.'],
 ['approval_quote_required', 'Chybí ověřený cenový náhled schválení. Podklad musí ověřit COO.'],
 ['private_internal_unknown', 'Podklad vyžaduje ověření COO. Obnovte podklady nebo požádejte o kontrolu.'],
])('explains blocked reason %s without displaying technical codes', (reason, label) => {
 const raw = billingSnapshotFixture(); raw.statements[0].status = 'blocked'; raw.statements[0].blocked_reason = reason;
 const scope = { source: 'supabase' as const, role: 'crew' as const, userId: id(2), profileId: id(1) }; const data = parseBillingSnapshot(raw, scope);
 render(<BillingStatementCard statement={data.statements[0]} documents={[]} jobs={[]} scope={scope} busy={false} onCommand={vi.fn()} onDownload={vi.fn()} onBillingSettings={vi.fn()} />);
 expect(screen.getByText(label)).toBeInTheDocument(); expect(screen.queryByText(reason, { exact: false })).not.toBeInTheDocument();
});
it('keeps the historical preparer separate from the persisted approver of each report', () => {
 const scope = { source: 'supabase' as const, role: 'crew' as const, userId: id(2), profileId: id(1) };
 const data = parseBillingSnapshot(billingSnapshotFixture(), scope); const s = data.statements[0]; s.captureKind = 'selection'; s.approvedBy = id(29);
 s.sources[0].sourceSnapshot.approvedBy = id(9); s.sources[0].sourceSnapshot.approvedAt = s.approvedAt;
 const props = { statement: s, documents: [], jobs: [], scope, busy: false, actors: [...actors, { userId: id(29), profileId: id(39), name: 'Karel Příprava' }] };
 const view = render(<BillingStatementCard {...props} onCommand={vi.fn()} onDownload={vi.fn()} onBillingSettings={vi.fn()} />);
 expect(screen.getByText(/Podklad připravil\/a: Karel Příprava/)).toBeInTheDocument();
 expect(screen.getByText(/Schválení výkazu Festival: Petra Schvalovatelka/)).toBeInTheDocument();
 expect(screen.queryByText(/Finální schválení: Karel/)).not.toBeInTheDocument();
 s.sources[0].sourceSnapshot.approvedBy = undefined;
 s.sources[0].sourceSnapshot.approval = { status: 'approved', approverUserId: id(9), approverProfileId: id(19), resolvedAt: s.approvedAt };
 view.rerender(<BillingStatementCard {...props} onCommand={vi.fn()} onDownload={vi.fn()} onBillingSettings={vi.fn()} />);
 expect(screen.getByText(/Schválení výkazu Festival: Petra Schvalovatelka/)).toBeInTheDocument();
});
