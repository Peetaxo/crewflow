import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Contractor, Event, Timelog } from '../../types';
import type { ShiftWorkflowScope, ShiftWorkflowSnapshot } from './shift-workflows.contract';
import { useSharedApprovals } from './useSharedApprovals';
import { shiftWorkflowQueryKey } from './useShiftWorkflows';

const boundary = vi.hoisted(() => ({ read: vi.fn(), open: vi.fn(), timelogs: vi.fn(), events: vi.fn(), history: vi.fn() }));
vi.mock('../../app/providers/useAuth', () => ({ useAuth: () => ({
  isAuthenticated: true, isLoading: false, isRoleSwitching: false, currentUserId: 'u1', currentProfileId: 'p1', role: 'crew',
}) }));
vi.mock('../../context/useAppContext', () => ({ useAppContext: () => ({ role: 'crew', setEditingTimelog: boundary.open }) }));
vi.mock('../../lib/app-config', () => ({ appDataSource: 'supabase' }));
vi.mock('./shift-workflows.gateway', () => ({ readShiftWorkflowSnapshot: boundary.read, saveShiftWorkflow: vi.fn() }));
vi.mock('../timelogs/services/timelogs.service', () => ({ fetchTimelogsSnapshot: boundary.timelogs }));
vi.mock('../events/services/events.service', () => ({ fetchEventsSnapshot: boundary.events }));
vi.mock('./shift-round-history', () => ({ readShiftRoundHistory: boundary.history }));
const scope: ShiftWorkflowScope = { source: 'supabase', userId: 'u1', profileId: 'p1', role: 'crew' };
const reports = [1, 2, 3].map((id) => ({ id, eid: id, supabaseId: `t${id}`, eventSupabaseId: `e${id}`,
  contractorProfileId: 'p1', status: id === 3 ? 'draft' : 'pending_crew_confirmation',
  days: [{ d: '2026-10-27', f: '08:00', t: '10:00', type: 'provoz' }], km: 0, note: '',
} as Timelog));
const events = [1, 2, 3].map((id) => ({ id, supabaseId: `e${id}`, name: `Směna ${id}`, job: 'JOB' } as Event));
const person = { profileId: 'p1', name: 'Eva', rate: 100 } as Contractor;
const snapshot: ShiftWorkflowSnapshot = { revision: 1, assignedEventIds: [], workflows: [], rounds: [{
  id: 'round', workflowId: null, contractorProfileId: 'p1', status: 'pending_crew_confirmation',
  eventIds: ['e1', 'e2'], timelogIds: ['t1', 't2'], note: '', updatedAt: '2026-10-27T12:00:00Z',
}] };
const clients: QueryClient[] = [];
let shared!: ReturnType<typeof useSharedApprovals>;
function Surface() {
  shared = useSharedApprovals(reports, events, [person]);
  return <>{shared.cards(reports)}<output>{shared.legacyOnly(reports).length} legacy</output></>;
}
beforeEach(() => {
  vi.clearAllMocks(); boundary.read.mockResolvedValue(snapshot); boundary.timelogs.mockResolvedValue(reports);
  boundary.events.mockResolvedValue(events); boundary.history.mockResolvedValue([]);
});
afterEach(() => clients.splice(0).forEach(client => client.clear()));

it('retains the complete cached shared report read-only after an actual refetch failure and restores review after success', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  render(<QueryClientProvider client={client}><Surface /></QueryClientProvider>);
  await screen.findByRole('region', { name: /^Společný výkaz/ });
  const review = screen.getByRole('button', { name: 'Zkontrolovat celý výkaz' });
  expect(review).toBeEnabled(); fireEvent.click(review); expect(boundary.open).toHaveBeenCalledWith(reports[0]); boundary.open.mockClear();
  boundary.read.mockRejectedValue(new Error('transport unavailable'));
  await act(async () => { await client.refetchQueries({ queryKey: shiftWorkflowQueryKey(scope), exact: true }); });
  await waitFor(() => expect(client.getQueryState(shiftWorkflowQueryKey(scope))?.status).toBe('error'));
  expect(client.getQueryData(shiftWorkflowQueryKey(scope))).toEqual(snapshot);
  expect(screen.getByRole('region', { name: /^Společný výkaz/ })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Směna 1' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Směna 2' })).toBeInTheDocument();
  expect(screen.getByText('1 legacy')).toBeInTheDocument();
  expect(screen.getByText('Společné výkazy se nepodařilo načíst. Obnovte data před rozhodnutím.')).toBeInTheDocument();
  expect(shared.ready).toBe(false);
  const cachedOpen = screen.getByRole('button', { name: 'Otevřít celý výkaz' }); expect(cachedOpen).toBeDisabled();
  fireEvent.click(cachedOpen); expect(boundary.open).not.toHaveBeenCalled();
  expect(() => shared.reviewSelection([reports[0].id])).toThrow(/Obnovte data/); expect(boundary.open).not.toHaveBeenCalled();
  boundary.read.mockResolvedValue({ ...snapshot, revision: 2 });
  await act(async () => { await client.refetchQueries({ queryKey: shiftWorkflowQueryKey(scope), exact: true }); });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Zkontrolovat celý výkaz' })).toBeEnabled());
  expect(shared.ready).toBe(true); fireEvent.click(screen.getByRole('button', { name: 'Zkontrolovat celý výkaz' }));
  expect(boundary.open).toHaveBeenCalledWith(reports[0]);
});
