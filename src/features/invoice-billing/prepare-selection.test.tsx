import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { BillingPrepareSelection } from './BillingPrepareSelection';
import { id } from './test-fixtures';
vi.mock('../invoices/services/invoices.service', () => ({ getInvoiceDependencies: () => ({ contractors: [{ profileId: id(1), name: 'Jan' }], events: [{ id: 1, name: 'Třídenní akce', job: 'JOB' }], timelogs: [{ id: 1, eid: 1, supabaseId: id(3), contractorProfileId: id(1), status: 'approved', days: [{ d: '2026-10-01' }, { d: '2026-10-02' }, { d: '2026-10-03' }] }] }) }));
it('prepares one canonical report for three daily rows without issuing or guessing an amount', () => {
 const submit = vi.fn(); render(<BillingPrepareSelection busy={false} onCommand={submit} />);
 expect(screen.getAllByRole('checkbox')).toHaveLength(1);
 fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Připravit podklad' }));
 expect(submit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'prepare', timelogIds: [id(3)] }));
 expect(Object.keys(submit.mock.calls[0][0]).sort()).toEqual(['kind', 'requestId', 'timelogIds']);
});
