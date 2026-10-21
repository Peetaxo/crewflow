import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Contractor, Event, Role, Timelog } from '../types';
import CrewDetailView from './CrewDetailView';
import { AuthContext, type AuthContextType } from '../app/providers/auth-context';

const mocks = vi.hoisted(() => ({ role: 'crewhead' as Role, detail: vi.fn(), back: vi.fn(), edit: vi.fn(), navigate: vi.fn(), selectEvent: vi.fn(), eventTab: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase: null }));
vi.mock('../context/useAppContext', () => ({ useAppContext: () => ({ role: mocks.role, selectedContractorProfileId: 'person',
  setSelectedContractorProfileId: mocks.back, setEditingTimelog: mocks.edit, setCurrentTab: mocks.navigate, setSelectedEventId: mocks.selectEvent, setEventTab: mocks.eventTab, darkMode: false }) }));
vi.mock('../features/crew/services/crew.service', () => ({ getCrewDetailData: mocks.detail, subscribeToCrewChanges: () => () => {}, updateCrew: vi.fn() }));
vi.mock('../features/shift-workflows/useSharedApprovals', () => ({ useSharedApprovals: () => ({ cards: () => null, legacyOnly: (reports: Timelog[]) => reports }) }));
vi.mock('../features/shift-workflows/CrewShiftWorkflowManagement', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('../features/shift-workflows/ShiftWorkflowSummary', () => ({ default: () => null }));
vi.mock('framer-motion', () => ({ AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>, motion: { div: ({ children }: { children: React.ReactNode }) => <div>{children}</div> } }));

const contractor = { id: 1, profileId: 'person', name: 'Jana Nováková', ii: 'JN', tags: [], rate: 250, phone: '+420 777 000 111', email: 'jana@example.cz', city: 'Praha', note: '', events: 2 } as Contractor;
const event = { id: 1, supabaseId: 'event-uuid', name: 'Stará instalace', job: 'JOB', startDate: '2026-01-01', endDate: '2026-01-01' } as Event;
const timelog = { id: 1, eid: 1, contractorProfileId: 'person', status: 'draft', days: [], km: 0, note: '' } as Timelog;
const renderDetail = () => render(<AuthContext.Provider value={{ isAuthenticated: false, isLoading: false, isDevSession: false, isRoleSwitching: false, role: 'coo', currentUserId: null, user: null, session: null } as AuthContextType}><CrewDetailView /></AuthContext.Provider>);
describe('crew personal detail', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.role = 'crewhead'; mocks.detail.mockReturnValue({ contractor, events: [event], projects: [], timelogs: [timelog], invoices: [] }); });
  it('handles a missing profile without crashing and provides a way back', () => {
    mocks.detail.mockReturnValue({ contractor: null, events: [], projects: [], timelogs: [], invoices: [] });
    renderDetail();
    expect(screen.getByText('Profil není dostupný')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Zpět na Crew/ }));
    expect(mocks.back).toHaveBeenCalledWith(null);
  });
  it.each(['crewhead', 'coo'] as const)('uses the same overview and contact actions for %s', (role) => {
    mocks.role = role; renderDetail();
    expect(screen.getByRole('heading', { name: 'Jana Nováková' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Zavolat/ })).toHaveAttribute('href', 'tel:+420777000111');
    expect(screen.getByRole('button', { name: /Nejbližší směna/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ke schválení/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /K proplacení/ })).toBeInTheDocument();
  });
  it('keeps past drafts accessible in reports and preserves role editing rules', () => {
    renderDetail();
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Výkazy/ }), { button: 0, ctrlKey: false });
    expect(screen.getByText('Stará instalace')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Upravit výkaz/ })).not.toBeInTheDocument();
  });
  it('opens a permitted report and shows an invoice empty state', () => {
    mocks.detail.mockReturnValue({ contractor, events: [event], projects: [], timelogs: [{ ...timelog, status: 'pending_ch' }], invoices: [] });
    renderDetail();
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Výkazy/ }), { button: 0, ctrlKey: false });
    fireEvent.click(screen.getByRole('button', { name: 'Upravit výkaz Stará instalace' }));
    expect(mocks.edit).toHaveBeenCalledWith(expect.objectContaining({ id: 1, status: 'pending_ch' }));
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Faktury/ }), { button: 0, ctrlKey: false });
    expect(screen.getByRole('tab', { name: /Faktury/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Zatím žádné faktury')).toBeInTheDocument();
  });
  it('places the visible disabled invitation directly below the COO member header', () => {
    mocks.role = 'coo'; renderDetail();
    const action = screen.getByRole('button', { name: 'Pozvat do aplikace' });
    expect(action).toBeDisabled();
    const header = screen.getByRole('heading', { name: 'Jana Nováková' }).closest('header');
    expect(header?.nextElementSibling).toContainElement(action);
    expect(screen.getByText('Pozvánky jsou zatím dostupné pouze v testovacím prostředí.')).toBeInTheDocument();
  });
  it('does not expose invitation management to crewheads', () => {
    renderDetail(); expect(screen.queryByRole('button', { name: 'Pozvat do aplikace' })).not.toBeInTheDocument();
  });
});
