import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Contractor, Event, Role, Timelog } from '../types';
import CrewDetailView from './CrewDetailView';

const mocks = vi.hoisted(() => ({ role: 'crewhead' as Role, load: vi.fn(), reload: vi.fn(), save: vi.fn(), detail: vi.fn() }));
vi.mock('../context/useAppContext', () => ({ useAppContext: () => ({ role: mocks.role, selectedContractorProfileId: 'person', darkMode: false }) }));
vi.mock('../features/crew/services/crew.service', () => ({ getCrewDetailData: mocks.detail, subscribeToCrewChanges: () => () => undefined, updateCrew: vi.fn() }));
vi.mock('../features/shift-workflows/useShiftWorkflows', () => ({ useShiftWorkflows: () => ({
  scope: { source: 'supabase', role: mocks.role, userId: 'manager', profileId: 'manager' }, scopeKey: mocks.role,
  ready: true, save: mocks.save, reload: mocks.reload,
}) }));
vi.mock('../features/shift-workflows/shift-workflows.management-loader', () => ({ loadShiftWorkflowManagementData: mocks.load }));
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: { div: ({ children }: { children: React.ReactNode }) => <div>{children}</div> },
}));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const event = { id: 21, supabaseId: id(21), name: 'Přípravy', job: 'JOB', startDate: '2027-01-01', endDate: '2027-01-01', projectId: 'P' } as Event;
const timelog = { id: 101, eid: 21, contractorProfileId: 'person', days: [], km: 0, note: '', status: 'draft' } as Timelog;
const contractor = { id: 1, profileId: 'person', name: 'Petr', ii: 'PH', bg: '#eee', fg: '#333', tags: [], events: 1, rate: 250,
  phone: '', email: '', ico: '', dic: '', bank: '', city: 'Praha', reliable: true, note: '' } as Contractor;

describe('workflow placement in crew detail', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.role = 'crewhead';
    mocks.detail.mockReturnValue({ contractor, events: [event], timelogs: [timelog], invoices: [],
      projects: [{ id: 'P', name: 'Projekt', job: 'JOB', client: 'Klient', createdAt: '2026-01-01' }] });
    mocks.load.mockResolvedValue({
      snapshot: { revision: 0, rounds: [], assignedEventIds: [], workflows: [{ id: id(10), eventIds: [id(21), id(22)], updatedAt: '2026-09-23T11:00:00Z' }] },
      events: [event, { ...event, id: 22, supabaseId: id(22), name: 'Instalace' }], timelogs: [], invoices: [],
      eventCrewAssignments: [{ eventId: 21, eventSupabaseId: id(21), contractorProfileId: 'person', name: 'Petr' }],
    });
  });
  it.each(['crewhead', 'coo'] as const)('places management in %s crew detail and preserves existing linked members', async (role) => {
    mocks.role = role; render(<CrewDetailView />);
    expect(await screen.findByRole('button', { name: 'Propojit směny' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Propojeno: 2 směny' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Instalace · JOB');
    expect(screen.queryByText('Fakturační skupina')).not.toBeInTheDocument();
  });
  it('does not expose management controls to crew', () => {
    mocks.role = 'crew'; render(<CrewDetailView />);
    expect(screen.queryByRole('button', { name: 'Propojit směny' })).not.toBeInTheDocument();
    expect(mocks.load).not.toHaveBeenCalled();
  });
});
