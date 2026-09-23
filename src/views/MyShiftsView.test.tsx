import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event, Timelog, TimelogDay } from '../types';
import MyShiftsView from './MyShiftsView';

const data = vi.hoisted(() => ({ events: [] as Event[], timelogs: [] as Timelog[] }));

vi.mock('../app/providers/useAuth', () => ({
  useAuth: () => ({ currentProfileId: 'crew-1', profile: { firstName: 'Petr' } }),
}));
vi.mock('../context/useAppContext', () => ({
  useAppContext: () => ({
    darkMode: false,
    searchQuery: '',
    setCurrentTab: vi.fn(),
    setEditingTimelog: vi.fn(),
    setEventTab: vi.fn(),
    setSelectedEventId: vi.fn(),
    setTimelogFilter: vi.fn(),
    setSettingsSection: vi.fn(),
  }),
}));
vi.mock('../features/events/queries/useEventsQuery', () => ({ useEventsQuery: () => ({ data: data.events }) }));
vi.mock('../features/timelogs/queries/useTimelogsQuery', () => ({ useTimelogsQuery: () => ({ data: data.timelogs }) }));
vi.mock('../features/crew/services/crew.service', () => ({
  getContractors: () => [],
  subscribeToCrewChanges: () => () => undefined,
}));
vi.mock('../features/projects/services/projects.service', () => ({
  getProjects: () => [],
  subscribeToProjectChanges: () => () => undefined,
}));
vi.mock('recharts', async (importOriginal) => ({
  ...await importOriginal<typeof import('recharts')>(),
  ResponsiveContainer: () => null,
}));

const createEvent = (overrides: Partial<Event> = {}): Event => ({
  id: 1,
  supabaseId: `event-uuid-${overrides.id ?? 1}`,
  name: 'Veletrh',
  job: '',
  startDate: '2999-04-20',
  endDate: '2999-04-30',
  startTime: '14:00',
  endTime: '18:00',
  scheduleVersion: 2,
  city: 'Praha',
  needed: 1,
  filled: 1,
  status: 'upcoming',
  client: 'Klient',
  ...overrides,
});
const day = (d: string, f = '09:00'): TimelogDay => ({ d, f, t: '18:00', type: 'provoz' });
const createTimelog = (eid: number, days: TimelogDay[]): Timelog => ({
  id: eid,
  eid,
  contractorProfileId: 'crew-1',
  days,
  km: 0,
  note: '',
  status: 'draft',
});

describe('MyShiftsView next shift', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2999, 3, 20, 0, 30));
    data.events = [createEvent()];
    data.timelogs = [];
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('selects the event with the earliest remaining assigned date, ignoring event boundaries and past rows', () => {
    data.events.push(createEvent({ id: 2, name: 'Druhá akce', startDate: '2999-04-21' }));
    data.timelogs = [
      createTimelog(1, [day('2999-04-28'), day('2999-04-19')]),
      createTimelog(2, [day('2999-04-26'), day('2999-04-24', '10:00')]),
    ];

    render(<MyShiftsView />);

    const next = screen.getByRole('region', { name: 'Druhá akce' });
    expect(within(next).getByRole('heading', { name: 'Druhá akce' })).toBeInTheDocument();
    expect(within(next).getByText('24. 4. · 10:00')).toBeInTheDocument();
  });

  it('orders assigned clocks numerically across events on the same date', () => {
    data.events.push(createEvent({ id: 2, name: 'Ranní akce', startTime: '20:00' }));
    data.timelogs = [createTimelog(1, [day('2999-04-25', '10:00')]), createTimelog(2, [day('2999-04-25', '9:00')])];

    render(<MyShiftsView />);

    const next = screen.getByRole('region', { name: 'Ranní akce' });
    expect(within(next).getByText('25. 4. · 9:00')).toBeInTheDocument();
  });

  it('shows an undetermined clock for a dated assignment with no time', () => {
    data.timelogs = [createTimelog(1, [day('2999-04-25', '')])];

    render(<MyShiftsView />);

    const next = screen.getByRole('region', { name: 'Veletrh' });
    expect(within(next).getByText('25. 4. · Čas zatím neurčen')).toBeInTheDocument();
    expect(next).not.toHaveTextContent('14:00');
  });

  it.each([
    { days: [] },
    { days: [day('2999-04-19')] },
    { days: [day('')] },
  ])('does not invent a next shift without remaining dated assignments ($days)', ({ days }) => {
    data.timelogs = [createTimelog(1, days)];

    render(<MyShiftsView />);

    expect(screen.getByRole('region', { name: 'Zatím žádná směna' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rozpracované1' })).toBeInTheDocument();
  });

  it('renders without crashing when the only assigned future date is malformed', () => {
    data.timelogs = [createTimelog(1, [day('2999-4-25 ')])];

    expect(() => render(<MyShiftsView />)).not.toThrow();

    expect(screen.getByRole('region', { name: 'Zatím žádná směna' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rozpracované1' })).toBeInTheDocument();
  });

  it('recognizes an assignment whose event reference is the exact UUID alias', () => {
    data.timelogs = [{ ...createTimelog(1, [day('2999-04-25')]), eid: 'event-uuid-1' as unknown as number }];

    render(<MyShiftsView />);

    const next = screen.getByRole('region', { name: 'Veletrh' });
    expect(within(next).getByText('25. 4. · 09:00')).toBeInTheDocument();
  });

  it('retains event boundary display for legacy schedules', () => {
    data.events = [createEvent({ scheduleVersion: undefined })];
    data.timelogs = [createTimelog(1, [day('2999-04-25', '')])];

    render(<MyShiftsView />);

    const next = screen.getByRole('region', { name: 'Veletrh' });
    expect(within(next).getByText('20. 4. · 14:00')).toBeInTheDocument();
  });
});
