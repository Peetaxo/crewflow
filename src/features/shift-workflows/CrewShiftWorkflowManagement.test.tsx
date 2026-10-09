import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event, Timelog } from '../../types';
import type { ShiftWorkflowManagementData } from './shift-workflows.management';
import CrewShiftWorkflowManagement from './CrewShiftWorkflowManagement';
import ShiftWorkflowSummary from './ShiftWorkflowSummary';

const mocks = vi.hoisted(() => ({ role: 'crewhead' as 'crewhead' | 'coo' | 'crew', user: 'user1', ready: true, load: vi.fn(), save: vi.fn(), reload: vi.fn() }));
vi.mock('./useShiftWorkflows', () => ({ useShiftWorkflows: () => ({
  scope: { source: 'supabase', role: mocks.role, userId: mocks.user, profileId: 'manager' },
  scopeKey: `${mocks.user}:${mocks.role}`, ready: mocks.ready, save: mocks.save, reload: mocks.reload,
}) }));
vi.mock('./shift-workflows.management-loader', () => ({ loadShiftWorkflowManagementData: mocks.load }));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const time = '2026-09-23T11:00:00Z';
const events = [21, 22, 23].map((n) => ({ id: n, supabaseId: id(n), updatedAt: time, name: `Směna ${n}`, job: 'JOB', startDate: '2026-09-23', endDate: '2026-09-23' } as Event));
const makeData = (): ShiftWorkflowManagementData => ({
  snapshot: { revision: 1, rounds: [], assignedEventIds: [], workflows: [{ id: id(10), eventIds: [id(21), id(22), id(23)], updatedAt: time }] },
  events, timelogs: [{ id: 123, eventSupabaseId: id(23), contractorProfileId: id(3), status: 'draft' } as Timelog], invoices: [],
  eventCrewAssignments: [
    { eventId: 21, eventSupabaseId: id(21), contractorProfileId: id(3), name: 'Petr' },
    { eventId: 22, eventSupabaseId: id(22), contractorProfileId: id(4), name: 'Jana' },
  ],
});
const Surface = ({ profileId = id(3) }: { profileId?: string } = {}) => <CrewShiftWorkflowManagement profileId={profileId}><h2>Směny</h2>{events.map((event) => <ShiftWorkflowSummary key={event.id} event={event} />)}</CrewShiftWorkflowManagement>;

describe('personal read-only workflow overview', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.role = 'crewhead'; mocks.user = 'user1'; mocks.ready = true; mocks.load.mockResolvedValue(makeData()); });
  it.each(['crewhead', 'coo'] as const)('shows %s only assigned names without a button or historical unassigned event', async (role) => {
    mocks.role = role; render(<Surface />);
    const summary = await screen.findByText('Společná evidence: Směna 21'); expect(summary.closest('button')).toBeNull();
    expect(screen.queryByRole('button')).not.toBeInTheDocument(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText(/Společná evidence:.*Směna (22|23)/)).not.toBeInTheDocument(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it('does not read manager data for crew', () => { mocks.role = 'crew'; render(<Surface />); expect(screen.getByText('Směny')).toBeInTheDocument(); expect(mocks.load).not.toHaveBeenCalled(); });
  it('keeps other content available after a read failure and supports a read retry', async () => {
    mocks.load.mockRejectedValueOnce(new Error('unavailable')); render(<Surface />);
    expect(await screen.findByRole('alert')).toHaveTextContent('nepodařilo načíst'); expect(screen.getByText('Směny')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Zkusit načíst znovu' })); await screen.findByText('Společná evidence: Směna 21');
  });
  it('keys personal content by profile as well as account scope', async () => {
    const { rerender } = render(<Surface />); await screen.findByText('Společná evidence: Směna 21');
    rerender(<Surface profileId={id(4)} />); expect(screen.queryByText('Společná evidence: Směna 21')).not.toBeInTheDocument();
    await screen.findByText('Společná evidence: Směna 22'); expect(mocks.load.mock.calls[1][3]).toBe(id(4));
  });
  it('cannot publish late data after switching account and back', async () => {
    let resolve!: (value: ShiftWorkflowManagementData) => void;
    mocks.load.mockReturnValueOnce(new Promise((done) => { resolve = done; })).mockResolvedValue({ ...makeData(), eventCrewAssignments: [] });
    const { rerender } = render(<Surface />); mocks.user = 'user2'; rerender(<Surface />);
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2)); mocks.user = 'user1'; rerender(<Surface />);
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(3)); await act(async () => { resolve(makeData()); });
    expect(screen.queryByText(/Společná evidence/)).not.toBeInTheDocument(); expect(mocks.load.mock.calls[0][2].aborted).toBe(true);
  });
});
