import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Contractor, Event, Timelog } from '../../types';
const mocks = vi.hoisted(() => ({ hook: vi.fn(), open: vi.fn(), history: vi.fn(), timelogs: [] as Timelog[], events: [] as Event[] }));
vi.mock('./useShiftWorkflows', () => ({ useShiftWorkflows: mocks.hook }));
vi.mock('./shift-round-history', () => ({ readShiftRoundHistory: mocks.history }));
vi.mock('../../context/useAppContext', () => ({ useAppContext: () => ({ role: 'coo', setEditingTimelog: mocks.open }) }));
vi.mock('../timelogs/queries/useTimelogsQuery', () => ({ useTimelogsQuery: () => ({ data: mocks.timelogs }) }));
vi.mock('../events/queries/useEventsQuery', () => ({ useEventsQuery: () => ({ data: mocks.events }) }));
import { useSharedApprovals } from './useSharedApprovals';
const person = { profileId: 'person', name: 'Eva', rate: 100 } as Contractor;
const snapshot = { revision: 1, assignedEventIds: [], workflows: [], rounds: [{ id: 'round', workflowId: null, contractorProfileId: 'person', status: 'pending_coo', eventIds: ['e1', 'e2'], timelogIds: ['t1', 't2'], note: '', updatedAt: '2026-09-20T00:00:00Z' }] };
function Harness() {
  const shared = useSharedApprovals([mocks.timelogs[1]], [mocks.events[1]], [person]);
  return <>{shared.cards([mocks.timelogs[1]])}<button onClick={() => shared.reviewSelection([2])}>Review part</button><span>{shared.legacyOnly(mocks.timelogs).length} legacy</span></>;
}
describe('shared approval surfaces', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.timelogs = [1, 2, 3].map((id) => ({ id, eid: id, supabaseId: `t${id}`, eventSupabaseId: `e${id}`, contractorProfileId: 'person', status: id === 3 ? 'draft' : 'pending_coo', days: [{ d: '2026-09-20', f: '08:00', t: '10:00', type: 'provoz' }], km: 0, note: '' }));
    mocks.events = [1, 2, 3].map((id) => ({ id, supabaseId: `e${id}`, name: `Směna ${id}`, job: 'JOB' } as Event));
    mocks.hook.mockReturnValue({ scope: { source: 'supabase', userId: 'A', profileId: 'A', role: 'coo' }, scopeKey: 'A', ready: true, query: { data: snapshot } });
    mocks.history.mockResolvedValue([]);
  });
  it('renders a single complete round from a narrow event view and opens the canonical global editor', async () => {
    render(<Harness />);
    expect(screen.getAllByRole('region')).toHaveLength(1);
    expect(screen.getByText('Směna 1')).toBeInTheDocument();
    expect(screen.getByText('Směna 2')).toBeInTheDocument();
    expect(screen.queryByText('Směna 3')).not.toBeInTheDocument();
    expect(screen.getByText('1 legacy')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review part' }));
    expect(mocks.open).toHaveBeenCalledWith(mocks.timelogs[0]);
    await act(async () => undefined);
  });
  it('does not display a late history response after an identity switch', async () => {
    let resolve!: (value: unknown[]) => void;
    mocks.history.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const view = render(<Harness />);
    mocks.hook.mockReturnValue({ scope: { source: 'supabase', userId: 'B', profileId: 'B', role: 'coo' }, scopeKey: 'B', ready: false, query: { data: snapshot } });
    view.rerender(<Harness />);
    await act(async () => resolve([{ id: 'action', roundId: 'round', action: 'return', label: 'Vráceno', note: 'Private reason', createdAt: '2026-09-20T00:00:00Z', eventId: null }]));
    expect(screen.queryByText(/Private reason/)).not.toBeInTheDocument();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(screen.getByText('0 legacy')).toBeInTheDocument();
  });
});
