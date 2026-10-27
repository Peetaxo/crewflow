import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event, Timelog } from '../types';
import MyShiftsView from './MyShiftsView';
import TimelogsView from './TimelogsView';

const data = vi.hoisted(() => ({ events: [] as Event[], timelogs: [] as Timelog[], mobile: true }));
vi.mock('../app/providers/useAuth', () => ({ useAuth: () => ({ currentProfileId: 'crew-1', profile: { firstName: 'Petr' } }) }));
vi.mock('../context/useAppContext', () => ({ useAppContext: () => {
  const [timelogFilter, setTimelogFilter] = useState('all');
  return { role: 'crew', darkMode: false, searchQuery: '', timelogFilter, setTimelogFilter,
    setCurrentTab: vi.fn(), setEditingTimelog: vi.fn(), setEventTab: vi.fn(), setSelectedEventId: vi.fn(), setSettingsSection: vi.fn() };
} }));
vi.mock('../hooks/use-mobile', () => ({ useIsMobile: () => data.mobile }));
vi.mock('../features/events/queries/useEventsQuery', () => ({ useEventsQuery: () => ({ data: data.events }) }));
vi.mock('../features/timelogs/queries/useTimelogsQuery', () => ({ useTimelogsQuery: () => ({ data: data.timelogs }) }));
vi.mock('../features/crew/services/crew.service', () => ({ getContractors: () => [], subscribeToCrewChanges: () => () => undefined }));
vi.mock('../features/projects/services/projects.service', () => ({ getProjects: () => [], subscribeToProjectChanges: () => () => undefined }));
vi.mock('../features/timelogs/services/timelogs.service', () => ({ getTimelogDependencies: () => ({ contractors: [], events: data.events }) }));
vi.mock('../features/timelogs/hooks/useTimelogApprovalActions', () => ({ useTimelogApprovalActions: () => ({ dialog: null, execute: vi.fn(), isPending: false }) }));
vi.mock('../features/shift-workflows/useSharedApprovals', () => ({ useSharedApprovals: () => ({
  cards: () => null, legacyOnly: (reports: Timelog[]) => reports, reviewSelection: () => false,
}) }));
vi.mock('recharts', async (importOriginal) => ({ ...await importOriginal<typeof import('recharts')>(), ResponsiveContainer: () => null }));

const report = (id: number, date: string, status: Timelog['status']): Timelog => ({
  id, eid: id, contractorProfileId: 'crew-1', status, days: [{ d: date, f: '09:00', t: '13:00', type: 'provoz' }], km: 0, note: '',
});

const openStatusOptions = () => {
  if (data.mobile) fireEvent.click(screen.getByRole('button', { name: /^Filtr výkazů:/ }));
};

describe('Crew overview and reports consistency', () => {
  beforeEach(() => {
    data.timelogs = [
      report(1, '2026-06-10', 'pending_ch'), report(2, '2026-08-01', 'pending_ch'), report(3, '2026-08-15', 'pending_ch'),
      report(4, '2026-06-01', 'approved'), report(5, '2026-07-01', 'invoiced'),
      report(6, '2026-07-02', 'paid'), report(7, '2026-07-03', 'approved'), report(8, '2026-06-26', 'draft'),
      { ...report(9, '2026-09-01', 'pending_ch'), contractorProfileId: 'other-crew' },
    ];
    data.events = data.timelogs.map(t => ({ id: t.eid, name: `Akce ${t.id}`, job: `JOB${t.id}`, startDate: t.days[0].d,
      endDate: t.days[0].d, city: 'Praha', needed: 1, filled: 1, status: 'past', client: 'Klient' }));
  });
  afterEach(cleanup);

  it.each([true, false])('defaults to the same all-period report scope as the overview (mobile=%s)', mobile => {
    data.mobile = mobile;
    const overview = render(<MyShiftsView />);
    const summary = screen.getByRole('region', { name: 'Výkazy' });
    expect(within(summary).getByText('Všechna období · počty výkazů')).toBeInTheDocument();
    expect(within(summary).getByRole('button', { name: 'Ve zpracování3' })).toBeInTheDocument();
    expect(within(summary).getByRole('button', { name: 'Schválené4' })).toBeInTheDocument();
    overview.unmount();

    render(<TimelogsView scope="mine" />);
    expect(screen.getByRole('button', { name: 'Všechna období', pressed: true })).toBeInTheDocument();
    openStatusOptions();
    expect(screen.getByRole('button', { name: 'Čeká na kontrolu 3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Schváleno 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fakturováno 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zaplaceno 1' })).toBeInTheDocument();
    expect(screen.queryByText('Akce 9')).not.toBeInTheDocument();
  });

  it.each([true, false])('applies a month only when selected and restores all months (mobile=%s)', mobile => {
    data.mobile = mobile;
    render(<TimelogsView scope="mine" />);
    fireEvent.click(screen.getByRole('button', { name: 'Po měsících' }));
    expect(screen.getByText('srpen 2026')).toBeInTheDocument();
    openStatusOptions();
    expect(screen.getByRole('button', { name: 'Čeká na kontrolu 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Schváleno 0' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Předchozí měsíc výkazů' }));
    expect(screen.getByText('červenec 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Schváleno 1' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Všechna období' }));
    expect(screen.getByRole('button', { name: 'Čeká na kontrolu 3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Schváleno 2' })).toBeInTheDocument();
  });

  it('explains the final approval total separately from individual invoicing statuses', () => {
    render(<MyShiftsView />);
    fireEvent.click(screen.getByRole('button', { name: 'Schválené4' }));
    expect(screen.getByText('Schválené, fakturované a zaplacené výkazy.')).toBeInTheDocument();
  });

  it('uses the loaded report month when reports arrive after the first render', () => {
    data.mobile = false;
    const loaded = data.timelogs;
    data.timelogs = [];
    const view = render(<TimelogsView scope="mine" />);
    data.timelogs = loaded;
    view.rerender(<TimelogsView scope="mine" />);
    fireEvent.click(screen.getByRole('button', { name: 'Po měsících' }));
    expect(screen.getByText('srpen 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Čeká na kontrolu 2' })).toBeInTheDocument();
  });
});
