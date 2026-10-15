import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { BillingPrepareModal } from './BillingPrepareModal';
import { parseBillingSnapshot, type BillingSnapshot } from './contract';
import { billingSnapshotFixture, id } from './test-fixtures';
const io = vi.hoisted(() => ({ snapshot: undefined as BillingSnapshot | undefined, error: null as Error | null, current: true, execute: vi.fn() }));
vi.mock('./useBilling', () => ({ useBilling: () => ({ ready: true, scopeKey: 'owner', scope: { role: 'coo' }, query: { data: io.snapshot, error: io.error }, capture: () => () => io.current, execute: io.execute, saving: false, canRetry: false }) }));
vi.mock('../invoices/services/invoices.service', () => ({ getInvoiceDependencies: () => ({ events: [], contractors: [], timelogs: [{ supabaseId: id(3), status: 'approved', eid: 1 }] }) }));
beforeEach(() => { io.snapshot = undefined; io.error = null; io.current = true; io.execute.mockReset().mockResolvedValue(undefined); });
it('keeps historical preparation unavailable while billing is delayed or failed, then submits only a validated unreserved report', () => {
 const view = render(<BillingPrepareModal onClose={vi.fn()} />);
 expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
 const raw = billingSnapshotFixture(); raw.statements = []; io.snapshot = parseBillingSnapshot(raw, { source: 'supabase', userId: id(2), profileId: id(1), role: 'coo' });
 io.error = new Error('read failed'); view.rerender(<BillingPrepareModal onClose={vi.fn()} />);
 expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
 io.error = null; view.rerender(<BillingPrepareModal onClose={vi.fn()} />);
 fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Připravit podklad' }));
 expect(io.execute).toHaveBeenCalledWith(expect.objectContaining({ timelogIds: [id(3)] }));
});

it('does not send a selected command after the captured data scope was retired', () => {
 const raw = billingSnapshotFixture(); raw.statements = []; io.snapshot = parseBillingSnapshot(raw, { source: 'supabase', userId: id(2), profileId: id(1), role: 'coo' });
 render(<BillingPrepareModal onClose={vi.fn()} />); fireEvent.click(screen.getByRole('checkbox'));
 io.current = false; fireEvent.click(screen.getByRole('button', { name: 'Připravit podklad' }));
 expect(io.execute).not.toHaveBeenCalled();
});
