import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event } from '../../types';
import type { ShiftWorkflowManagementData } from './shift-workflows.management';
import CrewShiftWorkflowManagement, { CrewShiftWorkflowActions } from './CrewShiftWorkflowManagement';
import ShiftWorkflowSummary from './ShiftWorkflowSummary';

const mocks = vi.hoisted(() => ({
  role: 'crewhead' as 'crewhead' | 'coo' | 'crew', user: 'user1', ready: true,
  load: vi.fn(), save: vi.fn(), reload: vi.fn(),
}));
vi.mock('./useShiftWorkflows', () => ({ useShiftWorkflows: () => ({
  scope: { source: 'supabase', role: mocks.role, userId: mocks.user, profileId: 'manager' },
  scopeKey: `${mocks.user}:${mocks.role}`, ready: mocks.ready, save: mocks.save, reload: mocks.reload,
}) }));
vi.mock('./shift-workflows.management-loader', () => ({ loadShiftWorkflowManagementData: mocks.load }));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const time = '2026-09-23T11:00:00Z';
const events = [21, 22, 23].map((n) => ({ id: n, supabaseId: id(n), updatedAt: time, name: `Směna ${n}`,
  job: 'JOB', startDate: '2026-09-23', endDate: '2026-09-23' } as Event));
const data: ShiftWorkflowManagementData = {
  snapshot: { revision: 1, rounds: [], assignedEventIds: [], workflows: [{ id: id(10), eventIds: [id(21), id(22), id(23)], updatedAt: time }] },
  events, timelogs: [], invoices: [], eventCrewAssignments: [{ eventId: 21, eventSupabaseId: id(21), contractorProfileId: id(3), name: 'Petr' }],
};
const Surface = ({ profileId = id(3) }: { profileId?: string } = {}) => (
  <CrewShiftWorkflowManagement profileId={profileId}>
    <h2>Směny</h2><CrewShiftWorkflowActions /><ShiftWorkflowSummary event={events[0]} />
  </CrewShiftWorkflowManagement>
);

describe('crew detail workflow management boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.role = 'crewhead'; mocks.user = 'user1'; mocks.ready = true;
    mocks.load.mockResolvedValue(structuredClone(data)); mocks.save.mockResolvedValue(undefined);
  });

  it.each(['crewhead', 'coo'] as const)('offers %s a management action and a contextual badge', async (role) => {
    mocks.role = role; render(<Surface />);
    expect(await screen.findByRole('button', { name: 'Propojit směny' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Propojeno: 3 směny' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Upravit propojené směny');
    expect(screen.getByRole('checkbox', { name: /Směna 23 · JOB/ })).toBeChecked();
  });

  it('never reads management data or shows controls to crew', () => {
    mocks.role = 'crew'; render(<Surface />);
    expect(screen.getByText('Směny')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it('keeps existing shifts accessible when the new schema is unavailable', async () => {
    mocks.load.mockRejectedValue(new Error('schema unavailable')); render(<Surface />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Propojené směny se nepodařilo načíst');
    expect(screen.getByText('Směny')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Propojit směny' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zkusit načíst znovu' })).toBeInTheDocument();
  });

  it('opens a new empty selection and reloads after closing', async () => {
    render(<Surface />);
    fireEvent.click(await screen.findByRole('button', { name: 'Propojit směny' }));
    expect(screen.getByRole('checkbox', { name: /Směna 21 · JOB/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Zavřít' }));
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
  });

  it('immediately retires the open dialog when the selected person changes', async () => {
    const { rerender } = render(<Surface />);
    fireEvent.click(await screen.findByRole('button', { name: 'Propojeno: 3 směny' }));
    rerender(<Surface profileId={id(4)} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
  });

  it('does not expose late data from an old identity, even after switching back', async () => {
    let resolve!: (value: ShiftWorkflowManagementData) => void;
    mocks.load.mockReturnValueOnce(new Promise((done) => { resolve = done; })).mockResolvedValue({ ...data, snapshot: { ...data.snapshot, workflows: [] } });
    const { rerender } = render(<Surface />);
    mocks.user = 'user2'; rerender(<Surface />);
    await screen.findByRole('button', { name: 'Propojit směny' });
    mocks.user = 'user1'; rerender(<Surface />);
    await screen.findByRole('button', { name: 'Propojit směny' });
    await act(async () => { resolve(data); });
    expect(screen.queryByRole('button', { name: 'Propojeno: 3 směny' })).not.toBeInTheDocument();
  });
});
