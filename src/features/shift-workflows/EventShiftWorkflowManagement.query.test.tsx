import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event, Role } from '../../types';
import { ShiftWorkflowError, type ShiftWorkflowSnapshot } from './shift-workflows.contract';
import { EventShiftWorkflowDetails } from './EventShiftWorkflowManagement';
import { shiftWorkflowQueryKey, useShiftWorkflows } from './useShiftWorkflows';

const boundary = vi.hoisted(() => ({
  auth: { currentUserId: '00000000-0000-4000-8000-000000000001', currentProfileId: '00000000-0000-4000-8000-000000000002', role: 'crewhead' as Role, isAuthenticated: true, isLoading: false, isRoleSwitching: false },
  read: vi.fn(), save: vi.fn(), events: vi.fn(), reports: vi.fn(), invoices: vi.fn(),
}));
vi.mock('../../app/providers/useAuth', () => ({ useAuth: () => boundary.auth }));
vi.mock('../../context/useAppContext', () => ({ useAppContext: () => ({ role: boundary.auth.role }) }));
vi.mock('../../lib/app-config', () => ({ appDataSource: 'supabase' }));
vi.mock('./shift-workflows.gateway', () => ({ readShiftWorkflowSnapshot: (...args: unknown[]) => boundary.read(...args), saveShiftWorkflow: (...args: unknown[]) => boundary.save(...args) }));
vi.mock('../events/services/events.service', () => ({ fetchEventsSnapshot: boundary.events }));
vi.mock('../timelogs/services/timelogs.service', () => ({ fetchTimelogsSnapshot: boundary.reports }));
vi.mock('../invoices/services/invoices.service', () => ({ fetchInvoicesSnapshot: boundary.invoices }));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const time = '2026-10-09T11:00:00Z';
const events = ['Přípravy', 'Instalace'].map((name, i) => ({ id: i + 21, supabaseId: id(i + 21), name, job: 'JOB', startDate: '2026-10-09', endDate: '2026-10-09', updatedAt: time } as Event));
const snapshot = (linked = true): ShiftWorkflowSnapshot => ({ revision: linked ? 1 : 2, workflows: linked ? [{ id: id(10), eventIds: [id(21), id(22)], updatedAt: time }] : [], rounds: [], assignedEventIds: [] });
const clients: QueryClient[] = [];
function QueryPublicationProbe() {
  const workflows = useShiftWorkflows();
  return <output data-testid="published-snapshot">{workflows.query.data?.revision ?? 'pending'}:{workflows.query.isError ? 'error' : 'ready'}</output>;
}
function setup(strict = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  const scope = { source: 'supabase' as const, userId: boundary.auth.currentUserId, profileId: boundary.auth.currentProfileId, role: boundary.auth.role };
  if (strict) client.setQueryData(shiftWorkflowQueryKey(scope), snapshot());
  const tree = <QueryClientProvider client={client}><EventShiftWorkflowDetails event={events[0]} /><QueryPublicationProbe /></QueryClientProvider>;
  const view = render(strict ? <React.StrictMode>{tree}</React.StrictMode> : tree);
  return { ...view, client, key: shiftWorkflowQueryKey(scope) };
}
async function openEditorWithConflict() {
  fireEvent.click(await screen.findByRole('button', { name: 'Upravit propojení' }));
  await screen.findByRole('dialog'); fireEvent.click(screen.getByRole('button', { name: 'Uložit propojení' }));
  await screen.findByRole('button', { name: 'Obnovit data a ponechat výběr' });
}
const selectedMembers = () => within(screen.getByRole('dialog')).getAllByRole('checkbox').filter((checkbox) => (checkbox as HTMLInputElement).checked);

describe('event owner with real query publication', () => {
  beforeEach(() => {
    vi.clearAllMocks(); boundary.auth.role = 'crewhead'; boundary.auth.currentUserId = id(1);
    boundary.read.mockResolvedValue(snapshot()); boundary.save.mockRejectedValue(new ShiftWorkflowError('conflict', 'Data se změnila.'));
    boundary.events.mockResolvedValue(events); boundary.reports.mockResolvedValue([]); boundary.invoices.mockResolvedValue([]);
  });
  afterEach(() => clients.splice(0).forEach((client) => client.clear()));

  it('loads a cached linked overview through StrictMode activation replay', async () => {
    setup(true);
    expect(await screen.findByRole('button', { name: 'Upravit propojení' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Upravit propojení' })); await screen.findByRole('dialog');
    expect(selectedMembers()).toHaveLength(2);
  });

  it('keeps captured membership, missing-target blocking and explicit review after refresh publishes a deleted group', async () => {
    const { client, key } = setup(); await openEditorWithConflict(); expect(selectedMembers()).toHaveLength(2);
    boundary.read.mockResolvedValue(snapshot(false));
    fireEvent.click(screen.getByRole('button', { name: 'Obnovit data a ponechat výběr' }));
    await waitFor(() => expect(client.getQueryData(key)).toEqual(snapshot(false)));
    expect(await screen.findByRole('checkbox', { name: 'Zkontroloval jsem výběr po obnovení dat' })).not.toBeChecked();
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Upravit propojené směny'); expect(selectedMembers()).toHaveLength(2);
    expect(screen.getByRole('alert')).toHaveTextContent('Některá dotčená směna už není dostupná');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Zkontroloval jsem výběr po obnovení dat' }));
    expect(screen.getByRole('button', { name: 'Uložit propojení' })).toBeDisabled(); expect(boundary.save).toHaveBeenCalledOnce();
    expect(boundary.save.mock.calls[0][1]).toMatchObject({ workflowId: id(10), eventIds: [id(21), id(22)] });
  });

  it('keeps the editor and selection when a failed conflict refresh publishes query error, and permits explicit refresh retry', async () => {
    const { client, key } = setup(); await openEditorWithConflict();
    boundary.read.mockRejectedValueOnce(new Error('Read unavailable'));
    fireEvent.click(screen.getByRole('button', { name: 'Obnovit data a ponechat výběr' }));
    await waitFor(() => expect(client.getQueryState(key)?.status).toBe('error'));
    expect(await screen.findByRole('dialog')).toHaveAccessibleName('Upravit propojené směny'); expect(selectedMembers()).toHaveLength(2);
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('Propojení se nepodařilo bezpečně ověřit');
    boundary.read.mockResolvedValue(snapshot(false)); fireEvent.click(screen.getByRole('button', { name: 'Obnovit data a ponechat výběr' }));
    expect(await screen.findByRole('checkbox', { name: 'Zkontroloval jsem výběr po obnovení dat' })).not.toBeChecked();
    expect(selectedMembers()).toHaveLength(2); expect(screen.getByRole('button', { name: 'Uložit propojení' })).toBeDisabled();
  });

  it('keeps the opening snapshot when a background publication removes membership in the same event scope', async () => {
    const { client, key } = setup(); fireEvent.click(await screen.findByRole('button', { name: 'Upravit propojení' })); await screen.findByRole('dialog');
    await act(async () => { client.setQueryData(key, snapshot(false)); });
    await waitFor(() => expect(screen.getByTestId('published-snapshot')).toHaveTextContent('2:ready'));
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Upravit propojené směny'); expect(selectedMembers()).toHaveLength(2);
    expect(screen.queryByRole('checkbox', { name: 'Zkontroloval jsem výběr po obnovení dat' })).not.toBeInTheDocument();
  });

  it('does not read management data or expose a creation route for an initially unlinked event', async () => {
    boundary.read.mockResolvedValue(snapshot(false)); const { client, key } = setup();
    await waitFor(() => expect(client.getQueryData(key)).toEqual(snapshot(false)));
    await waitFor(() => expect(screen.getByTestId('published-snapshot')).toHaveTextContent('2:ready'));
    expect(screen.queryByRole('button')).not.toBeInTheDocument(); expect(boundary.events).not.toHaveBeenCalled();
    expect(boundary.read).toHaveBeenCalledOnce(); expect(boundary.save).not.toHaveBeenCalled();
  });
});
