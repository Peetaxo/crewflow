import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BillingConsentPanel } from './BillingConsentPanel';
import { BillingStatementCard } from './BillingStatementCard';
import { parseBillingSnapshot, type BillingDocument } from './contract';
import { billingSnapshotFixture, id } from './test-fixtures';
const scope = { source: 'supabase' as const, userId: id(2), profileId: id(1), role: 'crew' as const };
const data = () => parseBillingSnapshot(billingSnapshotFixture(), scope);
describe('billing consent and document decisions', () => {
  it('defaults standing consent off and requires the full explicit declaration', () => {
    const submit = vi.fn(); render(<BillingConsentPanel snapshot={data()} onCommand={submit} busy={false} />);
    const enable = screen.getByRole('button', { name: 'Zapnout trvalý souhlas' });
    expect(enable).toBeDisabled(); expect(screen.getByRole('checkbox')).not.toBeChecked();
    fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(enable);
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'consent', enabled: true, nonVatConfirmed: true, expectedUpdatedAt: null }));
  });
  it('requires confirmation for this exact invoice preview', () => {
    const submit = vi.fn(); const s = data().statements[0];
    render(<BillingStatementCard statement={s} documents={[]} jobs={[]} scope={scope} onCommand={submit} onDownload={vi.fn()} onBillingSettings={vi.fn()} busy={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Vystavit mým jménem' }));
    const issue = screen.getByRole('button', { name: 'Potvrdit a vystavit fakturu' }); expect(issue).toBeDisabled();
    const preview = screen.getByText('Přesný finanční náhled').closest('details')!;
    expect(within(preview).getByText('Koncový klient')).toBeVisible(); expect(within(preview).getAllByText(/8 h 20 min/).length).toBeGreaterThan(0);
    fireEvent.click(issue); expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(issue);
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'confirm', statementId: s.id, expectedUpdatedAt: s.updatedAt, nonVatConfirmed: true }));
  });
  it.each(['Vystavit mým jménem', 'Nahrát vlastní PDF'])('opens the exact collapsed preview before %s without submitting or granting consent', (action) => {
    const submit = vi.fn();
    render(<BillingStatementCard statement={data().statements[0]} documents={[]} jobs={[]} scope={scope} onCommand={submit} onDownload={vi.fn()} onBillingSettings={vi.fn()} busy={false} />);
    const summary = screen.getByText('Přesný finanční náhled');
    const preview = summary.closest('details')!;
    expect(preview).not.toHaveAttribute('open');
    expect(within(preview).getByText('Účet: 123/0100')).not.toBeVisible();
    fireEvent.click(summary);
    expect(within(preview).getByText('Účet: 123/0100')).toBeVisible();
    fireEvent.click(summary);
    expect(within(preview).getByText('Účet: 123/0100')).not.toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: action }));
    expect(preview).toHaveAttribute('open');
    expect(within(preview).getByText('Účet: 123/0100')).toBeVisible();
    expect(within(preview).getByText('Koncový klient')).toBeVisible();
    expect(within(preview).getByRole('table', { name: 'Schválené dny a stravné' })).toBeVisible();
    expect(submit).not.toHaveBeenCalled();
    if (action === 'Vystavit mým jménem') {
      expect(screen.getByRole('checkbox')).not.toBeChecked();
      expect(screen.getByRole('button', { name: 'Potvrdit a vystavit fakturu' })).toBeDisabled();
    } else {
      expect(screen.getByRole('button', { name: 'Nahrát originál ke kontrole CH' })).toBeDisabled();
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    }
  });
  it('blocks concurrent selfbilling during owned original review and gives CH alone document decisions', () => {
    const s = { ...data().statements[0], status: 'document_pending' as const, activeDocumentId: id(90) };
    const doc = { id: id(90), statementId: s.id, externalInvoiceNumber: 'EXT01', decision: null, storagePath: 'original.pdf', createdAt: s.updatedAt } as BillingDocument;
    const submit = vi.fn();
    const view = render(<BillingStatementCard statement={s} documents={[doc]} jobs={[]} scope={scope} onCommand={submit} onDownload={vi.fn()} onBillingSettings={vi.fn()} busy={false} />);
    expect(screen.queryByRole('button', { name: 'Vystavit mým jménem' })).not.toBeInTheDocument();
    view.rerender(<BillingStatementCard statement={s} documents={[doc]} jobs={[]} scope={{ ...scope, role: 'coo' }} onCommand={submit} onDownload={vi.fn()} onBillingSettings={vi.fn()} busy={false} />);
    expect(screen.queryByRole('button', { name: 'Přijmout originál' })).not.toBeInTheDocument();
    view.rerender(<BillingStatementCard statement={s} documents={[doc]} jobs={[]} scope={{ ...scope, role: 'crewhead' }} onCommand={submit} onDownload={vi.fn()} onBillingSettings={vi.fn()} busy={false} />);
    expect(screen.getByRole('button', { name: 'Vrátit originál' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Důvod vrácení originálu'), { target: { value: 'Chybné číslo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vrátit originál' }));
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'review', expectedUpdatedAt: s.updatedAt, documentId: doc.id, note: 'Chybné číslo' }));
  });
  it('shows an old provenance statement read-only without offering false repair actions', () => {
    const s = { ...data().statements[0], needsSourceVerification: true };
    render(<BillingStatementCard statement={s} documents={[]} jobs={[]} scope={scope} onCommand={vi.fn()} onDownload={vi.fn()} onBillingSettings={vi.fn()} busy={false} />);
    expect(screen.queryByRole('button', { name: 'Vystavit mým jménem' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Obnovit údaje a data náhledu' })).not.toBeInTheDocument();
    expect(screen.getByText(/původní verzi před schválením/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Přesný finanční náhled'));
    expect(screen.getByText('Účet: 123/0100')).toBeVisible();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

});
