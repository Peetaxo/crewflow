import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { BillingPrepareSelection } from './BillingPrepareSelection';
import { parseBillingSnapshot } from './contract';
import { billingSnapshotFixture, id } from './test-fixtures';
const io = vi.hoisted(() => ({ status: 'approved', extra: [] as { id: number; eid: number; supabaseId: string; contractorProfileId: string; status: string }[] }));
beforeEach(() => { io.status = 'approved'; io.extra = []; });
vi.mock('../invoices/services/invoices.service', () => ({ getInvoiceDependencies: () => ({ contractors: [{ profileId: id(1), name: 'Jan' }], events: [{ id: 1, name: 'Třídenní akce', job: 'JOB' }], timelogs: [{ id: 1, eid: 1, supabaseId: id(3), contractorProfileId: id(1), status: io.status, days: [{ d: '2026-10-01' }, { d: '2026-10-02' }, { d: '2026-10-03' }] }, ...io.extra] }) }));
const snapshot = () => { const raw = billingSnapshotFixture(); raw.statements = []; return parseBillingSnapshot(raw, { source: 'supabase', userId: id(2), profileId: id(1), role: 'coo' }); };
it('prepares one canonical report for three daily rows without issuing or guessing an amount', () => {
 const submit = vi.fn(); render(<BillingPrepareSelection snapshot={snapshot()} available busy={false} onCommand={submit} />);
 expect(screen.getAllByRole('checkbox')).toHaveLength(1);
 fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Připravit podklad' }));
 expect(submit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'prepare', timelogIds: [id(3)] }));
 expect(Object.keys(submit.mock.calls[0][0]).sort()).toEqual(['kind', 'requestId', 'timelogIds']);
});

it('requires a validated current snapshot and drops a selected report if later reserved or excluded by history', () => {
 const submit = vi.fn(); const view = render(<BillingPrepareSelection snapshot={undefined} available busy={false} onCommand={submit} />);
 expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
 expect(screen.getByRole('button', { name: 'Připravit podklad' })).toBeDisabled();
 view.rerender(<BillingPrepareSelection snapshot={snapshot()} available={false} busy={false} onCommand={submit} />);
 expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
 view.rerender(<BillingPrepareSelection snapshot={snapshot()} available busy={false} onCommand={submit} />);
 fireEvent.click(screen.getByRole('checkbox'));
 const reserved = parseBillingSnapshot(billingSnapshotFixture(), { source: 'supabase', userId: id(2), profileId: id(1), role: 'coo' });
 reserved.statements[0].needsSourceVerification = true;
 view.rerender(<BillingPrepareSelection snapshot={reserved} available busy={false} onCommand={submit} />);
 expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
 expect(screen.getByRole('button', { name: 'Připravit podklad' })).toBeDisabled();
 fireEvent.click(screen.getByRole('button', { name: 'Připravit podklad' })); expect(submit).not.toHaveBeenCalled();
 view.rerender(<BillingPrepareSelection snapshot={snapshot()} available busy={false} onCommand={submit} />);
 expect(screen.getByRole('checkbox')).not.toBeChecked();
 fireEvent.click(screen.getByRole('checkbox'));
 const history = { ...snapshot(), supersededStatements: reserved.statements.map((s) => ({ ...s, needsSourceVerification: true, supersededByStatementId: id(100) })) };
 view.rerender(<BillingPrepareSelection snapshot={history} available busy={false} onCommand={submit} />);
 expect(screen.queryByRole('checkbox')).not.toBeInTheDocument(); expect(submit).not.toHaveBeenCalled();
});

it('rechecks report eligibility at the command boundary even before another render', () => {
 const submit = vi.fn(); render(<BillingPrepareSelection snapshot={snapshot()} available busy={false} onCommand={submit} />);
 fireEvent.click(screen.getByRole('checkbox')); io.status = 'invoiced';
 fireEvent.click(screen.getByRole('button', { name: 'Připravit podklad' })); expect(submit).not.toHaveBeenCalled();
});

it('consolidates two complete current canonical ready statements and does not let superseded history shadow their valid sources', () => {
 const submit = vi.fn(); const current = parseBillingSnapshot(billingSnapshotFixture(), { source: 'supabase', userId: id(2), profileId: id(1), role: 'coo' });
 const second = structuredClone(current.statements[0]); second.id = id(18); second.sources[0].statementId = second.id; second.sources[0].timelogId = id(13); second.sources[0].sourceSnapshot.timelogId = id(13); second.financialSnapshot.reports[0].timelogId = id(13);
 current.statements.push(second);
 const history = structuredClone(current.statements[0]); history.id = id(28); history.status = 'blocked'; history.blockedReason = 'statement_consolidated'; history.supersededByStatementId = id(8); history.sources.forEach((source) => { source.statementId = history.id; source.reserved = false; });
 current.supersededStatements = [history];
 io.extra = [{ id: 2, eid: 1, supabaseId: id(13), contractorProfileId: id(1), status: 'approved' }];
 render(<BillingPrepareSelection snapshot={current} available busy={false} onCommand={submit} />);
 expect(screen.getAllByRole('checkbox')).toHaveLength(2); screen.getAllByRole('checkbox').forEach((box) => fireEvent.click(box));
 fireEvent.click(screen.getByRole('button', { name: 'Připravit podklad' }));
 expect(submit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'prepare', timelogIds: [id(3), id(13)] }));
});
it.each(['document_pending', 'issued', 'uncertain'])('excludes current %s statements', (status) => {
 const current = parseBillingSnapshot(billingSnapshotFixture(), { source: 'supabase', userId: id(2), profileId: id(1), role: 'coo' });
 if (status === 'uncertain') current.statements[0].needsSourceVerification = true; else current.statements[0].status = status as 'issued' | 'document_pending';
 render(<BillingPrepareSelection snapshot={current} available busy={false} onCommand={vi.fn()} />);
 expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});
it('selects a whole current statement and refuses a partial command if any source becomes ineligible', () => {
 const submit = vi.fn(); const current = parseBillingSnapshot(billingSnapshotFixture(), { source: 'supabase', userId: id(2), profileId: id(1), role: 'coo' });
 const other = structuredClone(current.statements[0].sources[0]); other.timelogId = id(13); other.sourceSnapshot.timelogId = id(13); current.statements[0].sources.push(other);
 const report = structuredClone(current.statements[0].financialSnapshot.reports[0]); report.timelogId = id(13); current.statements[0].financialSnapshot.reports.push(report); current.statements[0].totalAmount *= 2; current.statements[0].financialSnapshot.totalAmount! *= 2;
 io.extra = [{ id: 2, eid: 1, supabaseId: id(13), contractorProfileId: id(1), status: 'approved' }];
 render(<BillingPrepareSelection snapshot={current} available busy={false} onCommand={submit} />);
 expect(screen.getAllByRole('checkbox')).toHaveLength(1); fireEvent.click(screen.getByRole('checkbox'));
 fireEvent.click(screen.getByRole('button', { name: 'Připravit podklad' }));
 expect(submit).toHaveBeenCalledWith(expect.objectContaining({ timelogIds: [id(3), id(13)] }));
 submit.mockClear(); io.extra[0].status = 'invoiced'; fireEvent.click(screen.getByRole('button', { name: 'Připravit podklad' })); expect(submit).not.toHaveBeenCalled();
});
